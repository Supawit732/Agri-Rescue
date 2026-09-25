import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../../src/api/config';
import type { Shop, ShopLotRow } from '../../src/api/types';
import { LogoMark, initialsOf } from '../../src/components/LogoMark';
import { Badge, Body, DataState, PrimaryButton, Screen, StackHeader } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useApiData } from '../../src/hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../../src/hooks/useNow';
import { formatTemplate, useI18n } from '../../src/i18n';
import { C, cropTint, fonts, radius, urgency } from '../../src/theme';

function mediaUri(raw: string | null): string | null {
  if (raw === null || raw === '') return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

export default function ShopScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ userId?: string; lat?: string; lng?: string }>();
  const userId = Number(params.userId);
  const lat = params.lat !== undefined ? Number(params.lat) : undefined;
  const lng = params.lng !== undefined ? Number(params.lng) : undefined;
  const { user, api } = useAuth();
  const { t, formatNumber, cropName } = useI18n();
  const router = useRouter();
  const now = useNow();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'selling' | 'sold'>('selling');
  const [busy, setBusy] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);

  const fetchShop = useCallback(() => api.getShop(userId, lat, lng), [api, userId, lat, lng]);
  const { data, loading, error, reload } = useApiData(fetchShop, [userId, lat, lng]);
  useEffect(() => {
    if (data !== null) setShop(data);
  }, [data]);

  const lotsQuery = useCallback(
    () => api.getShopLots(userId, tab),
    [api, userId, tab],
  );
  const lots = useApiData(lotsQuery, [userId, tab]);

  if (!Number.isInteger(userId) || userId <= 0) {
    return (
      <Screen>
        <StackHeader title={t.shop.title} onBack={() => router.replace('/(tabs)')} />
        <Body>
          <Text>{t.shop.notFound}</Text>
        </Body>
      </Screen>
    );
  }

  const isOwner = user?.id === userId;
  const following = shop?.is_following ?? false;

  const toggleFollow = async (): Promise<void> => {
    if (user === null) {
      router.push({ pathname: '/login', params: { returnTo: `/shops/${userId}` } });
      return;
    }
    setBusy(true);
    try {
      const next = following
        ? await api.unfollowShop(userId)
        : await api.followShop(userId);
      setShop(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen fullWidth>
      <View style={[styles.cover, { paddingTop: insets.top }]}>
        {shop?.cover != null && mediaUri(shop.cover) !== null ? (
          <Image source={{ uri: mediaUri(shop.cover)! }} style={styles.coverImg} />
        ) : shop?.avatar != null && mediaUri(shop.avatar) !== null ? (
          <Image source={{ uri: mediaUri(shop.avatar)! }} style={styles.coverImg} />
        ) : (
          <View style={styles.coverFallback} />
        )}
        <View style={[styles.backBtnWrap, { top: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.common.back}
            style={styles.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          >
            <Feather name="arrow-left" size={20} color={C.ink} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.avatar}>
          {shop?.avatar != null && mediaUri(shop.avatar) !== null ? (
            <Image source={{ uri: mediaUri(shop.avatar)! }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{initialsOf(shop?.name ?? '?')}</Text>
          )}
        </View>

        <DataState loading={loading} error={error} data={data} onRetry={reload} emptyText={t.shop.notFound}>
          {(s) => (
            <>
              <Text style={styles.title}>{s.name}</Text>
              <View style={styles.metaRow}>
                <Feather name="map-pin" size={14} color={C.mute} />
                <Text style={styles.meta}>
                  {[
                    s.location_label ?? t.market.plotFallback,
                    s.distance_km !== null
                      ? formatTemplate(t.shop.distance, { value: s.distance_km })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {s.common_crops.length > 0 ? (
                <Text style={styles.meta}>
                  {t.shop.commonCrops}:{' '}
                  {s.common_crops
                    .map((c) => cropName({ name_th: c.name_th, name_en: c.name_en }))
                    .join(' · ')}
                </Text>
              ) : null}
              {s.description !== null && s.description !== '' ? (
                <Text style={styles.desc}>{s.description}</Text>
              ) : null}

              <View style={styles.stats}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{formatNumber(s.stats.delivered_orders)}</Text>
                  <Text style={styles.statLabel}>{t.shop.delivered}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{formatNumber(s.stats.followers)}</Text>
                  <Text style={styles.statLabel}>{t.shop.followers}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {formatNumber(s.stats.kg_saved)} {t.dashboard.unitKg}
                  </Text>
                  <Text style={styles.statLabel}>{t.shop.kgSaved}</Text>
                </View>
              </View>

              {!isOwner ? (
                <View style={styles.followBlock}>
                  <PrimaryButton
                    label={following ? t.shop.unfollow : t.shop.follow}
                    onPress={() => void toggleFollow()}
                    loading={busy}
                  />
                  <Text style={styles.followHint}>{t.shop.followHint}</Text>
                </View>
              ) : null}

              <View style={styles.tabs}>
                <Pressable
                  style={[styles.tabBtn, tab === 'selling' ? styles.tabBtnOn : null]}
                  onPress={() => setTab('selling')}
                >
                  <Text style={[styles.tabText, tab === 'selling' ? styles.tabTextOn : null]}>
                    {t.shop.selling} {lots.data !== null ? lots.data.length : ''}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tabBtn, tab === 'sold' ? styles.tabBtnOn : null]}
                  onPress={() => setTab('sold')}
                >
                  <Text style={[styles.tabText, tab === 'sold' ? styles.tabTextOn : null]}>
                    {t.shop.sold}
                  </Text>
                </Pressable>
              </View>

              <DataState
                loading={lots.loading}
                error={lots.error}
                data={lots.data}
                onRetry={lots.reload}
                isEmpty={(list) => list.length === 0}
                emptyText={tab === 'selling' ? t.shop.emptySelling : t.shop.emptySold}
              >
                {(list) => (
                  <View style={styles.lotList}>
                    {list.map((lot: ShopLotRow) => {
                      const hours = hoursLeftFrom(lot.expires_at, now);
                      const tone = urgency(hours);
                      const remaining = Number(lot.weight_kg);
                      const uri = mediaUri(lot.photo_url);
                      const title = cropName({ name_th: lot.crop_name_th, name_en: lot.crop_name_en });
                      const meta = [
                        lot.grade === 'substandard' ? t.market.gradeSub : t.market.gradeNormal,
                        `${t.market.ripeness} ${lot.ripeness}`,
                      ].join(' · ');
                      return (
                        <Pressable
                          key={lot.id}
                          style={styles.lotCard}
                          onPress={() => router.push({ pathname: '/lots/[id]', params: { id: String(lot.id) } })}
                        >
                          <View style={[styles.lotThumb, { backgroundColor: cropTint(lot.crop_id) }]}>
                            {uri !== null ? <Image source={{ uri }} style={styles.lotThumbImg} /> : (
                              <Feather name="image" size={22} color={C.mute} />
                            )}
                          </View>
                          <View style={styles.lotBody}>
                            <View style={styles.lotHeader}>
                              <Text style={styles.lotTitle} numberOfLines={1}>
                                {title}
                              </Text>
                              <Badge text={formatCountdown(hours, t.countdown)} fg={tone.fg} bg={tone.bg} />
                            </View>
                            <Text style={styles.lotMeta}>
                              {meta} · {t.market.remaining} {formatNumber(remaining)} {t.dashboard.unitKg}
                            </Text>
                            {lot.start_price_per_kg !== null ? (
                              <View style={styles.priceRow}>
                                <Text style={styles.price}>{formatNumber(lot.start_price_per_kg)}</Text>
                                <Text style={styles.priceUnit}>
                                  {t.dashboard.unitBaht}/{t.dashboard.unitKg}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.priceDonate}>{t.market.badgeDonate}</Text>
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </DataState>
            </>
          )}
        </DataState>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { height: 190, position: 'relative' },
  coverImg: { width: '100%', height: '100%' },
  coverFallback: { flex: 1, backgroundColor: '#D7E5D3' },
  backBtnWrap: { position: 'absolute', left: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 16, paddingBottom: 40, gap: 6 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: C.leaf,
    borderWidth: 4,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -36,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontFamily: fonts.titleBold, fontSize: 26, fontWeight: '700', color: C.white },
  title: { fontFamily: fonts.titleBold, fontSize: 24, fontWeight: '700', color: C.ink, marginTop: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 13, color: C.mute, fontFamily: fonts.body },
  desc: { fontSize: 14, color: C.ink, marginTop: 6, lineHeight: 20, fontFamily: fonts.body },
  stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.control,
    padding: 10,
    gap: 2,
  },
  statValue: { fontFamily: fonts.titleBold, fontSize: 18, fontWeight: '700', color: C.ink },
  statLabel: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  followBlock: { marginTop: 14, gap: 6 },
  followHint: { fontSize: 12, color: C.mute, textAlign: 'center', fontFamily: fonts.body },
  tabs: {
    flexDirection: 'row',
    backgroundColor: C.leafSoft,
    borderRadius: radius.control,
    padding: 4,
    marginTop: 14,
  },
  tabBtn: {
    flex: 1,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnOn: { backgroundColor: C.surface },
  tabText: { fontSize: 14, color: C.mute, fontFamily: fonts.body },
  tabTextOn: { color: C.leafDeep, fontWeight: '600', fontFamily: fonts.bodySemi },
  lotList: { marginTop: 12, gap: 10 },
  lotCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.card,
    padding: 10,
  },
  lotThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  lotThumbImg: { width: '100%', height: '100%' },
  lotBody: { flex: 1, gap: 2, minWidth: 0 },
  lotHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  lotTitle: { fontFamily: fonts.title, fontSize: 16, fontWeight: '600', color: C.ink, flex: 1 },
  lotMeta: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 4 },
  price: { fontSize: 18, fontWeight: '700', color: C.ink, fontFamily: fonts.titleBold },
  priceUnit: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  priceDonate: { fontSize: 16, fontWeight: '700', color: C.soonFg, marginTop: 4, fontFamily: fonts.titleBold },
});
