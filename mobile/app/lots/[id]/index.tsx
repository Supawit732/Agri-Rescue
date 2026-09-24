import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../../src/api/config';
import type { MarketLot } from '../../../src/api/types';
import {
  Badge,
  Body,
  Card,
  DataState,
  PrimaryButton,
  SecondaryButton,
  SubScreen,
} from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { useApiData } from '../../../src/hooks/useApiData';
import { formatCountdown, hoursLeftFrom, useNow } from '../../../src/hooks/useNow';
import { formatTemplate, useI18n } from '../../../src/i18n';
import {
  availableAsOf,
  defaultQuantity,
  donationEligibility,
  donationEligibilityLabels,
  marketSaleBadge,
  minOrderOf,
  remainingOf,
  roundQty,
  splitAllowedOf,
  stepOf,
} from '../../../src/lot/helpers';
import { C, urgency } from '../../../src/theme';

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

type ViewerCoords = { lat: number; lng: number } | null;

export default function LotDetailScreen(): React.ReactElement {
  const { id, intent } = useLocalSearchParams<{ id: string; intent?: string }>();
  const lotId = Number(id);
  const { api, user } = useAuth();
  const { t, formatNumber, cropName } = useI18n();
  const router = useRouter();
  const now = useNow();
  const donationIntent = intent === 'donate';
  const returnTo = `/lots/${lotId}${intent !== undefined ? `?intent=${intent}` : ''}`;

  const [coords, setCoords] = useState<ViewerCoords>(
    user?.lat != null && user.lng != null ? { lat: user.lat, lng: user.lng } : null,
  );
  const [coordsReady, setCoordsReady] = useState(user?.lat != null && user.lng != null);

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
        }
      } catch {
        /* keep null — public lot still loads */
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
        return Promise.resolve(null as unknown as MarketLot);
      }
      const lat = coords?.lat;
      const lng = coords?.lng;
      if (loggedInBuyer) {
        return api.getMarketLot(lotId, lat ?? user.lat ?? undefined, lng ?? user.lng ?? undefined);
      }
      return api.getPublicMarketLot(lotId, lat, lng);
    },
    [lotId, coordsReady, coords?.lat, coords?.lng, loggedInBuyer, user?.id],
  );

  const [quantityKg, setQuantityKg] = useState(1);
  const [quantityError, setQuantityError] = useState<string | null>(null);

  useEffect(() => {
    if (data !== null) {
      setQuantityKg(defaultQuantity(data));
      setQuantityError(null);
    }
  }, [data]);

  const adjustQuantity = (lot: MarketLot, deltaSteps: number): void => {
    const remaining = remainingOf(lot);
    const step = stepOf(lot);
    const min = minOrderOf(lot);
    if (!splitAllowedOf(lot) || remaining + 1e-6 < min) {
      setQuantityKg(remaining);
      setQuantityError(null);
      return;
    }
    const next = roundQty(quantityKg + deltaSteps * step);
    if (next + 1e-6 < min) {
      setQuantityKg(min);
    } else if (next - remaining > 1e-6) {
      setQuantityKg(remaining);
    } else {
      setQuantityKg(next);
    }
    setQuantityError(null);
  };

  const goConfirm = (lot: MarketLot): void => {
    if (user === null) {
      router.push({ pathname: '/login', params: { returnTo } });
      return;
    }
    if (!user.can_buy) {
      router.push('/profile');
      return;
    }
    const remaining = remainingOf(lot);
    const min = minOrderOf(lot);
    if (splitAllowedOf(lot) && remaining + 1e-6 >= min && quantityKg + 1e-6 < min) {
      setQuantityError(formatTemplate(t.lot.qtyMinOrder, { min: formatNumber(min) }));
      return;
    }
    if (quantityKg - remaining > 1e-6) {
      setQuantityError(t.lot.qtyOverRemaining);
      return;
    }
    router.push({
      pathname: '/lots/[id]/confirm',
      params: {
        id: String(lot.id),
        intent: donationIntent ? 'donate' : 'buy',
        qty: String(quantityKg),
      },
    });
  };

  const goLogin = (): void => {
    router.push({ pathname: '/login', params: { returnTo } });
  };

  return (
    <SubScreen title={t.lot.title} onBack={() => router.replace('/(tabs)')}>
      <DataState
        loading={!coordsReady || loading}
        error={error}
        data={coordsReady ? data : null}
        onRetry={reload}
      >
        {(lot) => {
          const hours = hoursLeftFrom(lot.expires_at, now);
          const tone = urgency(hours);
          const remaining = remainingOf(lot);
          const available = availableAsOf(lot);
          const elig = donationEligibility(user, lot, quantityKg, donationEligibilityLabels(t));
          const saleBadge = marketSaleBadge(lot, {
            sell: t.market.badgeSell,
            donate: t.market.badgeDonate,
            donateOk: t.market.badgeDonateOk,
          });
          const canDonate = donationIntent && elig.canDonate && available.includes('donate');
          const canBuy = !donationIntent && available.includes('buy') && lot.price_per_kg !== null;
          const area = lot.area_th ?? lot.plot_name ?? null;
          const cropTitle = cropName({ name_th: lot.crop_name_th, name_en: lot.crop_name_en });
          const uri = photoUri(lot);

          return (
            <Body>
              {uri !== null ? (
                <Image source={{ uri }} style={styles.hero} resizeMode="cover" />
              ) : null}
              <Card>
                <View style={styles.header}>
                  <Text style={styles.title}>{cropTitle}</Text>
                  <Badge text={formatCountdown(hours, t.countdown)} fg={tone.fg} bg={tone.bg} />
                </View>
                {saleBadge !== null ? (
                  <Badge
                    text={saleBadge.text}
                    fg={saleBadge.donate ? C.turmeric : C.leaf}
                    bg={saleBadge.donate ? C.turmericSoft : C.leafSoft}
                  />
                ) : null}
                {lot.farmer_name !== undefined && lot.farmer_name !== '' ? (
                  <Text style={styles.line}>
                    {t.market.byFarmer} {lot.farmer_name}
                  </Text>
                ) : null}
                <Text style={styles.line}>
                  {t.lot.remaining} {formatNumber(remaining)} / {formatNumber(lot.weight_kg)}{' '}
                  {t.dashboard.unitKg}
                  {splitAllowedOf(lot)
                    ? ` · ${t.market.minOrder} ${formatNumber(minOrderOf(lot))} ${t.dashboard.unitKg}`
                    : ` · ${t.market.wholeLot}`}
                </Text>
                <Text style={styles.line}>
                  {lot.grade === 'substandard' ? t.market.gradeSub : t.market.gradeNormal}
                  {area !== null ? ` · ${area}` : ''}
                </Text>
                {lot.distance_km !== null && lot.distance_km !== undefined ? (
                  <Text style={styles.line}>
                    {t.lot.approxDistance} {lot.distance_km.toFixed(1)} {t.market.km}
                  </Text>
                ) : null}
                {lot.price_per_kg !== null ? (
                  <Text style={styles.line}>
                    {formatNumber(lot.price_per_kg)} {t.dashboard.unitBaht}/{t.dashboard.unitKg}
                  </Text>
                ) : (
                  <Text style={styles.line}>{t.lot.donateNoPrice}</Text>
                )}
              </Card>

              {user === null ? (
                <Card>
                  <Text style={styles.line}>{t.lot.loginToBook}</Text>
                  <PrimaryButton
                    label={donationIntent ? t.lot.loginToDonate : t.lot.loginToBuy}
                    tone={donationIntent ? 'turmeric' : undefined}
                    onPress={goLogin}
                  />
                </Card>
              ) : (
                <>
                  <Card>
                    <Text style={styles.qtyLabel}>{t.lot.qtyLabel}</Text>
                    <View style={styles.stepper}>
                      <Pressable
                        style={styles.stepBtn}
                        onPress={() => adjustQuantity(lot, -1)}
                        disabled={!splitAllowedOf(lot)}
                      >
                        <Text style={styles.stepBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyValue}>{formatNumber(quantityKg)}</Text>
                      <Pressable
                        style={styles.stepBtn}
                        onPress={() => adjustQuantity(lot, 1)}
                        disabled={!splitAllowedOf(lot)}
                      >
                        <Text style={styles.stepBtnText}>+</Text>
                      </Pressable>
                    </View>
                    {quantityError !== null ? <Text style={styles.fieldError}>{quantityError}</Text> : null}
                    {!donationIntent && lot.price_per_kg !== null ? (
                      <Text style={styles.total}>
                        {t.lot.approxTotal}{' '}
                        {formatNumber(Math.round(lot.price_per_kg * quantityKg))}{' '}
                        {t.dashboard.unitBaht}
                      </Text>
                    ) : null}
                    {donationIntent && !elig.canDonate && elig.reason !== null ? (
                      <Text style={styles.fieldError}>{elig.reason}</Text>
                    ) : null}
                  </Card>

                  {canBuy || canDonate ? (
                    <PrimaryButton
                      label={t.lot.goConfirm}
                      tone={donationIntent ? 'turmeric' : undefined}
                      onPress={() => goConfirm(lot)}
                    />
                  ) : (
                    <SecondaryButton label={t.lot.backToMarket} onPress={() => router.replace('/(tabs)')} />
                  )}
                </>
              )}
            </Body>
          );
        }}
      </DataState>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 200, borderRadius: 16, marginBottom: 12, backgroundColor: C.leafSoft },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: C.ink, flex: 1, marginRight: 8 },
  line: { color: C.ink, marginTop: 4 },
  qtyLabel: { color: C.mute, marginBottom: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 6 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 22, fontWeight: '800', color: C.leaf },
  qtyValue: { fontSize: 22, fontWeight: '800', color: C.ink, minWidth: 48, textAlign: 'center' },
  fieldError: { color: C.chili, marginBottom: 6 },
  total: { fontSize: 15, fontWeight: '700', color: C.ink, marginTop: 4 },
});
