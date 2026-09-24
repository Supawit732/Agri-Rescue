import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useApiData } from '../../src/hooks/useApiData';
import { useI18n } from '../../src/i18n';
import { C, fonts, radius } from '../../src/theme';
import { DataState } from '../../src/components/ui';

function StatCard({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: string;
}): React.ReactElement {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionRow({
  count,
  label,
  onPress,
  tone,
}: {
  count: number;
  label: string;
  onPress: () => void;
  tone?: string;
}): React.ReactElement {
  return (
    <Pressable accessibilityRole="button" style={styles.actionRow} onPress={onPress}>
      <Text style={[styles.actionCount, tone ? { color: tone } : null]}>{String(count)}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
      <Feather name="chevron-right" size={16} color={C.mute} />
    </Pressable>
  );
}

function barPct(value: number, max: number): `${number}%` {
  if (max <= 0) {
    return '0%';
  }
  return `${Math.min(100, Math.round((value / max) * 100))}%`;
}

export default function AdminOverviewScreen(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatNumber, formatDateTime: fmtDateTime } = useI18n();
  const router = useRouter();
  const [showMore, setShowMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, reload } = useApiData(() => api.getAdminOverview(), [api]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  React.useEffect(() => {
    if (data !== null) {
      setUpdatedAt(new Date());
    }
  }, [data]);

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            try {
              reload();
            } finally {
              setRefreshing(false);
            }
          }}
        />
      }
    >
      <DataState loading={loading} error={error} data={data} onRetry={reload}>
        {(o) => {
          const dailyMax = Math.max(0, ...o.charts.daily_kg.map((r) => r.kg));
          const cropMax = Math.max(0, ...o.charts.by_crop.map((r) => r.kg));
          const shopMax = Math.max(0, ...o.charts.top_shops.map((r) => r.kg));
          return (
            <>
              <Text style={styles.section}>{t.admin.mustManage}</Text>
              <View style={styles.card}>
                <ActionRow
                  count={o.actions.org_pending}
                  label={t.admin.queueOrg}
                  tone={C.soonFg}
                  onPress={() => router.push('/admin/inbox')}
                />
                <ActionRow
                  count={o.actions.support_open}
                  label={t.admin.queueSupport}
                  tone={C.leaf}
                  onPress={() => router.push('/admin/inbox')}
                />
                <ActionRow
                  count={o.actions.weight_flags}
                  label={t.admin.queueWeight}
                  tone={C.urgentFg}
                  onPress={() => router.push('/admin/inbox')}
                />
                <ActionRow
                  count={o.actions.otp_locked}
                  label={t.admin.queueOtp}
                  tone={C.urgentFg}
                  onPress={() => router.push('/admin/inbox')}
                />
                <ActionRow
                  count={o.actions.donation_proof_overdue}
                  label={t.admin.queueProof}
                  tone={C.soonFg}
                  onPress={() => router.push('/admin/inbox')}
                />
              </View>

              <View style={styles.grid3}>
                <StatCard
                  value={formatNumber(o.impact.kg_saved)}
                  label={t.admin.statKgSaved}
                  tone={C.leaf}
                />
                <StatCard value={formatNumber(o.lots.open)} label={t.admin.statLotsOpen} />
                <StatCard
                  value={formatNumber(o.users.new_7d)}
                  label={t.admin.statNew7d}
                  tone={C.leaf}
                />
              </View>

              {updatedAt !== null ? (
                <Text style={styles.updated}>
                  {t.admin.lastUpdated.replace('{time}', fmtDateTime(updatedAt))}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                style={styles.moreToggle}
                onPress={() => setShowMore((v) => !v)}
              >
                <Text style={styles.moreToggleText}>
                  {showMore ? t.admin.showLess : t.admin.showMore} · {t.admin.moreStats}
                </Text>
                <Feather name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={C.leaf} />
              </Pressable>

              {showMore ? (
                <>
                  <View style={styles.grid3}>
                    <StatCard value={formatNumber(o.users.total)} label={t.admin.statUsers} />
                    <StatCard
                      value={formatNumber(o.users.sellers)}
                      label={t.admin.statSellers}
                      tone={C.okFg}
                    />
                    <StatCard value={formatNumber(o.users.buyers)} label={t.admin.statBuyers} />
                    <StatCard
                      value={formatNumber(o.users.donors)}
                      label={t.admin.statDonors}
                      tone={C.soonFg}
                    />
                    <StatCard value={formatNumber(o.lots.sold)} label={t.admin.statLotsSold} />
                    <StatCard value={formatNumber(o.lots.expired)} label={t.admin.statLotsExpired} />
                  </View>

                  <View style={styles.grid2}>
                    <StatCard value={formatNumber(o.impact.co2e_kg)} label={t.admin.statCo2e} />
                    <StatCard
                      value={formatNumber(o.impact.farmer_income)}
                      label={t.admin.statIncome}
                      tone={C.okFg}
                    />
                    <StatCard
                      value={formatNumber(o.impact.donated_kg)}
                      label={t.admin.statDonatedKg}
                      tone={C.soonFg}
                    />
                  </View>

                  <Text style={styles.section}>{t.admin.marketHealth}</Text>
                  <View style={styles.grid3}>
                    <StatCard
                      value={`${formatNumber(o.health.sell_through_rate)}%`}
                      label={t.admin.sellThrough}
                      tone={C.leaf}
                    />
                    <StatCard
                      value={formatNumber(o.health.cancelled_orders)}
                      label={t.admin.cancelledOrders}
                      tone={C.urgentFg}
                    />
                    <StatCard
                      value={o.health.ai_accuracy === null ? '—' : `${formatNumber(o.health.ai_accuracy)}%`}
                      label={t.admin.aiAccuracy}
                    />
                  </View>
                </>
              ) : null}

              <Text style={styles.section}>{t.admin.chartDailyKg}</Text>
              <View style={styles.card}>
                {o.charts.daily_kg.length === 0 ? (
                  <Text style={styles.muted}>{t.admin.emptyCharts}</Text>
                ) : (
                  o.charts.daily_kg.map((row) => (
                    <View key={row.date} style={styles.barRow}>
                      <Text style={styles.barLabel}>{row.date.slice(5)}</Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: barPct(row.kg, dailyMax) },
                          ]}
                        />
                      </View>
                      <Text style={styles.barValue}>{formatNumber(row.kg)}</Text>
                    </View>
                  ))
                )}
              </View>

              <Text style={styles.section}>{t.admin.chartByCrop}</Text>
              <View style={styles.card}>
                {o.charts.by_crop.length === 0 ? (
                  <Text style={styles.muted}>{t.admin.emptyCharts}</Text>
                ) : (
                  o.charts.by_crop.map((row) => (
                    <View key={row.name} style={styles.barRow}>
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: barPct(row.kg, cropMax) },
                          ]}
                        />
                      </View>
                      <Text style={styles.barValue}>{formatNumber(row.kg)}</Text>
                    </View>
                  ))
                )}
              </View>

              <Text style={styles.section}>{t.admin.chartTopShops}</Text>
              <View style={styles.card}>
                {o.charts.top_shops.length === 0 ? (
                  <Text style={styles.muted}>{t.admin.emptyCharts}</Text>
                ) : (
                  o.charts.top_shops.map((row, idx) => (
                    <View key={row.name} style={styles.barRow}>
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {idx + 1}. {row.name}
                      </Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: barPct(row.kg, shopMax) },
                          ]}
                        />
                      </View>
                      <Text style={styles.barValue}>{formatNumber(row.kg)}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          );
        }}
      </DataState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32, gap: 12 },
  grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 12,
    minWidth: '30%',
    flexGrow: 1,
    gap: 2,
  },
  statValue: {
    fontFamily: fonts.titleBold,
    fontSize: 22,
    fontWeight: '700',
    color: C.ink,
  },
  statLabel: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  section: {
    fontFamily: fonts.title,
    fontSize: 17,
    fontWeight: '700',
    color: C.ink,
    marginTop: 4,
  },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.cardLg,
    padding: 12,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
  },
  actionCount: {
    minWidth: 36,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: fonts.titleBold,
    color: C.ink,
  },
  actionLabel: { flex: 1, fontSize: 14, color: C.ink, fontFamily: fonts.body },
  muted: { color: C.mute, fontFamily: fonts.body, fontSize: 13 },
  updated: { color: C.mute, fontFamily: fonts.body, fontSize: 12, marginTop: -4 },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  moreToggleText: { color: C.leaf, fontWeight: '600', fontFamily: fonts.bodySemi },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  barLabel: { width: 72, fontSize: 12, color: C.mute, fontFamily: fonts.body },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.leafSoft,
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: 5, backgroundColor: C.leaf },
  barValue: { width: 48, textAlign: 'right', fontSize: 12, color: C.ink, fontFamily: fonts.body },
});
