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
  SecondaryButton,
  SectionTitle,
  SubScreen,
} from '../../src/components/ui';
import { RIPENESS_LABELS, STATUS_LABELS } from '../../src/constants';
import { useAuth } from '../../src/context/AuthContext';
import { useApiData } from '../../src/hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../../src/hooks/useNow';
import { googleMapsUrl } from '../../src/lot/helpers';
import { C, urgency } from '../../src/theme';

export default function OrderDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { api, user } = useAuth();
  const router = useRouter();
  const now = useNow();
  const { data, loading, error, reload } = useApiData(() => api.getOrder(orderId), [orderId]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [weightInput, setWeightInput] = useState('');

  const cancel = (orderIdToCancel: number): void => {
    Alert.alert('ยกเลิกการจอง', 'ต้องการยกเลิกคำสั่งซื้อนี้หรือไม่?', [
      { text: 'ไม่', style: 'cancel' },
      {
        text: 'ยกเลิกการจอง',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            setBanner(null);
            try {
              await api.cancelOrder(orderIdToCancel);
              router.replace('/(tabs)/orders');
            } catch (err) {
              setBanner(err instanceof ApiError ? err.message : 'ยกเลิกไม่สำเร็จ');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <SubScreen title="รายละเอียดคำสั่งซื้อ" onBack={() => router.replace('/(tabs)/orders')}>
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
          const showSellerStub = user?.can_sell === true;

          return (
            <Body>
              {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
              <Text style={styles.meta}>คำสั่งซื้อ #{order.id}</Text>

              <SectionTitle>สิ่งที่ซื้อ</SectionTitle>
              <Card>
                <Text style={styles.title}>{order.crop_name_th ?? `ล็อต #${order.lot_id}`}</Text>
                <Text style={styles.line}>
                  {order.grade === 'substandard' ? 'ตกเกรด' : 'ปกติ'}
                  {order.ripeness !== undefined
                    ? ` · ความสุก ${RIPENESS_LABELS[order.ripeness] ?? order.ripeness}`
                    : ''}
                </Text>
                <Text style={styles.line}>จำนวน {qty} กก.</Text>
                <Text style={styles.line}>
                  {order.is_donation
                    ? 'รับบริจาค — ไม่คิดเงิน'
                    : `${order.agreed_price_per_kg} บาท/กก. · รวม ${total} บาท`}
                </Text>
                <Badge
                  text={STATUS_LABELS[order.status] ?? order.status}
                  fg={C.leaf}
                  bg={C.leafSoft}
                />
              </Card>

              <SectionTitle>รับของที่ไหน</SectionTitle>
              <Card>
                <Text style={styles.line}>{order.plot_name ?? 'แปลงผู้ขาย'}</Text>
                {order.distance_km !== null && order.distance_km !== undefined ? (
                  <Text style={styles.line}>ระยะประมาณ {order.distance_km.toFixed(1)} กม.</Text>
                ) : null}
                {lat !== null && lng !== null ? (
                  <PrimaryButton
                    label="เปิดใน Google Maps"
                    onPress={() => void Linking.openURL(googleMapsUrl(lat, lng))}
                  />
                ) : (
                  <Text style={styles.muted}>พิกัดแสดงเมื่อคุณเป็นเจ้าของออเดอร์</Text>
                )}
              </Card>

              {hours !== null && tone !== null ? (
                <>
                  <SectionTitle>ต้องรับภายใน</SectionTitle>
                  <Card>
                    <Badge text={formatCountdown(hours)} fg={tone.fg} bg={tone.bg} />
                    <Text style={styles.muted}>นับถึงเวลาหมดอายุของล็อต</Text>
                  </Card>
                </>
              ) : null}

              <SectionTitle>ขั้นตอนต่อไป</SectionTitle>
              <Card>
                <Text style={styles.step}>1) ไปที่แปลงตามแผนที่</Text>
                <Text style={styles.step}>2) ตรวจของด้วยตนเอง</Text>
                <Text style={styles.step}>3) พอใจแล้วให้รหัส OTP กับผู้ขาย</Text>
                <Text style={styles.step}>4) ถ้าไม่พอใจ อย่าให้รหัส</Text>
              </Card>

              {active ? (
                <>
                  <SectionTitle>รหัส OTP</SectionTitle>
                  <Card>
                    <View style={styles.otpBox}>
                      <Text style={styles.otpLabel}>แสดงให้ผู้ขายเมื่อตรวจของแล้ว</Text>
                      <Text style={styles.otpValue}>{order.drop_otp}</Text>
                    </View>
                  </Card>
                </>
              ) : null}

              <SectionTitle>ไทม์ไลน์สถานะ</SectionTitle>
              <Card>
                <Text style={styles.step}>
                  ● จองแล้ว{order.status === 'reserved' || order.status === 'picked' || order.status === 'delivered' ? ' ✓' : ''}
                </Text>
                <Text style={styles.muted}>○ ชำระเงิน (เตรียมไว้ในขั้น 6.5)</Text>
                <Text style={styles.step}>
                  {order.status === 'picked' || order.status === 'delivered' ? '●' : '○'} รับของแล้ว
                  {order.status === 'delivered' ? ' ✓' : ''}
                </Text>
              </Card>

              {showSellerStub && order.status === 'reserved' ? (
                <>
                  <SectionTitle>ฝั่งผู้ขาย (ยืนยันรับของ)</SectionTitle>
                  <Card>
                    <Text style={styles.muted}>
                      การกรอก OTP + น้ำหนักจริงสำหรับผู้ขายจะพร้อมในขั้นส่งมอบ (6.4) —
                      ตอนนี้ดูรายการผู้จองได้จากแท็บขาย → ล็อตของฉัน
                    </Text>
                    <Field label="OTP (ยังไม่บันทึก)" value={otpInput} onChangeText={setOtpInput} />
                    <Field
                      label="น้ำหนักจริง กก. (ยังไม่บันทึก)"
                      value={weightInput}
                      onChangeText={setWeightInput}
                      keyboardType="numeric"
                    />
                    <SecondaryButton
                      label="ไปล็อตของฉัน"
                      onPress={() => router.push('/(tabs)/sell')}
                    />
                  </Card>
                </>
              ) : null}

              {order.status === 'reserved' && order.batch_id === null ? (
                <PrimaryButton
                  label="ยกเลิกการจอง"
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
