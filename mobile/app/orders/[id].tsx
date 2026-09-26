import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { FormField, useFieldErrors, useFieldScroll } from '../../src/components/form';
import { formatIsoSlotShort } from '../../src/components/PickupSlotPicker';
import {
  Badge,
  Body,
  Card,
  DataState,
  PrimaryButton,
  SecondaryButton,
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
  const { t, formatNumber, formatDateTime, cropName, translateError, locale } = useI18n();
  const router = useRouter();
  const now = useNow();
  const { data, loading, error, reload } = useApiData(() => api.getOrder(orderId), [orderId]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const { errors, setErrors, setFieldError } = useFieldErrors();
  const { scrollRef, registerY, scrollToField } = useFieldScroll();

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
          const pickupLabel =
            order.location_label ?? order.plot_name ?? t.orderDetail.sellerPlotFallback;
          const contact = order.contact ?? null;
          const advice = order.advice ?? null;
          const adviceWhen =
            advice !== null && advice.consumeBy !== undefined
              ? formatDateTime(advice.consumeBy)
              : '';

          const confirmSeller = (): void => {
            const weight = Number(weightInput);
            const nextErrors: Record<string, string> = {};
            if (!/^\d{4}$/.test(otpInput.trim())) {
              nextErrors.otp = t.orderDetail.otpRequired;
            }
            if (!(weight > 0)) {
              nextErrors.weight = t.orderDetail.weightRequired;
            }
            setErrors(nextErrors);
            if (Object.keys(nextErrors).length > 0) {
              scrollToField(Object.keys(nextErrors)[0] ?? null);
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
                if (err instanceof ApiError && err.code === 'OTP_MISMATCH') {
                  setFieldError('otp', translateError(err.code, err.message));
                } else {
                  setBanner(
                    err instanceof ApiError
                      ? translateError(err.code, err.message)
                      : t.orderDetail.confirmFailed,
                  );
                }
              } finally {
                setBusy(false);
              }
            })();
          };

          const nextAction =
            isSellerView && order.status === 'reserved'
              ? t.orderDetail.confirmDelivery
              : active && !isSellerView
                ? t.orderDetail.otpLabel
                : t.orderDetail.step1;

          return (
            <Body scrollRef={scrollRef}>
              <View style={styles.priorityBox}>
                <Badge
                  text={t.status[order.status] ?? order.status}
                  fg={order.status === 'cancelled' ? C.mute : order.status === 'expired' ? C.urgentFg : C.leaf}
                  bg={order.status === 'cancelled' ? '#E9ECE6' : order.status === 'expired' ? C.urgentBg : C.leafSoft}
                />
                <Text style={styles.nextAction}>{nextAction}</Text>
                {hours !== null && tone !== null ? (
                  <Badge text={formatCountdown(hours, t.countdown)} fg={tone.fg} bg={tone.bg} />
                ) : null}
              </View>
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
                <Text style={styles.line}>{pickupLabel}</Text>
                {order.pickup_slot_start != null && order.pickup_slot_end != null ? (
                  <Text style={styles.slot}>
                    {t.orderDetail.pickupSlot}:{' '}
                    {formatIsoSlotShort(order.pickup_slot_start, order.pickup_slot_end, {
                      today: t.confirmBooking.today,
                      tomorrow: t.confirmBooking.tomorrow,
                    })}
                  </Text>
                ) : null}
                {order.distance_km !== null && order.distance_km !== undefined ? (
                  <Text style={styles.line}>
                    {formatTemplate(t.orderDetail.approxDistance, {
                      km: order.distance_km.toFixed(1),
                    })}
                  </Text>
                ) : null}
                {lat !== null && lng !== null ? (
                  <SecondaryButton
                    label={t.orderDetail.openMaps}
                    onPress={() => void Linking.openURL(googleMapsUrl(lat, lng))}
                  />
                ) : (
                  <Text style={styles.muted}>{t.orderDetail.coordsHidden}</Text>
                )}
              </Card>

              {contact !== null ? (
                <>
                  <SectionTitle>{t.orderDetail.sectionContact}</SectionTitle>
                  <Card>
                    <Text style={styles.line}>{contact.name}</Text>
                    <Text style={styles.muted}>{t.orderDetail.contactHint}</Text>
                    {contact.phone !== '' ? (
                      <PrimaryButton
                        label={`${t.orderDetail.call} ${contact.phone}`}
                        onPress={() => void Linking.openURL(`tel:${contact.phone}`)}
                      />
                    ) : null}
                    {contact.line_id != null && contact.line_id !== '' ? (
                      <PrimaryButton
                        label={t.orderDetail.openLine}
                        onPress={() =>
                          void Linking.openURL(`https://line.me/ti/p/~${contact.line_id}`)
                        }
                      />
                    ) : null}
                  </Card>
                </>
              ) : null}

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

              {advice !== null && order.status === 'delivered' ? (
                <>
                  <SectionTitle>{t.orderDetail.sectionAdvice}</SectionTitle>
                  <Card>
                    <Text style={styles.adviceMain}>
                      {advice.audience === 'distribute'
                        ? formatTemplate(t.orderDetail.adviceDistribute, { when: adviceWhen })
                        : advice.audience === 'sell'
                          ? formatTemplate(t.orderDetail.adviceSell, { when: adviceWhen })
                          : formatTemplate(t.orderDetail.adviceEat, { when: adviceWhen })}
                    </Text>
                    {advice.fridgeUntil !== null ? (
                      <Text style={styles.line}>
                        {formatTemplate(t.orderDetail.adviceFridge, {
                          when: formatDateTime(advice.fridgeUntil),
                        })}
                      </Text>
                    ) : null}
                    {advice.priceDropHint ? (
                      <Text style={styles.adviceWarn}>{t.orderDetail.advicePriceDrop}</Text>
                    ) : null}
                    {advice.storageTipEn !== null || advice.storageTipTh !== null ? (
                      <Text style={styles.muted}>
                        {formatTemplate(t.orderDetail.adviceTip, {
                          tip: (locale === 'en'
                            ? advice.storageTipEn
                            : advice.storageTipTh) ??
                            advice.storageTipTh ??
                            advice.storageTipEn ??
                            '',
                        })}
                      </Text>
                    ) : null}
                  </Card>
                </>
              ) : null}

              {isSellerView && order.status === 'reserved' ? (
                <>
                  <SectionTitle>{t.orderDetail.sectionSellerConfirm}</SectionTitle>
                  <Card>
                    <Text style={styles.muted}>{t.orderDetail.sellerConfirmHint}</Text>
                    <FormField
                      label={t.orderDetail.otpField}
                      name="otp"
                      value={otpInput}
                      onChangeText={(text) => {
                        setOtpInput(text);
                        setFieldError('otp', null);
                      }}
                      onBlurField={() => undefined}
                      fieldRef={registerY}
                      error={errors.otp}
                      keyboardType="number-pad"
                    />
                    <FormField
                      label={t.orderDetail.actualWeight}
                      name="weight"
                      value={weightInput}
                      onChangeText={(text) => {
                        setWeightInput(text);
                        setFieldError('weight', null);
                      }}
                      onBlurField={() => undefined}
                      fieldRef={registerY}
                      error={errors.weight}
                      keyboardType="numeric"
                      placeholder={String(qty)}
                    />
                    <PrimaryButton
                      label={t.orderDetail.confirmDelivery}
                      block
                      loading={busy}
                      onPress={confirmSeller}
                    />
                  </Card>
                </>
              ) : null}

              {canBuyerCancel ? (
                <SecondaryButton
                  tone="danger"
                  label={t.orderDetail.cancelBooking}
                  block
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
  priorityBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  nextAction: { flex: 1, minWidth: 120, fontWeight: '600', color: C.ink, fontSize: 14 },
  title: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 6 },
  line: { color: C.ink, marginBottom: 4 },
  slot: { color: C.leafDeep, fontWeight: '600', marginBottom: 6 },
  muted: { color: C.mute, marginTop: 6, lineHeight: 20 },
  step: { color: C.ink, marginBottom: 6, lineHeight: 20 },
  adviceMain: { color: C.leafDeep, fontWeight: '700', fontSize: 16, marginBottom: 6 },
  adviceWarn: { color: C.soonFg, fontWeight: '600', marginTop: 4, marginBottom: 4 },
  otpBox: { backgroundColor: C.leafSoft, borderRadius: 12, padding: 12, alignItems: 'center' },
  otpLabel: { color: C.mute, marginBottom: 4 },
  otpValue: { fontSize: 40, fontWeight: '900', color: C.leaf, letterSpacing: 8 },
});
