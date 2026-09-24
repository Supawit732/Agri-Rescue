import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Card, CtaStack, PrimaryButton, SecondaryButton, SubScreen } from '../../src/components/ui';
import { formatTemplate, useI18n } from '../../src/i18n';
import { C, fonts } from '../../src/theme';

export default function SellSuccessScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ crop?: string; weight?: string; price?: string }>();
  const crop = typeof params.crop === 'string' ? params.crop : null;
  const weight = typeof params.weight === 'string' ? params.weight : null;
  const price = typeof params.price === 'string' ? params.price : null;

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
            <Text style={styles.summary}>
              {formatTemplate(t.sellSuccess.summaryLine, { crop, weight })}
            </Text>
            {price !== null ? (
              <Text style={styles.summaryMeta}>
                {formatTemplate(t.sell.marketPrice, { price })}
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
});
