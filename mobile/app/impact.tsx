import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { BigStat, Body, Card, DataState, Screen, SecondaryButton, TopBar } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { C } from '../src/theme';

export default function ImpactScreen(): React.ReactElement {
  const { api, logout } = useAuth();
  const router = useRouter();
  const { data, loading, error, reload } = useApiData(() => api.getImpact(), []);

  return (
    <Screen>
      <TopBar title="ผลลัพธ์ที่ช่วยได้" onLogout={logout} />
      <DataState loading={loading} error={error} data={data} onRetry={reload}>
        {(summary) => (
          <Body>
            <Card style={styles.hero}>
              <Text style={styles.heroValue}>{summary.kg_saved}</Text>
              <Text style={styles.heroUnit}>กิโลกรัมที่ช่วยไม่ให้เสียทิ้ง</Text>
            </Card>
            <Card>
              <View style={styles.grid}>
                <BigStat value={String(summary.co2e_kg)} unit="kg" label="CO₂e ที่ลดได้" />
                <BigStat value={String(summary.farmer_income)} unit="บาท" label="รายได้เกษตรกร" />
              </View>
              <View style={styles.grid}>
                <BigStat value={String(summary.donated_kg)} unit="kg" label="บริจาค" />
                <BigStat value={String(summary.lot_count)} label="ล็อตที่ส่งมอบ" />
              </View>
            </Card>
            <SecondaryButton label="ย้อนกลับ" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
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
