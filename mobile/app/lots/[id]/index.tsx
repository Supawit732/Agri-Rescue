import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
  lotLocationLabel,
  marketSaleBadge,
  minOrderOf,
  priceComparisonBadge,
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
  const [showBuyGate, setShowBuyGate] = useState(false);

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
      setShowBuyGate(true);
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
          const isMine = lot.is_mine === true;
          const purchasable = lot.purchasable === true;
          const canDonate = !isMine && donationIntent && elig.canDonate && available.includes('donate');
          const canBuy =
            !isMine && !donationIntent && purchasable && available.includes('buy') && lot.price_per_kg !== null;
          const area = lotLocationLabel(lot, t.market.plotFallback);
          const cropTitle = cropName({ name_th: lot.crop_name_th, name_en: lot.crop_name_en });
          const uri = photoUri(lot);
          const priceCompare = priceComparisonBadge(
            lot,
            {
              cheaper: t.market.priceCompareCheaper,
              near: t.market.priceCompareNear,
              higher: t.market.priceCompareHigher,
            },
            formatTemplate,
          );

          return (
            <Body>
              {uri !== null ? (
                <Image source={{ uri }} style={styles.hero} resizeMode="cover" />
              ) : null}
              {coords === null && coordsReady && !purchasable && available.includes('buy') ? (
                <Card>
                  <Text style={styles.locationBannerText}>{t.lot.enableLocationForLot}</Text>
                  <PrimaryButton
                    label={t.market.changeLocation}
                    onPress={async () => {
                      const permission = await Location.requestForegroundPermissionsAsync();
                      if (permission.status === 'granted') {
                        try {
                          const position = await Location.getCurrentPositionAsync({
                            accuracy: Location.Accuracy.Balanced,
                          });
                          const newCoords = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                          };
                          setCoords(newCoords);
                          // Save to profile if profile has no location yet
                          if (!user?.lat || !user?.lng) {
                            try {
                              await api.updateProfile({ lat: newCoords.lat, lng: newCoords.lng });
                            } catch {
                              /* profile update failed, but local coords are set for browsing */
                            }
                          }
                          void reload();
                        } catch {
                          /* location fetch failed */
                        }
                      }
                    }}
                  />
                </Card>
              ) : null}
              <Card>
                <View style={styles.header}>
                  <Text style={styles.title}>{cropTitle}</Text>
                  <Badge text={formatCountdown(hours, t.countdown)} fg={tone.fg} bg={tone.bg} />
                </View>
                <View style={styles.badgeRow}>
                  {lot.grade === 'substandard' ? (
                    <Badge text={t.market.gradeSub} fg={C.turmeric} bg={C.turmericSoft} />
                  ) : null}
                  {saleBadge !== null ? (
                    <Badge
                      text={saleBadge.text}
                      fg={saleBadge.donate ? C.turmeric : C.leaf}
                      bg={saleBadge.donate ? C.turmericSoft : C.leafSoft}
                    />
                  ) : null}
                  {!purchasable ? (
                    <Badge text={t.market.outOfDeliveryRadius} fg={C.mute} bg={C.line} />
                  ) : null}
                </View>
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
                  {area !== '' ? ` · ${area}` : ''}
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
                {lot.description !== null && lot.description !== undefined && lot.description !== '' ? (
                  <Text style={styles.description}>{lot.description}</Text>
                ) : null}
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
              ) : isMine ? (
                <Card>
                  <Text style={styles.line}>{t.lot.ownLotTitle}</Text>
                  <View style={styles.ownLotActions}>
                    <View style={styles.ownLotActionItem}>
                      <SecondaryButton
                        label={t.lot.ownLotEdit}
                        block
                        onPress={() => router.push('/(tabs)/sell?tab=mine')}
                      />
                    </View>
                    <View style={styles.ownLotActionItem}>
                      <SecondaryButton
                        label={t.lot.ownLotBookers}
                        block
                        onPress={() => router.push('/(tabs)/sell?tab=mine')}
                      />
                    </View>
                  </View>
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
                  ) : !purchasable && !donationIntent && available.includes('buy') ? (
                    <Card>
                      <Text style={styles.fieldError}>{t.lot.outOfDeliveryRadiusMessage}</Text>
                      <SecondaryButton label={t.lot.backToMarket} onPress={() => router.replace('/(tabs)')} />
                    </Card>
                  ) : (
                    <SecondaryButton label={t.lot.backToMarket} onPress={() => router.replace('/(tabs)')} />
                  )}
                </>
              )}
            </Body>
          );
        }}
      </DataState>
      <Modal visible={showBuyGate} transparent animationType="fade" onRequestClose={() => setShowBuyGate(false)}>
        <Pressable
          style={styles.buyGateBackdrop}
          onPress={() => setShowBuyGate(false)}
          accessibilityLabel={t.common.close}
        >
          <View style={{ flex: 1 }} />
        </Pressable>
        <View style={styles.buyGateSheet}>
          <Text style={styles.buyGateTitle}>{t.buyGate.title}</Text>
          <Text style={styles.buyGateBody}>{t.buyGate.body}</Text>
          <PrimaryButton
            label={t.buyGate.enableBuy}
            block
            onPress={() => {
              setShowBuyGate(false);
              router.push({ pathname: '/profile', params: { returnTo } });
            }}
          />
          <SecondaryButton label={t.common.cancel} block onPress={() => setShowBuyGate(false)} />
        </View>
      </Modal>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 200, borderRadius: 16, marginBottom: 12, backgroundColor: C.leafSoft },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: C.ink, flex: 1, marginRight: 8 },
  priceCompare: { fontSize: 12, color: C.mute, marginTop: 2 },
  priceCompareCheaper: { color: C.leafDeep, fontWeight: '700' },
  ownLotActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  ownLotActionItem: { flex: 1 },
  buyGateBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20, 28, 22, 0.4)',
  },
  buyGateSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  buyGateTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  buyGateBody: { color: C.mute, marginBottom: 4, lineHeight: 20 },
  line: { color: C.ink, marginTop: 4 },
  description: { color: C.mute, marginTop: 8, lineHeight: 20 },
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
  locationBannerText: { fontSize: 14, color: C.ink, fontWeight: '600', marginBottom: 12 },
});
