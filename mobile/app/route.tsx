import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Body,
  Card,
  DataState,
  EmptyState,
  LoginPrompt,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Badge,
} from '../src/components/ui';
import { formatIsoSlotShort } from '../src/components/PickupSlotPicker';
import { useAuth } from '../src/context/AuthContext';
import { useApiData } from '../src/hooks/useApiData';
import { formatTemplate, useI18n } from '../src/i18n';
import { googleDirectionsUrl, googleMapsUrl } from '../src/lot/helpers';
import { C, fonts } from '../src/theme';

function bangkokDateString(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  // Prefer browser local date (demo runs in user TZ); server interprets YYYY-MM-DD as Bangkok day.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function RouteScreen(): React.ReactElement {
  const { user, api } = useAuth();
  const { t, formatNumber } = useI18n();
  const router = useRouter();
  const [dayOffset, setDayOffset] = useState<0 | 1>(0);
  const date = bangkokDateString(dayOffset);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading, error, reload } = useApiData(
    () => api.getBuyerRoute(date),
    [date, refreshKey, user?.id ?? null],
  );

  useEffect(() => {
    setRefreshKey((v) => v + 1);
  }, [date]);

  const slotLabels = useMemo(
    () => ({ today: t.confirmBooking.today, tomorrow: t.confirmBooking.tomorrow }),
    [t],
  );

  if (user === null) {
    return (
      <Screen>
        <LoginPrompt
          title={t.route.title}
          message={t.route.subtitle}
          returnTo="/route"
        />
      </Screen>
    );
  }
  if (!user.can_buy) {
    return (
      <Screen>
        <EmptyState
          message={t.orders.enableBuy}
          ctaLabel={t.orders.goAccount}
          onCta={() => router.push('/profile')}
        />
      </Screen>
    );
  }

  const locationIssue =
    error !== null && error.includes('LOCATION');

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.h1}>{t.route.title}</Text>
        <Text style={styles.sub}>{t.route.subtitle}</Text>
      </View>
      <View style={styles.dayToggle}>
        {([0, 1] as const).map((offset) => (
          <Pressable
            key={offset}
            accessibilityRole="button"
            accessibilityState={{ selected: dayOffset === offset }}
            style={[styles.dayBtn, dayOffset === offset ? styles.dayBtnOn : null]}
            onPress={() => setDayOffset(offset)}
          >
            <Text style={[styles.dayBtnText, dayOffset === offset ? styles.dayBtnTextOn : null]}>
              {offset === 0 ? t.route.today : t.route.tomorrow}
            </Text>
          </Pressable>
        ))}
      </View>

      <Body>
        {locationIssue ? (
          <Card>
            <Text style={styles.err}>{t.route.locationRequired}</Text>
            <SecondaryButton label={t.account.profile} block onPress={() => {}} />
          </Card>
        ) : null}
        <DataState
          loading={loading}
          error={locationIssue ? null : error}
          data={data}
          onRetry={reload}
          isEmpty={(r) => r.stops.length === 0}
          emptyText={t.route.empty}
        >
          {(route) => (
            <>
              <Card>
                <Badge
                  text={
                    route.ordered_by === 'pickup_slot' ? t.route.orderedBySlot : t.route.orderedByDistance
                  }
                  fg={C.leaf}
                  bg={C.leafSoft}
                />
                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{formatNumber(route.route_km)} {t.market.km}</Text>
                    <Text style={styles.statLabel}>{t.route.routeKm}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValueMute}>{formatNumber(route.naive_km)} {t.market.km}</Text>
                    <Text style={styles.statLabel}>{t.route.naiveKm}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>
                      {formatNumber(route.savings_km)} {t.market.km}
                    </Text>
                    <Text style={styles.statLabel}>{t.route.savingsKm}</Text>
                  </View>
                </View>
                <PrimaryButton
                  label={t.route.openRoute}
                  block
                  onPress={() => {
                    const waypoints = route.stops.map((s) => ({ lat: s.lat, lng: s.lng }));
                    void Linking.openURL(
                      googleDirectionsUrl(route.depot, waypoints, route.depot),
                    );
                  }}
                />
              </Card>

              {route.stops.map((stop, index) => (
                <Card key={`${stop.order_id}-${String(index)}`}>
                  <View style={styles.stopHead}>
                    <Text style={styles.stopTitle}>
                      {formatTemplate(t.route.stopIndex, { n: index + 1 })} · {stop.shop_name}
                    </Text>
                    <Badge
                      text={`${t.route.leg} ${formatNumber(stop.leg_km)} ${t.market.km}`}
                      fg={C.mute}
                      bg={C.bg}
                    />
                  </View>
                  <Text style={styles.meta}>{stop.location_label ?? stop.plot_name}</Text>
                  <Text style={styles.slot}>
                    {t.route.slot}:{' '}
                    {formatIsoSlotShort(stop.pickup_slot_start, stop.pickup_slot_end, slotLabels)}
                  </Text>
                  <Text style={styles.itemsLabel}>{t.route.items}</Text>
                  {stop.items.map((item) => (
                    <Text key={`${String(item.quantity_kg)}-${item.crop_name_th}`} style={styles.item}>
                      · {item.crop_name_th}
                      {item.crop_name_en != null && item.crop_name_en !== ''
                        ? ` (${item.crop_name_en})`
                        : ''}{' '}
                      {formatNumber(item.quantity_kg)} {t.common.kg}
                    </Text>
                  ))}
                  <Text style={styles.otp}>{t.route.otpHint}: {stop.drop_otp}</Text>
                  <SecondaryButton
                    label={t.route.openStop}
                    block
                    onPress={() => void Linking.openURL(googleMapsUrl(stop.lat, stop.lng))}
                  />
                </Card>
              ))}
            </>
          )}
        </DataState>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 4 },
  h1: { fontFamily: fonts.titleBold, fontSize: 24, fontWeight: '700', color: C.ink },
  sub: { fontFamily: fonts.body, fontSize: 13, color: C.mute },
  dayToggle: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  dayBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnOn: { backgroundColor: C.leaf, borderColor: C.leaf },
  dayBtnText: { fontWeight: '600', color: C.ink, fontFamily: fonts.bodySemi },
  dayBtnTextOn: { color: C.white },
  err: { color: C.chili, marginBottom: 8, fontFamily: fonts.body },
  statRow: { flexDirection: 'row', gap: 8, marginVertical: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 16, fontWeight: '800', color: C.leaf, fontFamily: fonts.titleBold },
  statValueMute: { fontSize: 16, fontWeight: '700', color: C.mute, fontFamily: fonts.titleBold },
  statLabel: { fontSize: 11, color: C.mute, textAlign: 'center', fontFamily: fonts.body },
  stopHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  stopTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.ink, fontFamily: fonts.bodySemi },
  meta: { color: C.mute, fontSize: 13, marginBottom: 4, fontFamily: fonts.body },
  slot: { color: C.leafDeep, fontWeight: '600', marginBottom: 6, fontFamily: fonts.bodySemi },
  itemsLabel: { fontSize: 12, color: C.mute, marginBottom: 2, fontFamily: fonts.bodySemi },
  item: { color: C.ink, fontSize: 14, marginBottom: 2, fontFamily: fonts.body },
  otp: { color: C.soonFg, marginVertical: 8, fontWeight: '600', fontFamily: fonts.bodySemi },
});
