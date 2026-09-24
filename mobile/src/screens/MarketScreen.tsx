import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import {
  Badge,
  Body,
  Card,
  DataState,
  EmptyState,
  PrimaryButton,
  Screen,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../hooks/useNow';
import {
  availableAsOf,
  donationEligibility,
  donationEligibilityLabels,
  marketSaleBadge,
  minOrderOf,
  remainingOf,
  splitAllowedOf,
} from '../lot/helpers';
import { useI18n } from '../i18n';
import { C, urgency } from '../theme';

type ViewerCoords = { lat: number; lng: number } | null;

export default function MarketScreen(): React.ReactElement {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useI18n();

  if (user !== null && !user.can_buy) {
    return (
      <Screen>
        <EmptyState
          message={t.market.enableBuy}
          ctaLabel={t.market.goAccount}
          onCta={() => router.push('/(tabs)/account')}
        />
      </Screen>
    );
  }

  return <MarketList />;
}

function MarketList(): React.ReactElement {
  const { api, user } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [coords, setCoords] = useState<ViewerCoords>(null);
  const [coordsReady, setCoordsReady] = useState(false);
  const now = useNow();

  useEffect(() => {
    let active = true;
    void (async () => {
      if (user?.lat != null && user.lng != null) {
        if (active) {
          setCoords({ lat: user.lat, lng: user.lng });
          setCoordsReady(true);
        }
        return;
      }
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (active) {
            setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
          }
        } else if (active) {
          setCoords(null);
        }
      } catch {
        if (active) {
          setCoords(null);
        }
      } finally {
        if (active) {
          setCoordsReady(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.lat, user?.lng]);

  const loggedInBuyer = user !== null && user.can_buy;
  const { data, loading, error, reload } = useApiData(
    () => {
      if (!coordsReady) {
        return Promise.resolve([] as Awaited<ReturnType<typeof api.getPublicMarket>>);
      }
      if (loggedInBuyer) {
        const lat = coords?.lat ?? user.lat ?? 13.65;
        const lng = coords?.lng ?? user.lng ?? 100.62;
        return api.getMarket(lat, lng, 15);
      }
      if (coords !== null) {
        return api.getPublicMarket(coords.lat, coords.lng, 15);
      }
      return api.getPublicMarket();
    },
    [coordsReady, coords?.lat, coords?.lng, loggedInBuyer, user?.id, user?.lat, user?.lng],
  );

  const listLoading = !coordsReady || loading;

  return (
    <Screen>
      {user === null ? (
        <View style={styles.guestBanner}>
          <Text style={styles.guestText}>{t.market.guestBanner}</Text>
          <PrimaryButton
            label={t.common.login}
            onPress={() =>
              router.push({ pathname: '/login', params: { returnTo: '/(tabs)' } })
            }
          />
        </View>
      ) : null}
      <DataState
        loading={listLoading}
        error={error}
        data={coordsReady ? data : null}
        onRetry={reload}
        isEmpty={(lots) => lots.length === 0}
        emptyText={t.market.empty}
      >
        {(lots) => (
          <Body>
            {lots.map((lot) => {
              const hours = hoursLeftFrom(lot.expires_at, now);
              const tone = urgency(hours);
              const remaining = remainingOf(lot);
              const elig = donationEligibility(user, lot, remaining, donationEligibilityLabels(t));
              const available = availableAsOf(lot);
              const canBuy =
                available.includes('buy') && lot.price_per_kg !== null && remaining > 0;
              const saleBadge = marketSaleBadge(lot, {
                sell: t.market.badgeSell,
                donate: t.market.badgeDonate,
                donateOk: t.market.badgeDonateOk,
              });
              const areaParts = [lot.subdistrict_th, lot.district_th].filter(
                (part): part is string => part !== null && part !== undefined && part !== '',
              );
              const area = lot.area_th ?? lot.plot_name ?? (areaParts.length > 0 ? areaParts.join(' ') : null);
              const dist =
                lot.distance_km !== null && lot.distance_km !== undefined
                  ? `${lot.distance_km.toFixed(1)} ${t.market.km}`
                  : t.market.distanceUnknown;
              const cropTitle =
                locale === 'en' && lot.crop_name_en
                  ? `${lot.crop_name_en} (${lot.crop_name_th})`
                  : lot.crop_name_en
                    ? `${lot.crop_name_th} (${lot.crop_name_en})`
                    : lot.crop_name_th;
              return (
                <Card key={lot.id}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>
                      {cropTitle} · {t.market.remaining} {remaining} / {lot.weight_kg} {t.dashboard.unitKg}
                    </Text>
                    <Badge text={formatCountdown(hours, t.countdown)} fg={tone.fg} bg={tone.bg} />
                  </View>
                  <View style={styles.badgeRow}>
                    {saleBadge !== null ? (
                      <Badge
                        text={saleBadge.text}
                        fg={saleBadge.donate ? C.turmeric : C.leaf}
                        bg={saleBadge.donate ? C.turmericSoft : C.leafSoft}
                      />
                    ) : null}
                    {user !== null && elig.badge !== null && available.includes('donate') ? (
                      <Badge
                        text={elig.badge}
                        fg={elig.canDonate ? C.turmeric : C.mute}
                        bg={elig.canDonate ? C.turmericSoft : C.leafSoft}
                      />
                    ) : null}
                  </View>
                  {lot.farmer_name !== undefined ? (
                    <Text style={styles.cardLine}>
                      {t.market.byFarmer} {lot.farmer_name}
                    </Text>
                  ) : null}
                  <Text style={styles.cardLine}>
                    {dist}
                    {area !== null ? ` · ${area}` : ''}
                    {` · ${lot.grade === 'substandard' ? t.market.gradeSub : t.market.gradeNormal}`}
                    {splitAllowedOf(lot)
                      ? ` · ${t.market.minOrder} ${minOrderOf(lot)} ${t.dashboard.unitKg}`
                      : ` · ${t.market.wholeLot}`}
                  </Text>
                  {user !== null && !elig.canDonate && elig.reason !== null ? (
                    <Text style={styles.reason}>{elig.reason}</Text>
                  ) : null}
                  <View style={styles.actions}>
                    {canBuy || (user === null && available.includes('buy')) ? (
                      <View style={styles.slot}>
                        <PrimaryButton
                          label={
                            lot.price_per_kg !== null
                              ? `${t.market.buy} ${lot.price_per_kg} ${t.dashboard.unitBaht}/${t.dashboard.unitKg}`
                              : t.market.buy
                          }
                          block
                          onPress={() => {
                            if (user === null) {
                              router.push({
                                pathname: '/login',
                                params: { returnTo: `/lots/${lot.id}?intent=buy` },
                              });
                              return;
                            }
                            router.push({
                              pathname: '/lots/[id]',
                              params: { id: String(lot.id), intent: 'buy' },
                            });
                          }}
                        />
                      </View>
                    ) : null}
                    {(user === null && available.includes('donate')) ||
                    (user !== null && elig.canDonate && remaining > 0) ? (
                      <View style={styles.slot}>
                        <PrimaryButton
                          label={t.market.requestDonation}
                          tone="turmeric"
                          block
                          onPress={() => {
                            if (user === null) {
                              router.push({
                                pathname: '/login',
                                params: { returnTo: `/lots/${lot.id}?intent=donate` },
                              });
                              return;
                            }
                            router.push({
                              pathname: '/lots/[id]',
                              params: { id: String(lot.id), intent: 'donate' },
                            });
                          }}
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
  guestBanner: {
    backgroundColor: C.leafSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  guestText: { color: C.ink, fontWeight: '700', fontSize: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink, flex: 1, marginRight: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  cardLine: { color: C.ink, marginBottom: 4 },
  reason: { color: C.chili, marginTop: 6, marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slot: { flexGrow: 1, flexBasis: '45%', minWidth: 160 },
});
