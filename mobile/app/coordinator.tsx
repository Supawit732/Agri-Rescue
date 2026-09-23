import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import {
  Badge,
  Body,
  Card,
  Chip,
  CircleSeq,
  DataState,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionTitle,
  TopBar,
} from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { C } from '../src/theme';
import type { Stop } from '../src/api/types';

const BATCH_STATUS: Record<string, string> = {
  planned: 'ยังไม่เริ่ม',
  in_progress: 'กำลังวิ่ง',
  completed: 'เสร็จแล้ว',
};

export default function CoordinatorScreen(): React.ReactElement {
  const { logout } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const bump = useCallback(() => setRefreshKey((value) => value + 1), []);

  return (
    <Screen>
      <TopBar title="ผู้ประสาน" onImpact={() => router.push('/impact')} onLogout={logout} />
      {selected === null ? (
        <Overview refreshKey={refreshKey} onCreated={bump} onSelect={setSelected} />
      ) : (
        <BatchReview batchId={selected} onBack={() => setSelected(null)} />
      )}
    </Screen>
  );
}

function Overview({
  refreshKey,
  onCreated,
  onSelect,
}: {
  refreshKey: number;
  onCreated: () => void;
  onSelect: (id: number) => void;
}): React.ReactElement {
  const { api } = useAuth();
  const drivers = useApiData(() => api.getDrivers(), []);
  const batches = useApiData(() => api.getBatches(), [refreshKey]);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async (): Promise<void> => {
    setBanner(null);
    if (driverId === null) {
      setBanner('กรุณาเลือกคนขับ');
      return;
    }
    setCreating(true);
    try {
      const result = await api.createBatch(driverId);
      setBanner(`สร้างรอบ #${result.batch.id} สำเร็จ (${result.stops.length} จุดแวะ)`);
      onCreated();
      batches.reload();
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'สร้างรอบไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Body>
      <SectionTitle>สร้างรอบวิ่ง</SectionTitle>
      <Card>
        <Text style={styles.label}>เลือกคนขับ</Text>
        <DataState
          loading={drivers.loading}
          error={drivers.error}
          data={drivers.data}
          onRetry={drivers.reload}
          isEmpty={(list) => list.length === 0}
          emptyText="ยังไม่มีคนขับในระบบ"
        >
          {(list) => (
            <View style={styles.row}>
              {list.map((driver) => (
                <Chip
                  key={driver.id}
                  label={driver.name}
                  selected={driverId === driver.id}
                  onPress={() => setDriverId(driver.id)}
                />
              ))}
            </View>
          )}
        </DataState>
        {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
        <PrimaryButton label="สร้างรอบ" onPress={() => void create()} loading={creating} />
      </Card>

      <SectionTitle>รอบทั้งหมด</SectionTitle>
      <DataState
        loading={batches.loading}
        error={batches.error}
        data={batches.data}
        onRetry={batches.reload}
        isEmpty={(list) => list.length === 0}
        emptyText="ยังไม่มีรอบวิ่ง"
      >
        {(list) => (
          <>
            {list.map((batch) => (
              <Card key={batch.id}>
                <View style={styles.rowBetween}>
                  <Text style={styles.title}>รอบ #{batch.id}</Text>
                  <Badge text={BATCH_STATUS[batch.status] ?? batch.status} fg={C.leaf} bg={C.leafSoft} />
                </View>
                <Text style={styles.line}>ระยะรวม {batch.planned_km} กม.</Text>
                <SecondaryButton label="ตรวจจุดแวะ / ปลดล็อก" onPress={() => onSelect(batch.id)} />
              </Card>
            ))}
          </>
        )}
      </DataState>
    </Body>
  );
}

function BatchReview({ batchId, onBack }: { batchId: number; onBack: () => void }): React.ReactElement {
  const { api } = useAuth();
  const { data, loading, error, reload } = useApiData(() => api.getBatch(batchId), [batchId]);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const unlock = async (stop: Stop): Promise<void> => {
    setBanner(null);
    setBusyId(stop.id);
    try {
      await api.unlockStop(stop.id);
      reload();
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'ปลดล็อกไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DataState loading={loading} error={error} data={data} onRetry={reload}>
      {(detail) => {
        const flagged = detail.stops.filter((stop) => stop.weight_flag);
        return (
          <Body>
            <Text style={styles.title}>รอบ #{detail.batch.id}</Text>
            <Text style={styles.line}>ระยะรวม {detail.batch.planned_km} กม.</Text>
            {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}

            <SectionTitle>จุดที่น้ำหนักผิดปกติ (weight_flag)</SectionTitle>
            {flagged.length === 0 ? (
              <Text style={styles.mutedLine}>ไม่มีจุดที่น้ำหนักต่างเกิน 10%</Text>
            ) : (
              flagged.map((stop) => (
                <Card key={`flag-${stop.id}`} style={{ borderColor: C.chili }}>
                  <Text style={styles.flagTitle}>ลำดับ {stop.seq} · ล็อต #{stop.lot_id ?? '-'}</Text>
                  <Text style={styles.line}>ชั่งได้ {stop.confirmed_weight_kg ?? '-'} กก. (ต่างเกิน 10%)</Text>
                </Card>
              ))
            )}

            <SectionTitle>จุดแวะทั้งหมด</SectionTitle>
            {detail.stops.map((stop) => (
              <Card key={stop.id}>
                <View style={styles.stopHeader}>
                  <CircleSeq seq={stop.seq} color={stop.stop_type === 'pickup' ? C.turmeric : C.leaf} />
                  <View style={styles.stopText}>
                    <Text style={styles.stopTitle}>
                      {stop.stop_type === 'pickup' ? 'รับของ' : 'ส่งมอบ'} · ช่วง {stop.leg_km} กม.
                    </Text>
                    <Text style={styles.stopSub}>{stop.status === 'done' ? 'เสร็จแล้ว' : 'รอดำเนินการ'}</Text>
                  </View>
                  {stop.weight_flag ? <Badge text="น้ำหนักผิดปกติ" fg={C.chili} bg={C.chiliSoft} /> : null}
                </View>
                {stop.locked ? (
                  <>
                    <Text style={styles.lockedLine}>ถูกล็อก (OTP ผิดครบ 5 ครั้ง)</Text>
                    <PrimaryButton
                      label="ปลดล็อก OTP"
                      tone="chili"
                      loading={busyId === stop.id}
                      onPress={() => void unlock(stop)}
                    />
                  </>
                ) : null}
              </Card>
            ))}

            <SecondaryButton label="กลับ" onPress={onBack} />
          </Body>
        );
      }}
    </DataState>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: { color: C.ink, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 4 },
  line: { color: C.ink, marginBottom: 6 },
  mutedLine: { color: C.mute, marginBottom: 8 },
  banner: { color: C.leaf, fontWeight: '600', marginBottom: 10 },
  flagTitle: { fontSize: 15, fontWeight: '700', color: C.chili, marginBottom: 4 },
  stopHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  stopText: { flex: 1, marginLeft: 10 },
  stopTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  stopSub: { color: C.mute, marginTop: 2 },
  lockedLine: { color: C.chili, fontWeight: '600', marginBottom: 6 },
});
