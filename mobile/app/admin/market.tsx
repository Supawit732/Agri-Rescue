import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AdminLotRow } from '../../src/api/types';
import { Badge, DataState, PrimaryButton, SecondaryButton } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useApiData } from '../../src/hooks/useApiData';
import { formatTemplate, useI18n } from '../../src/i18n';
import { C, fonts, radius, urgency } from '../../src/theme';
import { hoursLeftFrom, useNow } from '../../src/hooks/useNow';

type StatusFilter = 'all' | 'active' | 'hidden' | 'delivered' | 'expired';

export default function AdminMarketScreen(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatNumber, cropName } = useI18n();
  const router = useRouter();
  const now = useNow();
  const [status, setStatus] = useState<StatusFilter>('active');
  const [q, setQ] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useApiData(
    () => api.listAdminLots({ status, q: q.trim() || undefined }),
    [api, status, q, refreshKey],
  );
  const bump = () => setRefreshKey((k) => k + 1);

  const hideLot = async (id: number): Promise<void> => {
    if (reason.trim() === '') {
      setError(t.admin.hideReasonRequired);
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await api.hideAdminLot(id, reason.trim());
      setReasonFor(null);
      setReason('');
      bump();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.saveFailed);
    } finally {
      setBusyId(null);
    }
  };

  const unhideLot = async (id: number): Promise<void> => {
    setBusyId(id);
    try {
      await api.unhideAdminLot(id);
      bump();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.saveFailed);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={18} color={C.mute} />
          <TextInput
            style={styles.search}
            value={q}
            onChangeText={setQ}
            placeholder={t.admin.searchHint}
            placeholderTextColor={C.mute}
            autoCapitalize="none"
          />
        </View>
      </View>
      <View style={styles.filters}>
        {(['active', 'hidden', 'delivered', 'expired', 'all'] as StatusFilter[]).map((key) => (
          <Pressable
            key={key}
            style={[styles.chip, status === key ? styles.chipOn : null]}
            onPress={() => setStatus(key)}
          >
            <Text style={[styles.chipText, status === key ? styles.chipTextOn : null]}>
              {key === 'active'
                ? t.admin.statusActive
                : key === 'hidden'
                  ? t.admin.statusHidden
                  : key === 'delivered'
                    ? t.admin.statusDelivered
                    : key === 'expired'
                      ? t.admin.statusExpired
                      : t.admin.statusAll}
            </Text>
          </Pressable>
        ))}
      </View>
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      <DataState
        loading={loading}
        error={loadError}
        data={data}
        onRetry={reload}
        isEmpty={(p) => p.lots.length === 0}
        emptyText={t.admin.emptyMarket}
      >
        {(payload) => (
          <View style={styles.list}>
            {payload.lots.map((lot: AdminLotRow) => {
              const hours = hoursLeftFrom(lot.expires_at, now);
              const tone = urgency(hours);
              return (
                <View key={lot.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>
                        #{lot.id} · {cropName({ name_th: lot.crop_name, name_en: lot.crop_name_en })}
                      </Text>
                      <Text style={styles.meta}>
                        {lot.seller_name}
                        {lot.shop_name != null ? ` · ${lot.shop_name}` : ''} ·{' '}
                        {formatNumber(lot.reserved_kg)}/{formatNumber(lot.weight_kg)} {t.dashboard.unitKg}
                      </Text>
                      <Text style={styles.meta}>
                        {lot.grade === 'substandard' ? t.market.gradeSub : t.market.gradeNormal} ·{' '}
                        {lot.status}
                      </Text>
                    </View>
                    <Badge
                      text={formatCountdownSafe(hours, t)}
                      fg={tone.fg}
                      bg={tone.bg}
                    />
                  </View>
                  {lot.hidden ? (
                    <Text style={styles.hiddenNote}>
                      {t.admin.hiddenNote}
                      {lot.hide_reason != null ? ` · ${lot.hide_reason}` : ''}
                    </Text>
                  ) : null}
                  <View style={styles.actions}>
                    {!lot.hidden ? (
                      reasonFor === lot.id ? (
                        <View style={styles.hideForm}>
                          <TextInput
                            style={styles.input}
                            value={reason}
                            onChangeText={setReason}
                            placeholder={t.admin.hideReasonRequired}
                            placeholderTextColor={C.mute}
                          />
                          <View style={styles.hideBtns}>
                            <PrimaryButton
                              label={t.common.confirm}
                              onPress={() => void hideLot(lot.id)}
                              loading={busyId === lot.id}
                            />
                            <SecondaryButton
                              label={t.common.cancel}
                              onPress={() => {
                                setReasonFor(null);
                                setReason('');
                              }}
                            />
                          </View>
                        </View>
                      ) : (
                        <SecondaryButton
                          label={t.admin.hideLot}
                          onPress={() => {
                            setReasonFor(lot.id);
                            setReason('');
                          }}
                          disabled={busyId !== null}
                        />
                      )
                    ) : (
                      <PrimaryButton
                        label={t.admin.unhideLot}
                        onPress={() => void unhideLot(lot.id)}
                        loading={busyId === lot.id}
                      />
                    )}
                    <SecondaryButton
                      label={t.admin.openLot}
                      onPress={() =>
                        router.push({ pathname: '/lots/[id]', params: { id: String(lot.id) } })
                      }
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </DataState>
    </ScrollView>
  );
}

function formatCountdownSafe(
  hours: number,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (hours <= 0) return t.countdown.expired;
  const totalMinutes = Math.floor(hours * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const h = Math.floor((totalMinutes % (60 * 24)) / 60);
  const m = totalMinutes % 60;
  if (days > 0) {
    return formatTemplate(t.countdown.remainingDaysHours, { days, hours: h });
  }
  if (h > 0) {
    return formatTemplate(t.countdown.remainingHoursMinutes, { hours: h, minutes: m });
  }
  return formatTemplate(t.countdown.remainingMinutes, { minutes: m });
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32, gap: 10 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchBox: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
  },
  search: { flex: 1, fontSize: 15, color: C.ink, fontFamily: fonts.body },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: C.leafDeep, borderColor: C.leafDeep },
  chipText: { fontSize: 13, color: C.ink, fontFamily: fonts.body },
  chipTextOn: { color: C.white, fontWeight: '600' },
  list: { gap: 10 },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.cardLg,
    padding: 14,
    gap: 8,
  },
  cardTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  title: { fontSize: 15, fontWeight: '700', color: C.ink, fontFamily: fonts.bodySemi },
  meta: { fontSize: 13, color: C.mute, fontFamily: fonts.body, marginTop: 2 },
  hiddenNote: { fontSize: 12, color: C.urgentFg, fontFamily: fonts.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hideForm: { flex: 1, gap: 8 },
  hideBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.surface,
    fontFamily: fonts.body,
  },
  error: { color: C.danger, fontFamily: fonts.body },
});
