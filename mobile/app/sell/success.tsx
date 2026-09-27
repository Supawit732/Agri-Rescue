import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL } from '../../src/api/config';
import type { SaleMode } from '../../src/api/types';
import { Body, Card, CtaStack, PrimaryButton, SecondaryButton, SubScreen } from '../../src/components/ui';
import { formatCountdown } from '../../src/hooks/useNow';
import { formatTemplate, useI18n } from '../../src/i18n';
import { C, cropTint, fonts } from '../../src/theme';

function photoUri(raw: string | null): string | null {
  if (raw === null || raw === '') {
    return null;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

export default function SellSuccessScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{
    crop?: string;
    weight?: string;
    price?: string;
    photoUrl?: string;
    saleMode?: string;
    startPrice?: string;
    shelfHours?: string;
  }>();
  const crop = typeof params.crop === 'string' ? params.crop : null;
  const weight = typeof params.weight === 'string' ? params.weight : null;
  const price = typeof params.price === 'string' ? params.price : null;
  const photoUrl = typeof params.photoUrl === 'string' ? photoUri(params.photoUrl) : null;
  const saleMode = typeof params.saleMode === 'string' ? (params.saleMode as SaleMode) : null;
  const startPrice = typeof params.startPrice === 'string' ? params.startPrice : null;
  const shelfHours = typeof params.shelfHours === 'string' ? Number(params.shelfHours) : null;

  return (
    <SubScreen
      title={t.sellSuccess.title}
      onBack={() => router.replace({ pathname: '/(tabs)/sell', params: { tab: 'mine' } })}
    >
      <Body>
        <Text style={styles.title}>{t.sellSuccess.heading}</Text>
        <Text style={styles.body}>{t.sellSuccess.body}</Text>
        {crop !== null && weight !== null ? (
          <Card>
            {photoUrl !== null ? (
              <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: cropTint(crop.length) }]}>
                <Feather name="image" size={28} color={C.mute} />
              </View>
            )}
            <Text style={styles.summary}>
              {formatTemplate(t.sellSuccess.summaryLine, { crop, weight })}
            </Text>
            {price !== null ? (
              <Text style={styles.summaryMeta}>
                {formatTemplate(t.sell.marketPrice, { price })}
              </Text>
            ) : null}
            {startPrice !== null ? (
              <Text style={styles.summaryMeta}>
                {formatTemplate(t.sellSuccess.startPriceLine, { price: startPrice })}
              </Text>
            ) : null}
            {saleMode !== null ? (
              <Text style={styles.summaryMeta}>
                {formatTemplate(t.sellSuccess.saleModeLine, { mode: t.saleMode[saleMode] })}
              </Text>
            ) : null}
            {shelfHours !== null ? (
              <Text style={styles.summaryMeta}>
                {formatTemplate(t.sellSuccess.timeLeftLine, {
                  time: formatCountdown(shelfHours, t.countdown),
                })}
              </Text>
            ) : null}
          </Card>
        ) : null}
        <CtaStack>
          <PrimaryButton
            label={t.sellSuccess.viewMyLots}
            block
            onPress={() => router.replace({ pathname: '/(tabs)/sell', params: { tab: 'mine' } })}
          />
          <SecondaryButton
            label={t.sellSuccess.backToMarket}
            block
            onPress={() => router.replace('/(tabs)')}
          />
        </CtaStack>
      </Body>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: C.leaf,
    marginBottom: 8,
    paddingHorizontal: 4,
    fontFamily: fonts.titleBold,
  },
  body: { color: C.ink, marginBottom: 20, lineHeight: 22, paddingHorizontal: 4, fontFamily: fonts.body },
  summary: {
    fontSize: 18,
    fontWeight: '700',
    color: C.ink,
    fontFamily: fonts.titleBold,
    marginBottom: 4,
  },
  summaryMeta: { color: C.mute, fontFamily: fonts.body },
  photo: { width: '100%', height: 160, borderRadius: 12, marginBottom: 8, backgroundColor: C.leafSoft },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
});
