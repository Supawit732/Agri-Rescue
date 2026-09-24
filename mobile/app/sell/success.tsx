import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Body, CtaStack, PrimaryButton, SecondaryButton, SubScreen } from '../../src/components/ui';
import { useI18n } from '../../src/i18n';
import { C } from '../../src/theme';

export default function SellSuccessScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <SubScreen title={t.sellSuccess.title} onBack={() => router.replace('/(tabs)/sell')}>
      <Body>
        <Text style={styles.title}>{t.sellSuccess.heading}</Text>
        <Text style={styles.body}>{t.sellSuccess.body}</Text>
        <CtaStack>
          <PrimaryButton
            label={t.sellSuccess.viewMyLots}
            block
            onPress={() => router.replace('/(tabs)/sell')}
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
  title: { fontSize: 24, fontWeight: '800', color: C.leaf, marginBottom: 8, paddingHorizontal: 4 },
  body: { color: C.ink, marginBottom: 20, lineHeight: 22, paddingHorizontal: 4 },
});
