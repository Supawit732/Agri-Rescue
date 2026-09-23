import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Body,
  Card,
  DataState,
  EmptyState,
  LoginPrompt,
  PrimaryButton,
  Screen,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../hooks/useNow';
import {
  availableAsOf,
  donationEligibility,
  marketSaleBadge,
  minOrderOf,
  remainingOf,
  splitAllowedOf,
} from '../lot/helpers';
import { C, urgency } from '../theme';

export default function MarketScreen(): React.ReactElement {
  const { api, user } = useAuth();
  const router = useRouter();

  if (user === null) {
    return (
      <Screen>
        <LoginPrompt
          title="ตลาดด่วน"
          message="เข้าสู่ระบบเพื่อดูล็อตใกล้คุณและจองซื้อหรือขอรับบริจาค"
          returnTo="/(tabs)"
        />
      </Screen>
    );
  }

  if (!user.can_buy) {
    return (
      <Screen>
        <EmptyState
          message="ยังไม่ได้เปิดการซื้อ — ไปที่บัญชีเพื่อเปิดสิทธิ์ซื้อ"
          ctaLabel="ไปที่บัญชี"
          onCta={() => router.push('/(tabs)/account')}
        />
      </Screen>
    );
  }

  return <MarketList />;
}

function MarketList(): React.ReactElement {
  const { api, user } = useAuth();
  const router = useRouter();
  const lat = user?.lat ?? 13.65;
  const lng = user?.lng ?? 100.62;
  const { data, loading, error, reload } = useApiData(() => api.getMarket(lat, lng, 15), [lat, lng]);
  const now = useNow();

  return (
    <Screen>
      <DataState
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        isEmpty={(lots) => lots.length === 0}
        emptyText="ยังไม่มีล็อตใกล้คุณในตอนนี้"
      >
        {(lots) => (
          <Body>
            {lots.map((lot) => {
              const hours = hoursLeftFrom(lot.expires_at, now);
              const tone = urgency(hours);
              const remaining = remainingOf(lot);
              const elig = donationEligibility(user, lot, remaining);
              const available = availableAsOf(lot);
              const canBuy = available.includes('buy') && lot.price_per_kg !== null && remaining > 0;
              const saleBadge = marketSaleBadge(lot);
              const dist =
                lot.distance_km !== null && lot.distance_km !== undefined
                  ? `${lot.distance_km.toFixed(1)} กม.`
                  : 'ระยะทางไม่ระบุ';
              return (
                <Card key={lot.id}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>
                      {lot.crop_name_th} · เหลือ {remaining} / {lot.weight_kg} กก.
                    </Text>
                    <Badge text={formatCountdown(hours)} fg={tone.fg} bg={tone.bg} />
                  </View>
                  <View style={styles.badgeRow}>
                    {saleBadge !== null ? (
                      <Badge
                        text={saleBadge.text}
                        fg={saleBadge.donate ? C.turmeric : C.leaf}
                        bg={saleBadge.donate ? C.turmericSoft : C.leafSoft}
                      />
                    ) : null}
                    {elig.badge !== null && available.includes('donate') ? (
                      <Badge
                        text={elig.badge}
                        fg={elig.canDonate ? C.turmeric : C.mute}
                        bg={elig.canDonate ? C.turmericSoft : C.leafSoft}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.cardLine}>โดย {lot.farmer_name}</Text>
                  <Text style={styles.cardLine}>
                    {dist} · {lot.grade === 'substandard' ? 'ตกเกรด' : 'ปกติ'}
                    {splitAllowedOf(lot) ? ` · ขั้นต่ำ ${minOrderOf(lot)} กก.` : ' · ขายยกล็อต'}
                  </Text>
                  {!elig.canDonate && elig.reason !== null ? (
                    <Text style={styles.reason}>{elig.reason}</Text>
                  ) : null}
                  <View style={styles.actions}>
                    {canBuy ? (
                      <View style={styles.slot}>
                        <PrimaryButton
                          label={`ซื้อ ${lot.price_per_kg} บาท/กก.`}
                          block
                          onPress={() =>
                            router.push({
                              pathname: '/lots/[id]',
                              params: { id: String(lot.id), intent: 'buy' },
                            })
                          }
                        />
                      </View>
                    ) : null}
                    {elig.canDonate && remaining > 0 ? (
                      <View style={styles.slot}>
                        <PrimaryButton
                          label="ขอรับบริจาค"
                          tone="turmeric"
                          block
                          onPress={() =>
                            router.push({
                              pathname: '/lots/[id]',
                              params: { id: String(lot.id), intent: 'donate' },
                            })
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </Body>
        )}
      </DataState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink, flex: 1, marginRight: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  cardLine: { color: C.ink, marginBottom: 4 },
  reason: { color: C.chili, marginTop: 6, marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slot: { flexGrow: 1, flexBasis: '45%', minWidth: 160 },
});
