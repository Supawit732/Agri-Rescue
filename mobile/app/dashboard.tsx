import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import {
  Body,
  Card,
  DataState,
  LoginPrompt,
  SectionTitle,
  SubScreen,
} from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { useI18n } from '../src/i18n';
import { C } from '../src/theme';
import type { DashboardPayload } from '../src/api/types';

const CHART_WIDTH = Math.min(Dimensions.get('window').width - 48, 420);

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }): React.ReactElement {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>
        {value}
        {unit !== undefined ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DashboardBody({ data }: { data: DashboardPayload }): React.ReactElement {
  const { t, formatNumber, cropName } = useI18n();
  const daily = useMemo(
    () =>
      data.charts.daily_kg.map((row) => ({
        value: row.kg,
        label: row.date.slice(5),
        labelTextStyle: { color: C.mute, fontSize: 9 },
      })),
    [data.charts.daily_kg],
  );
  const byCrop = useMemo(
    () =>
      data.charts.by_crop.map((row) => {
        const name = cropName({ name_th: row.crop_name_th, name_en: row.crop_name_en });
        return {
          value: row.kg,
          label: name.slice(0, 6),
          frontColor: C.leaf,
          topLabelComponent: () => (
            <Text style={styles.barTop}>{formatNumber(Math.round(row.kg))}</Text>
          ),
        };
      }),
    [data.charts.by_crop, cropName, formatNumber],
  );
  const pie = useMemo(() => {
    const colors = [C.leaf, C.turmeric, C.chili, '#5B8C5A', '#8B7355', C.mute];
    return data.charts.orders_by_status.map((row, i) => ({
      value: row.count,
      color: colors[i % colors.length],
      text: `${t.status[row.status] ?? row.status} ${formatNumber(row.count)}`,
    }));
  }, [data.charts.orders_by_status, t.status, formatNumber]);
  const ai = data.charts.ai_accuracy;
  const aiPct = ai.accuracy === null ? t.common.dash : `${Math.round(ai.accuracy * 100)}%`;

  return (
    <Body>
      <Text style={styles.scope}>
        {data.scope === 'admin' ? t.dashboard.scopeAdmin : t.dashboard.scopeSeller}
      </Text>
      <View style={styles.statGrid}>
        <StatCard
          label={t.dashboard.kgSaved}
          value={formatNumber(data.cards.kg_saved)}
          unit={t.dashboard.unitKg}
        />
        <StatCard
          label={t.dashboard.co2e}
          value={formatNumber(data.cards.co2e_kg)}
          unit={t.dashboard.unitKg}
        />
        <StatCard
          label={t.dashboard.farmerIncome}
          value={formatNumber(data.cards.farmer_income)}
          unit={t.dashboard.unitBaht}
        />
        <StatCard
          label={t.dashboard.donatedKg}
          value={formatNumber(data.cards.donated_kg)}
          unit={t.dashboard.unitKg}
        />
        <StatCard label={t.dashboard.orderCount} value={formatNumber(data.cards.order_count)} />
      </View>

      <SectionTitle>{t.dashboard.dailyKg}</SectionTitle>
      <Card>
        {daily.every((d) => d.value === 0) ? (
          <Text style={styles.empty}>{t.dashboard.emptyCharts}</Text>
        ) : (
          <LineChart
            data={daily}
            width={CHART_WIDTH}
            height={180}
            color={C.leaf}
            thickness={2}
            dataPointsColor={C.leaf}
            yAxisColor={C.line}
            xAxisColor={C.line}
            yAxisTextStyle={{ color: C.mute, fontSize: 10 }}
            noOfSections={4}
            spacing={Math.max(18, Math.floor(CHART_WIDTH / 16))}
            initialSpacing={8}
            endSpacing={8}
            isAnimated
          />
        )}
      </Card>

      <SectionTitle>{t.dashboard.byCrop}</SectionTitle>
      <Card>
        {byCrop.length === 0 ? (
          <Text style={styles.empty}>{t.dashboard.emptyCharts}</Text>
        ) : (
          <BarChart
            data={byCrop}
            width={CHART_WIDTH}
            height={180}
            barWidth={28}
            spacing={16}
            roundedTop
            yAxisTextStyle={{ color: C.mute, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: C.mute, fontSize: 10 }}
            noOfSections={4}
            isAnimated
          />
        )}
      </Card>

      <SectionTitle>{t.dashboard.ordersByStatus}</SectionTitle>
      <Card style={styles.pieWrap}>
        {pie.length === 0 ? (
          <Text style={styles.empty}>{t.dashboard.emptyCharts}</Text>
        ) : (
          <>
            <PieChart data={pie} donut radius={70} innerRadius={40} showText={false} />
            <View style={styles.legend}>
              {pie.map((slice) => (
                <View key={slice.text} style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: slice.color }]} />
                  <Text style={styles.legendText}>{slice.text}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Card>

      <SectionTitle>{t.dashboard.aiAccuracy}</SectionTitle>
      <Card>
        <Text style={styles.aiBig}>{aiPct}</Text>
        <Text style={styles.aiSub}>
          {t.dashboard.matched} {formatNumber(ai.matched)} / {formatNumber(ai.total)}
        </Text>
      </Card>
    </Body>
  );
}

export default function DashboardScreen(): React.ReactElement {
  const { api, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const canSee = user !== null && (user.is_admin || user.can_sell);
  const { data, loading, error, reload } = useApiData(
    () => (canSee ? api.getDashboard() : Promise.reject(new Error('forbidden'))),
    [user?.id, canSee],
  );

  if (user === null) {
    return (
      <SubScreen title={t.dashboard.title} onBack={() => router.replace('/(tabs)/account')}>
        <LoginPrompt
          title={t.dashboard.loginTitle}
          message={t.dashboard.loginMessage}
          returnTo="/dashboard"
        />
      </SubScreen>
    );
  }

  if (!canSee) {
    return (
      <SubScreen title={t.dashboard.title} onBack={() => router.replace('/(tabs)/account')}>
        <Body>
          <Text style={styles.empty}>{t.dashboard.loginMessage}</Text>
        </Body>
      </SubScreen>
    );
  }

  return (
    <SubScreen title={t.dashboard.title} onBack={() => router.replace('/(tabs)/account')}>
      <DataState loading={loading} error={error} data={data} onRetry={reload}>
        {(payload) => <DashboardBody data={payload} />}
      </DataState>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  scope: { color: C.mute, marginBottom: 12, paddingHorizontal: 4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: {
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 140,
    flexGrow: 1,
    flexBasis: '40%',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: C.leaf },
  statUnit: { fontSize: 12, fontWeight: '600', color: C.mute },
  statLabel: { color: C.mute, marginTop: 4, fontSize: 13 },
  empty: { color: C.mute, textAlign: 'center', paddingVertical: 16, paddingHorizontal: 8 },
  barTop: { color: C.mute, fontSize: 10, marginBottom: 2 },
  pieWrap: { alignItems: 'center', gap: 12 },
  legend: { alignSelf: 'stretch', gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: C.ink, fontSize: 13 },
  aiBig: { fontSize: 36, fontWeight: '800', color: C.leaf, textAlign: 'center' },
  aiSub: { color: C.mute, textAlign: 'center', marginTop: 6 },
});
