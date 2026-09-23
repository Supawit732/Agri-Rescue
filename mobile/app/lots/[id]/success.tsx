import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Body, PrimaryButton, SecondaryButton, SubScreen } from '../../../src/components/ui';
import { C } from '../../../src/theme';

export default function LotSuccessScreen(): React.ReactElement {
  const { orderId } = useLocalSearchParams<{ id: string; orderId?: string }>();
  const router = useRouter();

  return (
    <SubScreen title="จองสำเร็จ" onBack={() => router.replace('/(tabs)/orders')}>
      <Body>
        <Text style={styles.title}>จองเรียบร้อยแล้ว</Text>
        <Text style={styles.body}>
          {orderId !== undefined
            ? `คำสั่งซื้อ #${orderId} ถูกสร้างแล้ว — ดูรายละเอียดและรหัส OTP ได้ที่คำสั่งซื้อ`
            : 'การจองสำเร็จแล้ว — ดูรายละเอียดได้ที่คำสั่งซื้อ'}
        </Text>
        <PrimaryButton
          label="ดูคำสั่งซื้อ"
          onPress={() => {
            if (orderId !== undefined) {
              router.replace({ pathname: '/orders/[id]', params: { id: orderId } });
            } else {
              router.replace('/(tabs)/orders');
            }
          }}
        />
        <SecondaryButton label="กลับไปตลาด" onPress={() => router.replace('/(tabs)')} />
      </Body>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: C.leaf, marginBottom: 8 },
  body: { color: C.ink, marginBottom: 20, lineHeight: 22 },
});
