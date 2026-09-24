import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import {
  Badge,
  Body,
  Card,
  DataState,
  Field,
  PrimaryButton,
  SectionTitle,
  SubScreen,
} from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useApiData } from '../../src/hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../../src/hooks/useNow';
import { formatTemplate, useI18n } from '../../src/i18n';
import { googleMapsUrl } from '../../src/lot/helpers';
import { C, urgency } from '../../src/theme';

export default function OrderDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { api } = useAuth();
  const { t, formatNumber, formatDateTime, cropName, translateError } = useI18n();
  const router = useRouter();
  const now = useNow();
  const { data, loading, error, reload } = useApiData(() => api.getOrder(orderId), [orderId]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [weightInput, setWeightInput] = useState('');

  const cancel = (orderIdToCancel: number): void => {
    Alert.alert(t.orderDetail.cancelTitle, t.orderDetail.cancelBody, [
      { text: t.orderDetail.cancelNo, style: 'cancel' },
      {
        text: t.orderDetail.cancelYes,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            setBanner(null);
            try {
              await api.cancelOrder(orderIdToCancel);
              router.replace('/(tabs)/orders');
            } catch (err) {
              setBanner(
                err instanceof ApiError
                  ? translateError(err.code, err.message)
                  : t.orderDetail.cancelFailed,
              );
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <SubScreen title={t.orderDetail.title} onBack={() => router.replace('/(tabs)/orders')}>
      <DataState loading={loading} error={error} data={data} onRetry={reload}>
        {(order) => {
          const hours =
            order.expires_at !== undefined ? hoursLeftFrom(order.expires_at, now) : null;
          const tone = hours !== null ? urgency(hours) : null;
          const qty = order.quantity_kg ?? 0;
          const total =
            order.total ??
            (order.is_donation ? 0 : Math.round(order.agreed_price_per_kg * qty * 100) / 100);
          const lat = order.lat ?? order.plot_lat ?? null;
          const lng = order.lng ?? order.plot_lng ?? null;
          const active = order.status === 'reserved' || order.status === 'picked';
          const isSellerView = order.viewer === 'seller';
          const canBuyerCancel =
            !isSellerView && order.status === 'reserved' && order.batch_id === null;
          const cropTitle =
            order.crop_name_th !== undefined
              ? cropName({ name_th: order.crop_name_th, name_en: order.crop_name_en })
              : formatTemplate(t.orderDetail.lotFallback, { id: order.lot_id });
          const ripenessLabel =
            order.ripeness !== undefined
              ? t.ripenessLabels[order.ripeness] ?? String(order.ripeness)
              : null;

          const confirmSeller = (): void => {
            const weight = Number(weightInput);
            if (!/^\d{4}$/.test(otpInput.trim())) {
              setBanner(t.orderDetail.otpRequired);
              return;
            }
            if (!(weight > 0)) {
              setBanner(t.orderDetail.weightRequired);
              return;
            }
            setBusy(true);
            setBanner(null);
            void (async () => {
              try {
                await api.sellerConfirmOrder(order.id, {
                  otp: otpInput.trim(),
                  weight_kg: weight,
                });
                Alert.alert(t.orderDetail.deliverySuccessTitle, t.orderDetail.deliverySuccessBody);
                reload();
              } catch (err) {
                setBanner(
                  err instanceof ApiError
                    ? translateError(err.code, err.message)
                    : t.orderDetail.confirmFailed,
                );
              } finally {
                setBusy(false);
              }
            })();
          };

          return (
            <Body>
              {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
              <Text style={styles.meta}>
                {formatTemplate(t.orderDetail.orderMeta, { id: order.id })}
                {' · '}
                {formatDateTime(order.created_at)}
              </Text>

              <SectionTitle>{t.orderDetail.sectionItem}</SectionTitle>
              <Card>
                <Text style={styles.title}>{cropTitle}</Text>
                <Text style={styles.line}>
                  {order.grade === 'substandard' ? t.grade.substandard : t.grade.normal}
                  {ripenessLabel !== null
                    ? ` · ${formatTemplate(t.orderDetail.ripenessLine, { label: ripenessLabel })}`
                    : ''}
                </Text>
                <Text style={styles.line}>
                  {formatTemplate(t.orderDetail.quantity, { qty: formatNumber(qty) })}
                </Text>
                <Text style={styles.line}>
                  {order.is_donation
                    ? t.orderDetail.donationNoCharge
                    : formatTemplate(t.orderDetail.priceTotal, {
                        price: formatNumber(order.agreed_price_per_kg),
                        total: formatNumber(total),
                      })}
                </Text>
                <Badge
                  text={t.status[order.status] ?? order.status}
                  fg={C.leaf}
                  bg={C.leafSoft}
                />
              </Card>

              <SectionTitle>{t.orderDetail.sectionPickup}</SectionTitle>
              <Card>
                <Text style={styles.line}>
                  {order.plot_name ?? t.orderDetail.sellerPlotFallback}
                </Text>
                {order.distance_km !== null && order.distance_km !== undefined ? (
                  <Text style={styles.line}>
                    {formatTemplate(t.orderDetail.approxDistance, {
                      km: order.distance_km.toFixed(1),
                    })}
                  </Text>
                ) : null}
                {lat !== null && lng !== null ? (
                  <PrimaryButton
                    label={t.orderDetail.openMaps}
                    onPress={() => void Linking.openURL(googleMapsUrl(lat, lng))}
                  />
                ) : (
                  <Text style={styles.muted}>{t.orderDetail.coordsHidden}</Text>
                )}
              </Card>

              {hours !== null && tone !== null ? (
                <>
                  <SectionTitle>{t.orderDetail.sectionDeadline}</SectionTitle>
                  <Card>
                    <Badge text={formatCountdown(hours, t.countdown)} fg={tone.fg} bg={tone.bg} />
                    <Text style={styles.muted}>{t.orderDetail.deadlineHint}</Text>
                  </Card>
                </>
              ) : null}

              <SectionTitle>{t.orderDetail.sectionNextSteps}</SectionTitle>
              <Card>
                <Text style={styles.step}>{t.orderDetail.step1}</Text>
                <Text style={styles.step}>{t.orderDetail.step2}</Text>
                <Text style={styles.step}>{t.orderDetail.step3}</Text>
                <Text style={styles.step}>{t.orderDetail.step4}</Text>
              </Card>

              {active && !isSellerView ? (
                <>
                  <SectionTitle>{t.orderDetail.sectionOtp}</SectionTitle>
                  <Card>
                    <View style={styles.otpBox}>
                      <Text style={styles.otpLabel}>{t.orderDetail.otpLabel}</Text>
                      <Text style={styles.otpValue}>{order.drop_otp}</Text>
                    </View>
                  </Card>
                </>
              ) : null}

              <SectionTitle>{t.orderDetail.sectionTimeline}</SectionTitle>
              <Card>
                <Text style={styles.step}>
                  ● {t.orderDetail.timelineReserved}
                  {order.status === 'reserved' || order.status === 'picked' || order.status === 'delivered'
                    ? ' ✓'
                    : ''}
                </Text>
                <Text style={styles.muted}>○ {t.orderDetail.timelinePayment}</Text>
                <Text style={styles.step}>
                  {order.status === 'picked' || order.status === 'delivered' ? '●' : '○'}{' '}
                  {t.orderDetail.timelinePicked}
                  {order.status === 'delivered' ? ' ✓' : ''}
                </Text>
              </Card>

              {isSellerView && order.status === 'reserved' ? (
                <>
                  <SectionTitle>{t.orderDetail.sectionSellerConfirm}</SectionTitle>
                  <Card>
                    <Text style={styles.muted}>{t.orderDetail.sellerConfirmHint}</Text>
                    <Field
                      label={t.orderDetail.otpField}
                      value={otpInput}
                      onChangeText={setOtpInput}
                      keyboardType="number-pad"
                    />
                    <Field
                      label={t.orderDetail.actualWeight}
                      value={weightInput}
                      onChangeText={setWeightInput}
                      keyboardType="numeric"
                      placeholder={String(qty)}
                    />
                    <PrimaryButton
                      label={t.orderDetail.confirmDelivery}
                      loading={busy}
                      onPress={confirmSeller}
                    />
                  </Card>
                </>
              ) : null}

              {canBuyerCancel ? (
                <PrimaryButton
                  label={t.orderDetail.cancelBooking}
                  tone="chili"
                  loading={busy}
                  onPress={() => cancel(order.id)}
                />
              ) : null}
            </Body>
          );
        }}
      </DataState>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  banner: { color: C.chili, marginBottom: 10, fontWeight: '600' },
  meta: { color: C.mute, fontSize: 12, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 6 },
  line: { color: C.ink, marginBottom: 4 },
  muted: { color: C.mute, marginTop: 6, lineHeight: 20 },
  step: { color: C.ink, marginBottom: 6, lineHeight: 20 },
  otpBox: { backgroundColor: C.leafSoft, borderRadius: 12, padding: 12, alignItems: 'center' },
  otpLabel: { color: C.mute, marginBottom: 4 },
  otpValue: { fontSize: 40, fontWeight: '900', color: C.leaf, letterSpacing: 8 },
});
