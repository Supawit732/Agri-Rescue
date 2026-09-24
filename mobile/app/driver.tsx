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
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { formatTemplate, useI18n } from '../src/i18n';
import { C } from '../src/theme';
import type { Stop } from '../src/api/types';

function batchStatusLabel(status: string, t: ReturnType<typeof useI18n>['t']): string {
  if (status === 'planned') return t.driver.statusPlanned;
  if (status === 'in_progress') return t.driver.statusInProgress;
  if (status === 'completed') return t.driver.statusCompleted;
  return status;
}

export default function DriverScreen(): React.ReactElement {
  const { logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <Screen>
      <TopBar title={t.driver.title} onImpact={() => router.push('/impact')} onLogout={logout} />
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
  const { t } = useI18n();
  const { data, loading, error, reload } = useApiData(() => api.getBatches(), []);

  return (
    <DataState
      loading={loading}
      error={error}
      data={data}
      onRetry={reload}
      isEmpty={(batches) => batches.length === 0}
      emptyText={t.driver.emptyBatches}
    >
      {(batches) => (
        <Body>
          {batches.map((batch) => (
            <Card key={batch.id}>
              <View style={styles.rowBetween}>
                <Text style={styles.title}>{formatTemplate(t.driver.batchTitle, { id: batch.id })}</Text>
                <Badge text={batchStatusLabel(batch.status, t)} fg={C.leaf} bg={C.leafSoft} />
              </View>
              <Text style={styles.line}>{formatTemplate(t.driver.totalKm, { km: batch.planned_km })}</Text>
              <SecondaryButton label={t.driver.viewStops} onPress={() => onSelect(batch.id)} />
            </Card>
          ))}
        </Body>
      )}
    </DataState>
  );
}

function BatchDetailView({ batchId, onBack }: { batchId: number; onBack: () => void }): React.ReactElement {
  const { api } = useAuth();
  const { t } = useI18n();
  const { data, loading, error, reload } = useApiData(() => api.getBatch(batchId), [batchId]);

  return (
    <DataState loading={loading} error={error} data={data} onRetry={reload}>
      {(detail) => (
        <Body>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>{formatTemplate(t.driver.batchTitle, { id: detail.batch.id })}</Text>
            <Badge text={batchStatusLabel(detail.batch.status, t)} fg={C.leaf} bg={C.leafSoft} />
          </View>
          <Text style={styles.totalKm}>
            {formatTemplate(t.driver.totalKm, { km: detail.batch.planned_km })}
          </Text>
          {detail.stops.map((stop) => (
            <StopCard key={stop.id} stop={stop} onDone={reload} />
          ))}
          <SecondaryButton label={t.driver.backToBatches} onPress={onBack} />
        </Body>
      )}
    </DataState>
  );
}

function StopCard({ stop, onDone }: { stop: Stop; onDone: () => void }): React.ReactElement {
  const { api } = useAuth();
  const { t } = useI18n();
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
          setError(t.driver.weightRequired);
          setBusy(false);
          return;
        }
        await api.confirmStop(stop.id, { weight_kg: w });
      } else {
        await api.confirmStop(stop.id, { otp });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.driver.confirmFailed);
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
            {formatTemplate(t.driver.legKm, {
              type: isPickup ? t.driver.pickup : t.driver.drop,
              km: stop.leg_km,
            })}
          </Text>
          <Text style={styles.stopSub}>
            {isPickup
              ? formatTemplate(t.driver.lotId, { id: stop.lot_id ?? t.common.dash })
              : formatTemplate(t.driver.buyerId, { id: stop.buyer_id ?? t.common.dash })}
          </Text>
        </View>
        {stop.status === 'done' ? <Badge text={t.driver.done} fg={C.leaf} bg={C.leafSoft} /> : null}
      </View>

      {stop.status === 'done' ? (
        <Text style={styles.doneLine}>
          {isPickup && stop.confirmed_weight_kg !== null
            ? formatTemplate(t.driver.weighed, { kg: stop.confirmed_weight_kg })
            : t.driver.confirmed}
          {stop.weight_flag ? t.driver.weightDiff : ''}
        </Text>
      ) : stop.locked ? (
        <Text style={styles.lockedLine}>{t.driver.locked}</Text>
      ) : (
        <>
          {isPickup ? (
            <Field
              label={t.driver.weightLabel}
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
            />
          ) : (
            <Field
              label={t.driver.otpLabel}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={4}
              placeholder={t.driver.otpPlaceholder}
            />
          )}
          {stop.otp_attempts > 0 && !isPickup ? (
            <Text style={styles.attemptLine}>
              {formatTemplate(t.driver.attempts, { n: stop.otp_attempts })}
            </Text>
          ) : null}
          {error !== null ? <Text style={styles.errorLine}>{error}</Text> : null}
          <PrimaryButton
            label={isPickup ? t.driver.confirmPickup : t.driver.confirmDrop}
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
