import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL } from '../../../src/api/config';
import type { MarketLot } from '../../../src/api/types';
import {
  Badge,
  Body,
  Card,
  DataState,
  PrimaryButton,
  SecondaryButton,
  SubScreen,
} from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { useApiData } from '../../../src/hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../../../src/hooks/useNow';
import {
  availableAsOf,
  defaultQuantity,
  donationEligibility,
  marketSaleBadge,
  minOrderOf,
  remainingOf,
  roundQty,
  splitAllowedOf,
  stepOf,
} from '../../../src/lot/helpers';
import { C, urgency } from '../../../src/theme';

function photoUri(lot: MarketLot): string | null {
  const raw = lot.photos?.[0] ?? lot.photo_url ?? null;
  if (raw === null || raw === '') {
    return null;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

export default function LotDetailScreen(): React.ReactElement {
  const { id, intent } = useLocalSearchParams<{ id: string; intent?: string }>();
  const lotId = Number(id);
  const { api, user } = useAuth();
  const router = useRouter();
  const now = useNow();
  const lat = user?.lat ?? undefined;
  const lng = user?.lng ?? undefined;
  const donationIntent = intent === 'donate';

  const { data, loading, error, reload } = useApiData(
    () => api.getPublicLot(lotId, lat, lng),
    [lotId, lat, lng, user?.id],
  );

  const [quantityKg, setQuantityKg] = useState(1);
  const [quantityError, setQuantityError] = useState<string | null>(null);

  useEffect(() => {
    if (data !== null) {
      setQuantityKg(defaultQuantity(data));
      setQuantityError(null);
    }
  }, [data]);

  const adjustQuantity = (lot: MarketLot, deltaSteps: number): void => {
    const remaining = remainingOf(lot);
    const step = stepOf(lot);
    const min = minOrderOf(lot);
    if (!splitAllowedOf(lot) || remaining + 1e-6 < min) {
      setQuantityKg(remaining);
      setQuantityError(null);
      return;
    }
    const next = roundQty(quantityKg + deltaSteps * step);
    if (next + 1e-6 < min) {
      setQuantityKg(min);
    } else if (next - remaining > 1e-6) {
      setQuantityKg(remaining);
    } else {
      setQuantityKg(next);
    }
    setQuantityError(null);
  };

  const requireLogin = (nextIntent: 'buy' | 'donate'): void => {
    router.push({
      pathname: '/login',
      params: { returnTo: `/lots/${lotId}?intent=${nextIntent}` },
    });
  };

  const goConfirm = (lot: MarketLot): void => {
    if (user === null) {
      requireLogin(donationIntent ? 'donate' : 'buy');
      return;
    }
    if (!user.can_buy) {
      router.push('/(tabs)/account');
      return;
    }
    const remaining = remainingOf(lot);
    const min = minOrderOf(lot);
    if (splitAllowedOf(lot) && remaining + 1e-6 >= min && quantityKg + 1e-6 < min) {
      setQuantityError(`ขั้นต่ำ ${min} กก.`);
      return;
    }
    if (quantityKg - remaining > 1e-6) {
      setQuantityError('เกินจำนวนคงเหลือ');
      return;
    }
    router.push({
      pathname: '/lots/[id]/confirm',
      params: {
        id: String(lot.id),
        intent: donationIntent ? 'donate' : 'buy',
        qty: String(quantityKg),
      },
    });
  };

  return (
    <SubScreen title="รายละเอียดล็อต" onBack={() => router.replace('/(tabs)')}>
      <DataState loading={loading} error={error} data={data} onRetry={reload}>
        {(lot) => {
          const hours = hoursLeftFrom(lot.expires_at, now);
          const tone = urgency(hours);
          const remaining = remainingOf(lot);
          const available = availableAsOf(lot);
          const elig = donationEligibility(user, lot, quantityKg);
          const saleBadge = marketSaleBadge(lot);
          const canDonateAction =
            donationIntent && (user === null || elig.canDonate) && available.includes('donate');
          const canBuyAction =
            !donationIntent && available.includes('buy') && lot.price_per_kg !== null;
          const uri = photoUri(lot);
          return (
            <Body>
              {uri !== null ? (
                <Image source={{ uri }} style={styles.hero} resizeMode="cover" />
              ) : null}
              <Card>
                <View style={styles.header}>
                  <Text style={styles.title}>{lot.crop_name_th}</Text>
                  <Badge text={formatCountdown(hours)} fg={tone.fg} bg={tone.bg} />
                </View>
                {saleBadge !== null ? (
                  <Badge
                    text={saleBadge.text}
                    fg={saleBadge.donate ? C.turmeric : C.leaf}
                    bg={saleBadge.donate ? C.turmericSoft : C.leafSoft}
                  />
                ) : null}
                {lot.farmer_name !== undefined && lot.farmer_name !== '' ? (
                  <Text style={styles.line}>โดย {lot.farmer_name}</Text>
                ) : null}
                <Text style={styles.line}>
                  เหลือ {remaining} / {lot.weight_kg} กก.
                  {splitAllowedOf(lot) ? ` · ขั้นต่ำ ${minOrderOf(lot)} กก.` : ' · ขายยกล็อต'}
                </Text>
                <Text style={styles.line}>
                  {lot.grade === 'substandard' ? 'ตกเกรด' : 'ปกติ'}
                  {lot.plot_name !== undefined ? ` · ${lot.plot_name}` : ''}
                </Text>
                {lot.distance_km !== null && lot.distance_km !== undefined ? (
                  <Text style={styles.line}>ระยะประมาณ {lot.distance_km.toFixed(1)} กม.</Text>
                ) : null}
                {lot.price_per_kg !== null ? (
                  <Text style={styles.line}>{lot.price_per_kg} บาท/กก.</Text>
                ) : (
                  <Text style={styles.line}>บริจาค — ไม่มีราคา</Text>
                )}
              </Card>

              {user === null ? (
                <Card>
                  <Text style={styles.qtyLabel}>เข้าสู่ระบบเพื่อจองซื้อหรือขอรับบริจาค</Text>
                  <PrimaryButton
                    label="เข้าสู่ระบบเพื่อจอง"
                    onPress={() => requireLogin(donationIntent ? 'donate' : 'buy')}
                  />
                </Card>
              ) : (
                <Card>
                  <Text style={styles.qtyLabel}>จำนวน (กก.)</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => adjustQuantity(lot, -1)}
                      disabled={!splitAllowedOf(lot)}
                    >
                      <Text style={styles.stepBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.qtyValue}>{quantityKg}</Text>
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => adjustQuantity(lot, 1)}
                      disabled={!splitAllowedOf(lot)}
                    >
                      <Text style={styles.stepBtnText}>+</Text>
                    </Pressable>
                  </View>
                  {quantityError !== null ? <Text style={styles.fieldError}>{quantityError}</Text> : null}
                  {!donationIntent && lot.price_per_kg !== null ? (
                    <Text style={styles.total}>
                      รวมประมาณ {Math.round(lot.price_per_kg * quantityKg)} บาท
                    </Text>
                  ) : null}
                  {donationIntent && !elig.canDonate && elig.reason !== null ? (
                    <Text style={styles.fieldError}>{elig.reason}</Text>
                  ) : null}
                </Card>
              )}

              {user !== null && (canBuyAction || canDonateAction) ? (
                <PrimaryButton
                  label="ไปหน้ายืนยัน"
                  tone={donationIntent ? 'turmeric' : undefined}
                  onPress={() => goConfirm(lot)}
                />
              ) : user !== null ? (
                <SecondaryButton label="กลับไปตลาด" onPress={() => router.replace('/(tabs)')} />
              ) : null}
            </Body>
          );
        }}
      </DataState>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 200, borderRadius: 16, marginBottom: 12, backgroundColor: C.leafSoft },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: C.ink, flex: 1, marginRight: 8 },
  line: { color: C.ink, marginTop: 4 },
  qtyLabel: { color: C.mute, marginBottom: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 6 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 22, fontWeight: '800', color: C.leaf },
  qtyValue: { fontSize: 22, fontWeight: '800', color: C.ink, minWidth: 48, textAlign: 'center' },
  fieldError: { color: C.chili, marginBottom: 6 },
  total: { fontSize: 15, fontWeight: '700', color: C.ink, marginTop: 4 },
});
