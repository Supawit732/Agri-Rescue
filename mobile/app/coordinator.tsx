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
import { formatTemplate, useI18n } from '../src/i18n';
import { C } from '../src/theme';
import type { Stop } from '../src/api/types';

function batchStatusLabel(status: string, t: ReturnType<typeof useI18n>['t']): string {
  if (status === 'planned') return t.coordinator.statusPlanned;
  if (status === 'in_progress') return t.coordinator.statusInProgress;
  if (status === 'completed') return t.coordinator.statusCompleted;
  return status;
}

export default function CoordinatorScreen(): React.ReactElement {
  const { logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const bump = useCallback(() => setRefreshKey((value) => value + 1), []);

  return (
    <Screen>
      <TopBar title={t.coordinator.title} onImpact={() => router.push('/impact')} onLogout={logout} />
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
  const { t } = useI18n();
  const drivers = useApiData(() => api.getDrivers(), []);
  const batches = useApiData(() => api.getBatches(), [refreshKey]);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async (): Promise<void> => {
    setBanner(null);
    if (driverId === null) {
      setBanner(t.coordinator.needDriver);
      return;
    }
    setCreating(true);
    try {
      const result = await api.createBatch(driverId);
      setBanner(
        formatTemplate(t.coordinator.createSuccess, {
          id: result.batch.id,
          stops: result.stops.length,
        }),
      );
      onCreated();
      batches.reload();
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : t.coordinator.createFailed);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Body>
      <SectionTitle>{t.coordinator.createSection}</SectionTitle>
      <Card>
        <Text style={styles.label}>{t.coordinator.pickDriver}</Text>
        <DataState
          loading={drivers.loading}
          error={drivers.error}
          data={drivers.data}
          onRetry={drivers.reload}
          isEmpty={(list) => list.length === 0}
          emptyText={t.coordinator.noDrivers}
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
        <PrimaryButton label={t.coordinator.createBatch} onPress={() => void create()} loading={creating} />
      </Card>

      <SectionTitle>{t.coordinator.allBatches}</SectionTitle>
      <DataState
        loading={batches.loading}
        error={batches.error}
        data={batches.data}
        onRetry={batches.reload}
        isEmpty={(list) => list.length === 0}
        emptyText={t.coordinator.emptyBatches}
      >
        {(list) => (
          <>
            {list.map((batch) => (
              <Card key={batch.id}>
                <View style={styles.rowBetween}>
                  <Text style={styles.title}>
                    {formatTemplate(t.coordinator.batchTitle, { id: batch.id })}
                  </Text>
                  <Badge text={batchStatusLabel(batch.status, t)} fg={C.leaf} bg={C.leafSoft} />
                </View>
                <Text style={styles.line}>
                  {formatTemplate(t.coordinator.totalKm, { km: batch.planned_km })}
                </Text>
                <SecondaryButton label={t.coordinator.reviewStops} onPress={() => onSelect(batch.id)} />
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
  const { t } = useI18n();
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
      setBanner(err instanceof ApiError ? err.message : t.coordinator.unlockFailed);
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
            <Text style={styles.title}>
              {formatTemplate(t.coordinator.batchTitle, { id: detail.batch.id })}
            </Text>
            <Text style={styles.line}>
              {formatTemplate(t.coordinator.totalKm, { km: detail.batch.planned_km })}
            </Text>
            {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}

            <SectionTitle>{t.coordinator.weightFlags}</SectionTitle>
            {flagged.length === 0 ? (
              <Text style={styles.mutedLine}>{t.coordinator.noWeightFlags}</Text>
            ) : (
              flagged.map((stop) => (
                <Card key={`flag-${stop.id}`} style={{ borderColor: C.chili }}>
                  <Text style={styles.flagTitle}>
                    {formatTemplate(t.coordinator.flagStop, {
                      seq: stop.seq,
                      lot: stop.lot_id ?? t.common.dash,
                    })}
                  </Text>
                  <Text style={styles.line}>
                    {formatTemplate(t.coordinator.weighedDiff, {
                      kg: stop.confirmed_weight_kg ?? t.common.dash,
                    })}
                  </Text>
                </Card>
              ))
            )}

            <SectionTitle>{t.coordinator.allStops}</SectionTitle>
            {detail.stops.map((stop) => (
              <Card key={stop.id}>
                <View style={styles.stopHeader}>
                  <CircleSeq seq={stop.seq} color={stop.stop_type === 'pickup' ? C.turmeric : C.leaf} />
                  <View style={styles.stopText}>
                    <Text style={styles.stopTitle}>
                      {formatTemplate(t.coordinator.legKm, {
                        type: stop.stop_type === 'pickup' ? t.coordinator.pickup : t.coordinator.drop,
                        km: stop.leg_km,
                      })}
                    </Text>
                    <Text style={styles.stopSub}>
                      {stop.status === 'done' ? t.coordinator.done : t.coordinator.pending}
                    </Text>
                  </View>
                  {stop.weight_flag ? (
                    <Badge text={t.coordinator.weightAbnormal} fg={C.chili} bg={C.chiliSoft} />
                  ) : null}
                </View>
                {stop.locked ? (
                  <>
                    <Text style={styles.lockedLine}>{t.coordinator.locked}</Text>
                    <PrimaryButton
                      label={t.coordinator.unlockOtp}
                      tone="chili"
                      loading={busyId === stop.id}
                      onPress={() => void unlock(stop)}
                    />
                  </>
                ) : null}
              </Card>
            ))}

            <SecondaryButton label={t.common.back} onPress={onBack} />
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
