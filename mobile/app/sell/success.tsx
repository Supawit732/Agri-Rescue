import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Body, PrimaryButton, SecondaryButton, SubScreen } from '../../src/components/ui';
import { C } from '../../src/theme';

export default function SellSuccessScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <SubScreen title="ลงล็อตสำเร็จ" onBack={() => router.replace('/(tabs)/sell')}>
      <Body>
        <Text style={styles.title}>ลงประกาศเรียบร้อย</Text>
        <Text style={styles.body}>ล็อตของคุณเข้าสู่ตลาดแล้ว — ดูรายการได้ที่แท็บขาย หรือกลับไปตลาด</Text>
        <PrimaryButton label="ดูล็อตของฉัน" onPress={() => router.replace('/(tabs)/sell')} />
        <SecondaryButton label="กลับไปตลาด" onPress={() => router.replace('/(tabs)')} />
      </Body>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: C.leaf, marginBottom: 8 },
  body: { color: C.ink, marginBottom: 20, lineHeight: 22 },
});
