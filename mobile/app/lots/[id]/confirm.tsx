import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../../src/api/client';
import {
  Body,
  Card,
  DataState,
  PrimaryButton,
  SecondaryButton,
  SubScreen,
} from '../../../src/components/ui';
import { PickupSlotPicker } from '../../../src/components/PickupSlotPicker';
import { useAuth } from '../../../src/context/AuthContext';
import { useApiData } from '../../../src/hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../../../src/hooks/useNow';
import { formatTemplate, useI18n } from '../../../src/i18n';
import { remainingOf } from '../../../src/lot/helpers';
import { C } from '../../../src/theme';

export default function LotConfirmScreen(): React.ReactElement {
  const { id, intent, qty } = useLocalSearchParams<{ id: string; intent?: string; qty?: string }>();
  const lotId = Number(id);
  const quantityKg = Number(qty ?? '0');
  const donation = intent === 'donate';
  const { api, user, refreshUser } = useAuth();
  const { t, formatNumber, cropName, translateError } = useI18n();
  const router = useRouter();
  const now = useNow();
  const lat = user?.lat ?? 13.65;
  const lng = user?.lng ?? 100.62;
  const needsPlace =
    user?.donor_tier === 'volunteer' ||
    user?.donor_tier === 'trusted_volunteer' ||
    user?.distribution_mode === 'redistribute';

  const { data, loading, error, reload } = useApiData(
    () => api.getMarketLot(lotId, lat, lng),
    [lotId, lat, lng],
  );
  const slots = useApiData(() => api.getPickupSlots(lotId), [lotId, donation]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedSlot = slots.data?.slots.find((s) => s.key === selectedKey) ?? null;

  const confirm = async (): Promise<void> => {
    setBanner(null);
    setSlotError(null);
    if (!donation) {
      if (selectedSlot === null) {
        setSlotError(t.confirmBooking.needSlot);
        return;
      }
      if (!selectedSlot.available) {
        setSlotError(t.confirmBooking.slotUnavailable);
        return;
      }
    }
    setBusy(true);
    try {
      const extras: {
        distribution_place?: string;
        distribution_at?: string;
        pickup_slot_start?: string;
        pickup_slot_end?: string;
      } = {};
      if (donation && needsPlace) {
        extras.distribution_place = t.confirmBooking.distributionPlaceDefault;
        extras.distribution_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }
      if (selectedSlot !== null) {
        extras.pickup_slot_start = selectedSlot.start_at;
        extras.pickup_slot_end = selectedSlot.end_at;
      }
      const result = await api.createOrder(lotId, donation, quantityKg, extras);
      await refreshUser();
      router.replace({
        pathname: '/lots/[id]/success',
        params: { id: String(lotId), orderId: String(result.order.id) },
      });
    } catch (err) {
      setBanner(
        err instanceof ApiError
          ? translateError(err.code, err.message)
          : t.confirmBooking.failed,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubScreen
      title={t.confirmBooking.title}
      onBack={() =>
        router.replace({
          pathname: '/lots/[id]',
          params: { id: String(lotId), intent: donation ? 'donate' : 'buy' },
        })
      }
    >
      <DataState loading={loading} error={error} data={data} onRetry={reload}>
        {(lot) => {
          const hours = hoursLeftFrom(lot.expires_at, now);
          const total =
            !donation && lot.price_per_kg !== null
              ? Math.round(lot.price_per_kg * quantityKg)
              : null;
          const place = lot.plot_name ?? t.confirmBooking.sellerPlotFallback;
          const placeLine = formatTemplate(t.confirmBooking.pickupArea, { place });
          return (
            <Body>
              {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
              <Card>
                <Text style={styles.title}>
                  {cropName({ name_th: lot.crop_name_th, name_en: lot.crop_name_en })}
                </Text>
                <Text style={styles.line}>
                  {formatTemplate(t.confirmBooking.qtyRemaining, {
                    qty: formatNumber(quantityKg),
                    remaining: formatNumber(remainingOf(lot)),
                  })}
                </Text>
                <Text style={styles.line}>
                  {donation
                    ? t.confirmBooking.donationType
                    : formatTemplate(t.confirmBooking.purchaseType, {
                        price:
                          lot.price_per_kg !== null
                            ? formatNumber(lot.price_per_kg)
                            : t.common.dash,
                      })}
                </Text>
                {total !== null ? (
                  <Text style={styles.total}>
                    {formatTemplate(t.confirmBooking.approxTotal, { total: formatNumber(total) })}
                  </Text>
                ) : null}
                <Text style={styles.line}>
                  {placeLine}
                  {lot.distance_km !== null && lot.distance_km !== undefined
                    ? ` · ~${lot.distance_km.toFixed(1)} ${t.market.km}`
                    : ''}
                </Text>
                <Text style={styles.line}>
                  {formatTemplate(t.confirmBooking.timeLeft, {
                    countdown: formatCountdown(hours, t.countdown),
                  })}
                </Text>
                <Text style={styles.terms}>{t.confirmBooking.terms}</Text>
              </Card>

              {slots.loading && slots.data === null ? (
                <Text style={styles.slotLoad}>{t.common.loading}</Text>
              ) : null}
              {slots.error !== null && slots.data === null ? (
                <Text style={styles.banner}>{slots.error}</Text>
              ) : null}
              {slots.data !== null && slots.data.slots.length > 0 ? (
                <Card>
                  <PickupSlotPicker
                    slots={slots.data.slots}
                    selectedKey={selectedKey}
                    onSelect={(key) => {
                      setSelectedKey(key);
                      setSlotError(null);
                    }}
                  />
                  {slotError !== null ? <Text style={styles.banner}>{slotError}</Text> : null}
                  {selectedSlot !== null && selectedSlot.available ? (
                    <Text style={styles.selected}>
                      {formatTemplate(t.confirmBooking.slotRange, {
                        day:
                          selectedSlot.day === 'today'
                            ? t.confirmBooking.today
                            : t.confirmBooking.tomorrow,
                        start: (() => {
                          const d = new Date(selectedSlot.start_at);
                          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        })(),
                        end: (() => {
                          const d = new Date(selectedSlot.end_at);
                          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        })(),
                      })}
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              <PrimaryButton
                label={donation ? t.confirmBooking.confirmDonate : t.confirmBooking.confirmBuy}
                tone={donation ? 'turmeric' : undefined}
                block
                loading={busy}
                onPress={() => void confirm()}
              />
              <SecondaryButton
                label={t.confirmBooking.goBack}
                block
                onPress={() =>
                  router.replace({
                    pathname: '/lots/[id]',
                    params: { id: String(lotId), intent: donation ? 'donate' : 'buy' },
                  })
                }
              />
            </Body>
          );
        }}
      </DataState>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  banner: { color: C.chili, marginBottom: 10, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '800', color: C.ink, marginBottom: 8 },
  line: { color: C.ink, marginBottom: 4 },
  total: { fontSize: 16, fontWeight: '700', color: C.leaf, marginVertical: 6 },
  terms: { color: C.mute, marginTop: 10, lineHeight: 20 },
  slotLoad: { color: C.mute, marginBottom: 8 },
  selected: { color: C.leafDeep, fontWeight: '600', marginTop: 4 },
});
