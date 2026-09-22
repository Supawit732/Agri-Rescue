import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import {
  Badge,
  Body,
  Card,
  CircleSeq,
  DataState,
  Field,
  PrimaryButton,
  Screen,
  SecondaryButton,
  TopBar,
} from '../src/components/ui';
import { STATUS_LABELS } from '../src/constants';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { C } from '../src/theme';
import type { Stop } from '../src/api/types';

const BATCH_STATUS: Record<string, string> = {
  planned: 'ยังไม่เริ่ม',
  in_progress: 'กำลังวิ่ง',
  completed: 'เสร็จแล้ว',
};

export default function DriverScreen(): React.ReactElement {
  const { logout } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <Screen>
      <TopBar title="คนขับ" onImpact={() => router.push('/impact')} onLogout={logout} />
      {selected === null ? (
        <BatchList onSelect={setSelected} />
      ) : (
        <BatchDetailView batchId={selected} onBack={() => setSelected(null)} />
      )}
    </Screen>
  );
}

function BatchList({ onSelect }: { onSelect: (id: number) => void }): React.ReactElement {
  const { api } = useAuth();
  const { data, loading, error, reload } = useApiData(() => api.getBatches(), []);

  return (
    <DataState
      loading={loading}
      error={error}
      data={data}
      onRetry={reload}
      isEmpty={(batches) => batches.length === 0}
      emptyText="ยังไม่มีรอบวิ่งที่ได้รับมอบหมาย"
    >
      {(batches) => (
        <Body>
          {batches.map((batch) => (
            <Card key={batch.id}>
              <View style={styles.rowBetween}>
                <Text style={styles.title}>รอบ #{batch.id}</Text>
                <Badge text={BATCH_STATUS[batch.status] ?? batch.status} fg={C.leaf} bg={C.leafSoft} />
              </View>
              <Text style={styles.line}>ระยะรวม {batch.planned_km} กม.</Text>
              <SecondaryButton label="ดูจุดแวะ" onPress={() => onSelect(batch.id)} />
            </Card>
          ))}
        </Body>
      )}
    </DataState>
  );
}

function BatchDetailView({ batchId, onBack }: { batchId: number; onBack: () => void }): React.ReactElement {
  const { api } = useAuth();
  const { data, loading, error, reload } = useApiData(() => api.getBatch(batchId), [batchId]);

  return (
    <DataState loading={loading} error={error} data={data} onRetry={reload}>
      {(detail) => (
        <Body>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>รอบ #{detail.batch.id}</Text>
            <Badge text={BATCH_STATUS[detail.batch.status] ?? detail.batch.status} fg={C.leaf} bg={C.leafSoft} />
          </View>
          <Text style={styles.totalKm}>ระยะรวม {detail.batch.planned_km} กม.</Text>
          {detail.stops.map((stop) => (
            <StopCard key={stop.id} stop={stop} onDone={reload} />
          ))}
          <SecondaryButton label="กลับไปรายการรอบ" onPress={onBack} />
        </Body>
      )}
    </DataState>
  );
}

function StopCard({ stop, onDone }: { stop: Stop; onDone: () => void }): React.ReactElement {
  const { api } = useAuth();
  const isPickup = stop.stop_type === 'pickup';
  const color = isPickup ? C.turmeric : C.leaf;
  const [weight, setWeight] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      if (isPickup) {
        const w = Number(weight);
        if (!(w > 0)) {
          setError('กรุณากรอกน้ำหนักที่ชั่งได้');
          setBusy(false);
          return;
        }
        await api.confirmStop(stop.id, { weight_kg: w });
      } else {
        await api.confirmStop(stop.id, { otp });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ยืนยันไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={styles.stopHeader}>
        <CircleSeq seq={stop.seq} color={color} />
        <View style={styles.stopHeaderText}>
          <Text style={styles.stopTitle}>
            {isPickup ? 'รับของ (pickup)' : 'ส่งมอบ (drop)'} · ช่วง {stop.leg_km} กม.
          </Text>
          <Text style={styles.stopSub}>
            {isPickup ? `ล็อต #${stop.lot_id ?? '-'}` : `ผู้ซื้อ #${stop.buyer_id ?? '-'}`}
          </Text>
        </View>
        {stop.status === 'done' ? <Badge text="เสร็จแล้ว" fg={C.leaf} bg={C.leafSoft} /> : null}
      </View>

      {stop.status === 'done' ? (
        <Text style={styles.doneLine}>
          {isPickup && stop.confirmed_weight_kg !== null ? `ชั่งได้ ${stop.confirmed_weight_kg} กก.` : 'ยืนยันแล้ว'}
          {stop.weight_flag ? ' · น้ำหนักต่างเกิน 10%' : ''}
        </Text>
      ) : stop.locked ? (
        <Text style={styles.lockedLine}>จุดนี้ถูกล็อก (กรอก OTP ผิดครบ 5 ครั้ง) — ติดต่อผู้ประสานเพื่อปลดล็อก</Text>
      ) : (
        <>
          {isPickup ? (
            <Field label="น้ำหนักที่ชั่งได้ (กก.)" value={weight} onChangeText={setWeight} keyboardType="numeric" />
          ) : (
            <Field
              label="รหัส OTP จากผู้ซื้อ"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="4 หลัก"
            />
          )}
          {stop.otp_attempts > 0 && !isPickup ? (
            <Text style={styles.attemptLine}>กรอกผิดแล้ว {stop.otp_attempts}/5 ครั้ง</Text>
          ) : null}
          {error !== null ? <Text style={styles.errorLine}>{error}</Text> : null}
          <PrimaryButton
            label={isPickup ? 'ยืนยันรับของ' : 'ยืนยันส่งมอบ'}
            tone={isPickup ? 'turmeric' : 'leaf'}
            loading={busy}
            onPress={() => void confirm()}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '800', color: C.ink },
  line: { color: C.ink, marginBottom: 6 },
  totalKm: { color: C.mute, marginBottom: 12, fontWeight: '600' },
  stopHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stopHeaderText: { flex: 1, marginLeft: 10 },
  stopTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  stopSub: { color: C.mute, marginTop: 2 },
  doneLine: { color: C.leaf, fontWeight: '600' },
  lockedLine: { color: C.chili, fontWeight: '600' },
  attemptLine: { color: C.turmeric, marginBottom: 6 },
  errorLine: { color: C.chili, marginBottom: 6 },
});
