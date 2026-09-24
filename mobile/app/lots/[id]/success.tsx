import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Body, CtaStack, PrimaryButton, SecondaryButton, SubScreen } from '../../../src/components/ui';
import { formatTemplate, useI18n } from '../../../src/i18n';
import { C } from '../../../src/theme';

export default function LotSuccessScreen(): React.ReactElement {
  const { orderId } = useLocalSearchParams<{ id: string; orderId?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  return (
    <SubScreen title={t.bookingSuccess.title} onBack={() => router.replace('/(tabs)/orders')}>
      <Body>
        <Text style={styles.title}>{t.bookingSuccess.heading}</Text>
        <Text style={styles.body}>
          {orderId !== undefined
            ? formatTemplate(t.bookingSuccess.bodyWithId, { id: orderId })
            : t.bookingSuccess.body}
        </Text>
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
});
