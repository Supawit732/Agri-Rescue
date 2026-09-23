import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ApiError } from '../../../src/api/client';
import {
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
import { remainingOf } from '../../../src/lot/helpers';
import { C } from '../../../src/theme';

export default function LotConfirmScreen(): React.ReactElement {
  const { id, intent, qty } = useLocalSearchParams<{ id: string; intent?: string; qty?: string }>();
  const lotId = Number(id);
  const quantityKg = Number(qty ?? '0');
  const donation = intent === 'donate';
  const { api, user, refreshUser } = useAuth();
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
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const confirm = async (): Promise<void> => {
    setBanner(null);
    setBusy(true);
    try {
      const extras =
        donation && needsPlace
          ? {
              distribution_place: 'จุดรับ/แจกที่ระบุโดยผู้รับ',
              distribution_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }
          : undefined;
      const result = await api.createOrder(lotId, donation, quantityKg, extras);
      await refreshUser();
      router.replace({
        pathname: '/lots/[id]/success',
        params: { id: String(lotId), orderId: String(result.order.id) },
      });
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'จองไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubScreen
      title="ยืนยันการจอง"
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
          return (
            <Body>
              {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
              <Card>
                <Text style={styles.title}>{lot.crop_name_th}</Text>
                <Text style={styles.line}>จำนวน {quantityKg} กก. · เหลือ {remainingOf(lot)} กก.</Text>
                <Text style={styles.line}>
                  {donation
                    ? 'ประเภท: ขอรับบริจาค (ไม่คิดเงิน)'
                    : `ประเภท: ซื้อ · ${lot.price_per_kg ?? '—'} บาท/กก.`}
                </Text>
                {total !== null ? <Text style={styles.total}>ราคารวมประมาณ {total} บาท</Text> : null}
                <Text style={styles.line}>
                  พื้นที่รับของ: {lot.plot_name ?? 'แปลงผู้ขาย'}
                  {lot.distance_km !== null && lot.distance_km !== undefined
                    ? ` · ~${lot.distance_km.toFixed(1)} กม.`
                    : ''}
                </Text>
                <Text style={styles.line}>เวลาที่ล็อตเหลือ: {formatCountdown(hours)}</Text>
                <Text style={styles.terms}>
                  ข้อกำหนดสั้น ๆ: มารับเองตามนัด ตรวจของก่อนให้รหัส OTP กับผู้ขาย
                  หากไม่พอใจอย่าให้รหัส
                </Text>
              </Card>
              <PrimaryButton
                label={donation ? 'ยืนยันขอรับบริจาค' : 'ยืนยันซื้อ'}
                tone={donation ? 'turmeric' : undefined}
                loading={busy}
                onPress={() => void confirm()}
              />
              <SecondaryButton
                label="ย้อนกลับ"
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
});
