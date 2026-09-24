import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { BigStat, Body, Card, DataState, Screen, StackHeader } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { useI18n } from '../src/i18n';
import { C } from '../src/theme';

export default function ImpactScreen(): React.ReactElement {
  const { api } = useAuth();
  const { t, formatNumber } = useI18n();
  const router = useRouter();
  const { data, loading, error, reload } = useApiData(() => api.getImpact(), []);

  return (
    <Screen>
      <StackHeader title={t.impact.title} onBack={() => router.replace('/profile')} />
      <DataState loading={loading} error={error} data={data} onRetry={reload}>
        {(summary) => (
          <Body>
            <Card style={styles.hero}>
              <Text style={styles.heroValue}>{formatNumber(summary.kg_saved)}</Text>
              <Text style={styles.heroUnit}>{t.impact.kgSaved}</Text>
            </Card>
            <Card>
              <View style={styles.grid}>
                <BigStat
                  value={formatNumber(summary.co2e_kg)}
                  unit={t.impact.unitKg}
                  label={t.impact.co2e}
                />
                <BigStat
                  value={formatNumber(summary.farmer_income)}
                  unit={t.impact.unitBaht}
                  label={t.impact.farmerIncome}
                />
              </View>
              <View style={styles.grid}>
                <BigStat
                  value={formatNumber(summary.donated_kg)}
                  unit={t.impact.unitKg}
                  label={t.impact.donated}
                />
                <BigStat value={formatNumber(summary.lot_count)} label={t.impact.lotsDelivered} />
              </View>
            </Card>
          </Body>
        )}
      </DataState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', backgroundColor: C.leaf, borderColor: C.leaf, paddingVertical: 26 },
  heroValue: { fontSize: 56, fontWeight: '900', color: C.white },
  heroUnit: { fontSize: 16, color: C.white, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
});
