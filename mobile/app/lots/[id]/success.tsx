import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, StyleSheet, Text } from 'react-native';
import { API_BASE_URL } from '../../../src/api/config';
import type { MarketLot } from '../../../src/api/types';
import { Body, Card, CtaStack, PrimaryButton, SecondaryButton, SubScreen } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { useApiData } from '../../../src/hooks/useApiData';
import { formatTemplate, useI18n } from '../../../src/i18n';
import { C } from '../../../src/theme';

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

export default function LotSuccessScreen(): React.ReactElement {
  const { id, orderId } = useLocalSearchParams<{ id: string; orderId?: string }>();
  const lotId = Number(id);
  const router = useRouter();
  const { api } = useAuth();
  const { t, cropName } = useI18n();
  const { data: lot } = useApiData(() => api.getMarketLot(lotId), [lotId]);

  return (
    <SubScreen title={t.bookingSuccess.title} onBack={() => router.replace('/(tabs)/orders')}>
      <Body>
        <Text style={styles.title}>{t.bookingSuccess.heading}</Text>
        <Text style={styles.body}>
          {orderId !== undefined
            ? formatTemplate(t.bookingSuccess.bodyWithId, { id: orderId })
            : t.bookingSuccess.body}
        </Text>
        {lot !== null ? (
          <Card>
            {photoUri(lot) !== null ? (
              <Image source={{ uri: photoUri(lot)! }} style={styles.photo} resizeMode="cover" />
            ) : null}
            <Text style={styles.cropTitle}>
              {cropName({ name_th: lot.crop_name_th, name_en: lot.crop_name_en })}
            </Text>
            {lot.description !== null && lot.description !== undefined && lot.description !== '' ? (
              <Text style={styles.description}>{lot.description}</Text>
            ) : null}
          </Card>
        ) : null}
        <CtaStack>
          <PrimaryButton
            label={t.bookingSuccess.viewOrders}
            block
            onPress={() => {
              if (orderId !== undefined) {
                router.replace({ pathname: '/orders/[id]', params: { id: orderId } });
              } else {
                router.replace('/(tabs)/orders');
              }
            }}
          />
          <SecondaryButton
            label={t.bookingSuccess.backToMarket}
            block
            onPress={() => router.replace('/(tabs)')}
          />
        </CtaStack>
      </Body>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: C.leaf, marginBottom: 8, paddingHorizontal: 4 },
  body: { color: C.ink, marginBottom: 20, lineHeight: 22, paddingHorizontal: 4 },
  photo: { width: '100%', height: 160, borderRadius: 12, marginBottom: 8, backgroundColor: C.leafSoft },
  cropTitle: { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 4 },
  description: { color: C.mute, lineHeight: 20 },
});
