import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { API_BASE_URL } from '../api/config';
import type { Crop, MarketLot } from '../api/types';
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
  marketSaleBadge,
  minOrderOf,
  remainingOf,
  splitAllowedOf,
} from '../lot/helpers';
import { formatTemplate, useI18n } from '../i18n';
import { C, urgency } from '../theme';

type SortKey = 'near' | 'urgent' | 'cheap';

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
      {user !== null && !user.can_buy ? (
        <View style={styles.enableBuyBanner}>
          <Text style={styles.enableBuyText}>{t.market.enableBuyBrowse}</Text>
          <Pressable onPress={() => router.push('/(tabs)/account')}>
            <Text style={styles.enableBuyLink}>{t.market.goAccount}</Text>
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
  const columns = width >= 720 ? 3 : 2;

  const [coords, setCoords] = useState<LatLng | null>(
    user?.lat != null && user?.lng != null ? { lat: user.lat, lng: user.lng } : null,
  );
  const [locationTried, setLocationTried] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [sort, setSort] = useState<SortKey>('urgent');
  const [cropId, setCropId] = useState<number | null>(null);
  const [cropQuery, setCropQuery] = useState('');
  const [crops, setCrops] = useState<Crop[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await api.getCrops();
        if (active) {
          setCrops(list);
        }
      } catch {
        if (active) {
          setCrops([]);
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
          setLocationTried(true);
          setShowPicker(true);
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
        setSort('near');
      } catch {
        if (active) {
          setShowPicker(true);
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
    return api.getPublicMarket({
      ...(coords !== null ? { lat: coords.lat, lng: coords.lng, radius_km: 30 } : {}),
      ...(cropId !== null ? { crop_id: cropId } : {}),
      sort: coords === null && sort === 'near' ? 'urgent' : sort,
    });
  }, [api, coords, cropId, sort]);

  const { data, loading, error, reload } = useApiData(fetchMarket, [coords?.lat, coords?.lng, cropId, sort]);

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

  const goLot = (lot: MarketLot, intent: 'buy' | 'donate'): void => {
    const path = `/lots/${lot.id}?intent=${intent}`;
    if (user === null) {
      router.push({ pathname: '/login', params: { returnTo: path } });
      return;
    }
    if (!user.can_buy) {
      router.push('/(tabs)/account');
      return;
    }
    router.push({
      pathname: '/lots/[id]',
      params: { id: String(lot.id), intent },
    });
  };

  const sortLabel =
    sort === 'near' ? t.market.sortNear : sort === 'cheap' ? t.market.sortCheap : t.market.sortUrgent;

  const cardWidth = `${100 / columns - 1.5}%` as `${number}%`;

  return (
    <Body>
      <Text style={styles.heading}>{t.market.title}</Text>
      <Text style={styles.sub}>
        {coords !== null
          ? formatTemplate(t.market.subWithLocation, { sort: sortLabel })
          : t.market.subNoLocation}
      </Text>

      <View style={styles.sortRow}>
        {(
          [
            { key: 'urgent' as const, label: t.market.sortUrgent },
            { key: 'near' as const, label: t.market.sortNear },
            { key: 'cheap' as const, label: t.market.sortCheap },
          ] as const
        ).map((opt) => (
          <Pressable
            key={opt.key}
            style={[styles.chip, sort === opt.key && styles.chipActive]}
            onPress={() => {
              if (opt.key === 'near' && coords === null) {
                setShowPicker(true);
              }
              setSort(opt.key);
            }}
          >
            <Text style={[styles.chipText, sort === opt.key && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.chip} onPress={() => setShowPicker((v) => !v)}>
          <Text style={styles.chipText}>
            {coords !== null ? t.market.changeLocation : t.market.selectLocation}
          </Text>
        </Pressable>
      </View>

      {showPicker ? (
        <Card>
          <LocationPicker
            value={coords}
            onChange={(next) => {
              setCoords(next);
              if (next !== null) {
                setSort('near');
                setShowPicker(false);
              }
            }}
            label={t.market.locationForDistance}
          />
        </Card>
      ) : null}

      <TextInput
        style={styles.search}
        placeholder={t.market.searchCrop}
        placeholderTextColor={C.mute}
        value={cropQuery}
        onChangeText={setCropQuery}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cropScroll}>
        <Pressable
          style={[styles.chip, cropId === null && styles.chipActive]}
          onPress={() => setCropId(null)}
        >
          <Text style={[styles.chipText, cropId === null && styles.chipTextActive]}>
            {t.market.allCrops}
          </Text>
        </Pressable>
        {filteredCrops.map((crop) => (
          <Pressable
            key={crop.id}
            style={[styles.chip, cropId === crop.id && styles.chipActive]}
            onPress={() => setCropId(crop.id)}
          >
            <Text style={[styles.chipText, cropId === crop.id && styles.chipTextActive]}>
              {cropName(crop)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <DataState
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        isEmpty={(lots) => lots.length === 0}
        emptyText={t.market.empty}
      >
        {(lots) => (
          <View style={styles.grid}>
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
              const dist =
                lot.distance_km !== null && lot.distance_km !== undefined
                  ? `${lot.distance_km.toFixed(1)} ${t.market.km}`
                  : null;
              const uri = photoUri(lot);
              const bookingEnabled = user === null || user.can_buy;
              const title = cropName({ name_th: lot.crop_name_th, name_en: lot.crop_name_en });
              return (
                <Pressable
                  key={lot.id}
                  style={[styles.card, { width: cardWidth }]}
                  onPress={() =>
                    router.push({ pathname: '/lots/[id]', params: { id: String(lot.id) } })
                  }
                >
                  {uri !== null ? (
                    <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
                  ) : (
                    <View style={[styles.photo, styles.photoPlaceholder]}>
                      <Text style={styles.photoPlaceholderText}>{title}</Text>
                    </View>
                  )}
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {title}
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
                    </View>
                    <Text style={styles.cardLine}>
                      {t.market.remaining} {formatNumber(remaining)} / {formatNumber(lot.weight_kg)}{' '}
                      {t.dashboard.unitKg}
                      {splitAllowedOf(lot)
                        ? ` · ${t.market.minOrder} ${formatNumber(minOrderOf(lot))} ${t.dashboard.unitKg}`
                        : ` · ${t.market.wholeLot}`}
                    </Text>
                    <Text style={styles.cardLine}>
                      {lot.plot_name ?? t.market.plotFallback}
                      {dist !== null ? ` · ${dist}` : ''}
                    </Text>
                    {lot.price_per_kg !== null ? (
                      <Text style={styles.price}>
                        {formatNumber(lot.price_per_kg)} {t.dashboard.unitBaht}/{t.dashboard.unitKg}
                      </Text>
                    ) : (
                      <Text style={styles.price}>{t.market.badgeDonate}</Text>
                    )}
                    {bookingEnabled ? (
                      <View style={styles.actions}>
                        {canBuy ? (
                          <PrimaryButton
                            label={t.market.bookBuy}
                            block
                            onPress={() => goLot(lot, 'buy')}
                          />
                        ) : null}
                        {(elig.canDonate || (user === null && available.includes('donate'))) &&
                        remaining > 0 ? (
                          <PrimaryButton
                            label={t.market.requestDonation}
                            tone="turmeric"
                            block
                            onPress={() => goLot(lot, 'donate')}
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </DataState>
    </Body>
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
  enableBuyBanner: {
    backgroundColor: C.leafSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  enableBuyText: { color: C.ink },
  enableBuyLink: { color: C.leaf, fontWeight: '800' },
  heading: { fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 4 },
  sub: { color: C.mute, marginBottom: 12 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C.leafSoft,
  },
  chipActive: { backgroundColor: C.leaf },
  chipText: { color: C.leaf, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  search: {
    borderWidth: 1,
    borderColor: C.leafSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: C.ink,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  cropScroll: { marginBottom: 12, maxHeight: 44 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: C.leafSoft,
  },
  photo: { width: '100%', height: 120, backgroundColor: C.leafSoft },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoPlaceholderText: { color: C.leaf, fontWeight: '700' },
  cardBody: { padding: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.ink, flex: 1 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 4 },
  cardLine: { color: C.ink, fontSize: 13, marginBottom: 2 },
  price: { fontWeight: '800', color: C.leaf, marginTop: 4, marginBottom: 6 },
  actions: { gap: 8, marginTop: 4 },
});
