import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { API_BASE_URL } from '../api/config';
import type { Crop, CropCategory, MarketLot } from '../api/types';
import { AppHeader } from '../components/Brand';
import {
  MarketFilterSheet,
  countActiveFilters,
  defaultMarketFilters,
  type MarketFilters,
  type SortKey,
} from '../components/MarketFilterSheet';
import { LocationPicker, type LatLng } from '../components/LocationPicker';
import {
  Badge,
  Body,
  Card,
  DataState,
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
  lotLocationLabel,
  marketSaleBadge,
  minOrderOf,
  priceComparisonBadge,
  remainingOf,
  splitAllowedOf,
} from '../lot/helpers';
import { formatTemplate, useI18n } from '../i18n';
import { C, cropTint, fonts, radius, urgency } from '../theme';

function photoUri(lot: MarketLot): string | null {
  const raw = lot.photos?.[0] ?? lot.photo_url ?? null;
  if (raw === null || raw === '') {
    return null;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

export default function MarketScreen(): React.ReactElement {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useI18n();

  return (
    <Screen fullWidth skipTopSafeArea>
      <AppHeader />
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
      {user !== null && !user.can_buy ? (
        <View style={styles.enableBuyBanner}>
          <Text style={styles.enableBuyText}>{t.market.enableBuy}</Text>
          <Pressable style={styles.enableBuyLink} onPress={() => router.push('/profile')}>
            <Text style={styles.enableBuyLinkText}>{t.market.goAccount}</Text>
          </Pressable>
        </View>
      ) : null}
      <MarketCatalog />
    </Screen>
  );
}

function MarketCatalog(): React.ReactElement {
  const { api, user } = useAuth();
  const { t, formatNumber, cropName } = useI18n();
  const router = useRouter();
  const now = useNow();
  const { width } = useWindowDimensions();
  const columns = width >= 960 ? 3 : width >= 600 ? 2 : 1;
  const singleColumn = columns === 1;
  const gridGap = 12;
  const [gridWidth, setGridWidth] = useState(0);
  const gridResizeObserver = useRef<ResizeObserver | null>(null);
  // Body applies paddingHorizontal via `padding: 16` on both sides (see ui.tsx `body` style).
  const bodyHorizontalPadding = 16 * 2;
  // Fallback until the grid's real width is known (e.g. before the first measurement
  // lands). This assumes the grid spans the full window, which is wrong on wide layouts
  // that add a side rail (see the ref callback below, which corrects it on web).
  const fallbackGridWidth = Math.max(0, width - bodyHorizontalPadding);
  const effectiveGridWidth = gridWidth > 0 ? gridWidth : fallbackGridWidth;
  const cardWidth = Math.floor((effectiveGridWidth - gridGap * (columns - 1)) / columns);

  // react-native-web's onLayout for a flex-wrap row is unreliable: it never fires once the
  // row's own width is driven by its parent (width: 100%) rather than its children, which
  // is exactly the fix needed to make cards render at all (see the `grid` style below). A
  // ResizeObserver on the underlying DOM node gives the real, sidebar-aware width instead
  // of the window-width fallback above. Runs as a ref callback (not useEffect) because the
  // grid only mounts once data has loaded, well after this component's initial mount.
  const gridRefCallback = useCallback((node: View | null) => {
    gridResizeObserver.current?.disconnect();
    gridResizeObserver.current = null;
    if (Platform.OS !== 'web' || typeof ResizeObserver === 'undefined' || node === null) {
      return;
    }
    const domNode = node as unknown as HTMLElement;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured !== undefined && measured > 0) {
        setGridWidth(measured);
      }
    });
    observer.observe(domNode);
    gridResizeObserver.current = observer;
  }, []);

  const [coords, setCoords] = useState<LatLng | null>(
    user?.lat != null && user?.lng != null ? { lat: user.lat, lng: user.lng } : null,
  );
  const [locationTried, setLocationTried] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [filters, setFilters] = useState<MarketFilters>(defaultMarketFilters);
  const [draftFilters, setDraftFilters] = useState<MarketFilters>(defaultMarketFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [cropQuery, setCropQuery] = useState('');
  const [selectedCropId, setSelectedCropId] = useState<number | null>(null);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [categories, setCategories] = useState<CropCategory[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [list, cats] = await Promise.all([api.getCrops(), api.getCropCategories()]);
        if (active) {
          setCrops(list);
          setCategories(cats);
        }
      } catch {
        if (active) {
          setCrops([]);
          setCategories([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    if (coords !== null || locationTried) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) {
          return;
        }
        if (permission.status !== 'granted') {
          // No location → show all lots by remaining time (not empty / not force picker).
          setLocationTried(true);
          setFilters((f) => ({ ...f, sort: 'urgent' }));
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) {
          return;
        }
        setCoords({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
        setFilters((f) => ({ ...f, sort: 'near' }));
      } catch {
        if (active) {
          setFilters((f) => ({ ...f, sort: 'urgent' }));
        }
      } finally {
        if (active) {
          setLocationTried(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [coords, locationTried]);

  const fetchMarket = useCallback(() => {
    const sort: SortKey = coords === null && filters.sort === 'near' ? 'urgent' : filters.sort;
    const priceMin = filters.priceMin === '' ? undefined : Number(filters.priceMin);
    const priceMax = filters.priceMax === '' ? undefined : Number(filters.priceMax);
    return api.getPublicMarket({
      ...(coords !== null ? { lat: coords.lat, lng: coords.lng, radius_km: filters.radiusKm } : {}),
      ...(filters.categoryId !== null ? { category_id: filters.categoryId } : {}),
      ...(selectedCropId !== null ? { crop_id: selectedCropId } : {}),
      ...(priceMin !== undefined && !Number.isNaN(priceMin) ? { price_min: priceMin } : {}),
      ...(priceMax !== undefined && !Number.isNaN(priceMax) ? { price_max: priceMax } : {}),
      ...(filters.maxHours !== null ? { max_hours: filters.maxHours } : {}),
      ...(cropQuery.trim() !== '' ? { q: cropQuery.trim() } : {}),
      ...(filters.cheaperOnly ? { cheaper_only: true } : {}),
      sort,
    });
  }, [api, coords, filters, selectedCropId, cropQuery]);

  const { data, loading, error, reload } = useApiData(fetchMarket, [
    coords?.lat,
    coords?.lng,
    filters.categoryId,
    filters.radiusKm,
    filters.priceMin,
    filters.priceMax,
    filters.maxHours,
    filters.sort,
    filters.cheaperOnly,
    selectedCropId,
    cropQuery,
  ]);

  const filteredCrops = useMemo(() => {
    const q = cropQuery.trim().toLowerCase();
    if (q === '') {
      return crops.slice(0, 12);
    }
    return crops
      .filter((c) => {
        const th = c.name_th.toLowerCase();
        const en = (c.name_en ?? '').toLowerCase();
        return th.includes(q) || en.includes(q);
      })
      .slice(0, 12);
  }, [crops, cropQuery]);

  const activeCount = countActiveFilters(filters, selectedCropId);
  const sortLabel =
    filters.sort === 'near' ? t.market.sortNear : filters.sort === 'cheap' ? t.market.sortCheap : t.market.sortUrgent;

  return (
    <Body>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={20} color={C.mute} />
          <TextInput
            style={styles.search}
            placeholder={t.market.searchCrop}
            placeholderTextColor={C.mute}
            value={cropQuery}
            onChangeText={setCropQuery}
            accessibilityLabel={t.market.searchCrop}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.market.filterOpen}
          style={styles.filterBtn}
          onPress={() => {
            setDraftFilters(filters);
            setFilterOpen(true);
          }}
        >
          <Feather name="sliders" size={20} color={C.white} />
          {activeCount > 0 ? (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cropScroll}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            selected: filters.categoryId === null && selectedCropId === null,
          }}
          style={[styles.chip, filters.categoryId === null && selectedCropId === null && styles.chipActive]}
          onPress={() => {
            setFilters((f) => ({ ...f, categoryId: null }));
            setSelectedCropId(null);
          }}
        >
          <Text
            style={[
              styles.chipText,
              filters.categoryId === null && selectedCropId === null && styles.chipTextActive,
            ]}
          >
            {t.market.allCrops}
          </Text>
        </Pressable>
        {categories.map((cat) => {
          const selected = filters.categoryId === cat.id;
          return (
            <Pressable
              key={cat.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => {
                setFilters((f) => ({ ...f, categoryId: selected ? null : cat.id }));
                setSelectedCropId(null);
              }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>{cropName(cat)}</Text>
            </Pressable>
          );
        })}
        {filteredCrops.map((crop) => {
          const selected = selectedCropId === crop.id;
          return (
            <Pressable
              key={crop.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => setSelectedCropId(selected ? null : crop.id)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>{cropName(crop)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {formatTemplate(t.market.nearYouCount, {
            count: data !== null ? formatNumber(data.length) : '—',
          })}
        </Text>
        <View style={styles.listHeaderActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowPicker(true)}
            style={styles.sortBtn}
          >
            <Feather name="map-pin" size={16} color={C.leaf} />
            <Text style={styles.sortBtnText}>{t.market.changeLocation}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDraftFilters(filters);
              setFilterOpen(true);
            }}
            style={styles.sortBtn}
          >
            <Text style={styles.sortBtnText}>
              {t.market.filterSort}: {sortLabel}
            </Text>
            <Feather name="chevron-down" size={16} color={C.leaf} />
          </Pressable>
        </View>
      </View>

      {showPicker ? (
        <Card>
          <LocationPicker
            value={coords}
            onChange={(next) => {
              setCoords(next);
              if (next !== null) {
                setFilters((f) => ({ ...f, sort: 'near' }));
                setShowPicker(false);
              }
            }}
            label={t.market.locationForDistance}
          />
        </Card>
      ) : null}

      <DataState
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        isEmpty={(lots) => lots.length === 0}
        emptyText={t.market.empty}
      >
        {(lots) => (
          <View
            ref={gridRefCallback}
            style={styles.grid}
            onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
          >
            {lots.map((lot) => {
              const hours = hoursLeftFrom(lot.expires_at, now);
              const tone = urgency(hours);
              const remaining = remainingOf(lot);
              const elig = donationEligibility(user, lot, remaining, donationEligibilityLabels(t));
              const available = availableAsOf(lot);
              const canBuy = available.includes('buy') && lot.price_per_kg !== null && remaining > 0;
              const saleBadge = marketSaleBadge(lot, {
                sell: t.market.badgeSell,
                donate: t.market.badgeDonate,
                donateOk: t.market.badgeDonateOk,
              });
              const priceCompare = priceComparisonBadge(
                lot,
                {
                  cheaper: t.market.priceCompareCheaper,
                  near: t.market.priceCompareNear,
                  higher: t.market.priceCompareHigher,
                },
                formatTemplate,
              );
              const dist =
                lot.distance_km !== null && lot.distance_km !== undefined
                  ? `${lot.distance_km.toFixed(1)} ${t.market.km}`
                  : null;
              const uri = photoUri(lot);
              const isMine = lot.is_mine === true;
              const bookingEnabled = !isMine && (user === null || user.can_buy);
              const title = cropName({ name_th: lot.crop_name_th, name_en: lot.crop_name_en });
              const meta = [
                lot.grade === 'substandard' ? t.market.gradeSub : t.market.gradeNormal,
                `${t.market.ripeness} ${lot.ripeness}`,
              ].join(' · ');
              const pct =
                lot.weight_kg > 0
                  ? Math.max(0, Math.min(100, Math.round((remaining / lot.weight_kg) * 100)))
                  : 0;

              if (singleColumn) {
                return (
                  <Pressable
                    key={lot.id}
                    style={[styles.rowCard, { width: cardWidth }, isMine ? styles.cardMine : null]}
                    onPress={() => router.push({ pathname: '/lots/[id]', params: { id: String(lot.id) } })}
                  >
                    {uri !== null ? (
                      <Image source={{ uri }} style={styles.rowThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.rowThumb, styles.rowThumbPlaceholder, { backgroundColor: cropTint(lot.crop_id ?? lot.id) }]}>
                        <Feather name="image" size={22} color={C.mute} />
                      </View>
                    )}
                    <View style={styles.rowBody}>
                      <View style={styles.rowTitleRow}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        <Badge text={formatCountdown(hours, t.countdown)} fg={tone.fg} bg={tone.bg} />
                      </View>
                      {lot.shop_name != null && lot.shop_name !== '' ? (
                        <Text style={styles.rowShop} numberOfLines={1}>
                          {lot.shop_name}
                        </Text>
                      ) : null}
                      {lot.price_per_kg !== null ? (
                        <View style={styles.rowPriceRow}>
                          <Text style={styles.rowPrice}>{formatNumber(lot.price_per_kg)}</Text>
                          <Text style={styles.rowPriceUnit}>
                            {t.dashboard.unitBaht}/{t.dashboard.unitKg}
                          </Text>
                          {priceCompare !== null ? (
                            <Text
                              style={[
                                styles.rowPriceCompare,
                                priceCompare.tone === 'cheaper' ? styles.priceCompareCheaper : null,
                              ]}
                            >
                              {priceCompare.text}
                            </Text>
                          ) : null}
                        </View>
                      ) : (
                        <Text style={styles.rowPriceDonate}>{t.market.badgeDonate}</Text>
                      )}
                      <Text style={styles.rowRemaining} numberOfLines={1}>
                        {t.market.remaining} {formatNumber(remaining)}/{formatNumber(lot.weight_kg)}{' '}
                        {t.dashboard.unitKg}
                      </Text>
                    </View>
                  </Pressable>
                );
              }

              return (
                <Pressable
                  key={lot.id}
                  style={[
                    styles.card,
                    { width: cardWidth },
                    isMine ? styles.cardMine : null,
                  ]}
                  onPress={() => router.push({ pathname: '/lots/[id]', params: { id: String(lot.id) } })}
                >
                  <View style={styles.photoWrap}>
                    {uri !== null ? (
                      <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
                    ) : (
                      <View style={[styles.photo, { backgroundColor: cropTint(lot.crop_id ?? lot.id) }]}>
                        <Feather name="image" size={28} color={C.mute} />
                        <Text style={styles.photoPlaceholderText}>{title}</Text>
                      </View>
                    )}
                    <View style={[styles.timeBadge, { backgroundColor: tone.bg }]}>
                      <Feather name="clock" size={12} color={tone.fg} />
                      <Text style={[styles.timeBadgeText, { color: tone.fg }]}>
                        {formatCountdown(hours, t.countdown)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {meta}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {lotLocationLabel(lot, t.market.plotFallback)}
                      {dist !== null ? ` · ${dist}` : ''}
                    </Text>
                    {lot.shop_name != null && lot.shop_name !== '' ? (
                      <Text style={styles.cardShop} numberOfLines={1}>
                        {lot.shop_name}
                      </Text>
                    ) : null}
                    {lot.description != null && lot.description !== '' ? (
                      <Text style={styles.cardDescription} numberOfLines={2}>
                        {lot.description}
                      </Text>
                    ) : null}
                    {saleBadge !== null || isMine || lot.grade === 'substandard' ? (
                      <View style={styles.badgeRow}>
                        {lot.grade === 'substandard' ? (
                          <Badge text={t.market.gradeSub} fg={C.turmeric} bg={C.turmericSoft} />
                        ) : null}
                        {saleBadge !== null ? (
                          <Badge
                            text={saleBadge.text}
                            fg={saleBadge.donate ? C.soonFg : C.leafDeep}
                            bg={saleBadge.donate ? C.soonBg : C.leafSoft}
                          />
                        ) : null}
                        {isMine ? (
                          <Badge text={t.market.ownLotBadge} fg={C.leafDeep} bg={C.leafSoft} />
                        ) : null}
                      </View>
                    ) : null}
                    {lot.price_per_kg !== null ? (
                      <View style={styles.priceRow}>
                        <Text style={styles.price}>{formatNumber(lot.price_per_kg)}</Text>
                        <Text style={styles.priceUnit}>
                          {t.dashboard.unitBaht}/{t.dashboard.unitKg}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.priceDonate}>{t.market.badgeDonate}</Text>
                    )}
                    {priceCompare !== null ? (
                      <Text
                        style={[
                          styles.priceCompare,
                          priceCompare.tone === 'cheaper' ? styles.priceCompareCheaper : null,
                        ]}
                      >
                        {priceCompare.text}
                      </Text>
                    ) : null}
                    <Text style={styles.cardMeta}>
                      {t.market.remaining} {formatNumber(remaining)}/{formatNumber(lot.weight_kg)}{' '}
                      {t.dashboard.unitKg}
                      {splitAllowedOf(lot)
                        ? ` · ${t.market.minOrder} ${formatNumber(minOrderOf(lot))}`
                        : ` · ${t.market.wholeLot}`}
                    </Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%` }]} />
                    </View>
                    {bookingEnabled && canBuy ? (
                      <Pressable
                        style={styles.cardCta}
                        onPress={() => router.push({ pathname: '/lots/[id]', params: { id: String(lot.id) } })}
                      >
                        <Text style={styles.cardCtaText}>{t.market.bookBuy}</Text>
                      </Pressable>
                    ) : bookingEnabled && available.includes('donate') && elig.canDonate ? (
                      <Pressable
                        style={[styles.cardCta, styles.cardCtaDonate]}
                        onPress={() => router.push({ pathname: '/lots/[id]', params: { id: String(lot.id) } })}
                      >
                        <Text style={styles.cardCtaText}>{t.market.requestDonation}</Text>
                      </Pressable>
                    ) : elig.reason !== null ? (
                      <Text style={styles.eligHint} numberOfLines={2}>
                        {elig.reason}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </DataState>

      <MarketFilterSheet
        visible={filterOpen}
        filters={draftFilters}
        categories={categories}
        resultCount={null}
        onChange={setDraftFilters}
        onApply={() => {
          setFilters(draftFilters);
          setFilterOpen(false);
        }}
        onReset={() => setDraftFilters(defaultMarketFilters)}
        onClose={() => setFilterOpen(false)}
      />
    </Body>
  );
}

const styles = StyleSheet.create({
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.leafSoft,
    borderRadius: radius.card,
  },
  guestText: { flex: 1, color: C.leafDeep, fontSize: 13, fontFamily: fonts.body },
  enableBuyBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: C.soonBg,
    borderRadius: radius.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  enableBuyText: { flex: 1, color: C.soonFg, fontSize: 13, fontFamily: fonts.body },
  enableBuyLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  enableBuyLinkText: { color: C.leaf, fontWeight: '700', fontFamily: fonts.bodySemi, fontSize: 13 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  searchBox: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.button,
  },
  search: { flex: 1, fontSize: 15, color: C.ink, fontFamily: fonts.body },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.button,
    backgroundColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.soonAccent,
    borderWidth: 2,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterCountText: { color: C.white, fontSize: 11, fontWeight: '700' },
  cropScroll: { marginTop: 4, marginBottom: 8, flexGrow: 0 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  chipActive: { backgroundColor: C.leafDeep, borderColor: C.leafDeep },
  chipText: { fontSize: 14, color: C.ink, fontFamily: fonts.body },
  chipTextActive: { color: C.white, fontWeight: '600', fontFamily: fonts.bodySemi },
  listHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: 4,
    marginBottom: 10,
  },
  listTitle: {
    flexShrink: 0,
    fontFamily: fonts.title,
    fontSize: 17,
    fontWeight: '600',
    color: C.ink,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  listHeaderActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  sortBtnText: { color: C.leaf, fontWeight: '600', fontSize: 14, fontFamily: fonts.bodySemi },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 24,
    width: '100%',
    alignSelf: 'stretch',
  },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.cardLg,
    overflow: 'hidden',
  },
  photoWrap: { height: 104, position: 'relative' },
  photo: {
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  photoPlaceholderText: {
    fontSize: 11,
    color: C.mute,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  timeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  timeBadgeText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },
  cardBody: { padding: 10, gap: 3 },
  cardTitle: {
    fontFamily: fonts.title,
    fontSize: 16,
    fontWeight: '600',
    color: C.ink,
  },
  cardMeta: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  cardShop: { fontSize: 12, color: C.leaf, fontWeight: '600', fontFamily: fonts.bodySemi },
  cardDescription: { fontSize: 12, color: C.mute, fontFamily: fonts.body, marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: 2, gap: 4 },
  cardMine: { borderColor: C.leaf, borderWidth: 1.5 },
  rowCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.cardLg,
  },
  rowThumb: { width: 96, height: 96, borderRadius: 12 },
  rowThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 3 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { flex: 1, fontFamily: fonts.title, fontSize: 15, fontWeight: '600', color: C.ink },
  rowShop: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  rowPriceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  rowPrice: { fontSize: 17, fontWeight: '700', color: C.ink, fontFamily: fonts.titleBold },
  rowPriceUnit: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  rowPriceCompare: { fontSize: 11, color: C.mute, fontFamily: fonts.body },
  rowPriceDonate: { marginTop: 2, fontSize: 15, fontWeight: '700', color: C.soonFg, fontFamily: fonts.titleBold },
  rowRemaining: { fontSize: 11, color: C.mute, fontFamily: fonts.body },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 6 },
  price: { fontSize: 20, fontWeight: '700', color: C.ink, fontFamily: fonts.titleBold },
  priceUnit: { fontSize: 12, color: C.mute, fontFamily: fonts.body },
  priceCompare: { fontSize: 11, color: C.mute, fontFamily: fonts.body, marginTop: 1 },
  priceCompareCheaper: { color: C.leafDeep, fontWeight: '600', fontFamily: fonts.bodySemi },
  priceDonate: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '700',
    color: C.soonFg,
    fontFamily: fonts.titleBold,
  },
  barTrack: {
    height: 4,
    backgroundColor: C.leafSoft,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: { height: 4, backgroundColor: C.leaf, borderRadius: 2 },
  cardCta: {
    marginTop: 8,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: C.leaf,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  cardCtaDonate: { backgroundColor: C.soonAccent },
  cardCtaText: {
    color: C.white,
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
    fontFamily: fonts.bodySemi,
  },
  eligHint: { marginTop: 6, fontSize: 11, color: C.mute, fontFamily: fonts.body },
});
