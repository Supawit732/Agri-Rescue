import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { LoginPrompt, PrimaryButton, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { C } from '../../src/theme';
import SellScreen from '../../src/screens/SellScreen';

export default function SellTab(): React.ReactElement {
  const { user, api, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user === null) {
    return (
      <Screen>
        <LoginPrompt
          title="ลงขายผลผลิต"
          message="เข้าสู่ระบบแล้วเปิดการขายเพื่อลงล็อตใกล้หมดอายุ"
          returnTo="/(tabs)/sell"
        />
      </Screen>
    );
  }

  if (!user.can_sell) {
    const enableSell = async (): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        await api.updateProfile({ can_sell: true });
        await refreshUser();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'เปิดการขายไม่สำเร็จ');
      } finally {
        setBusy(false);
      }
    };
    return (
      <Screen>
        <View style={styles.box}>
          <Text style={styles.title}>เปิดการขาย</Text>
          <Text style={styles.body}>
            ลงล็อตผลผลิตที่ใกล้หมดอายุ ตั้งราคาเริ่มต้นและราคาต่ำสุด หรือเปิดรับบริจาคได้จากที่นี่
          </Text>
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="เปิดการขาย" onPress={() => void enableSell()} loading={busy} />
        </View>
      </Screen>
    );
  }

  return <SellScreen />;
}

const styles = StyleSheet.create({
  box: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: C.ink, textAlign: 'center' },
  body: { fontSize: 15, color: C.mute, textAlign: 'center', lineHeight: 22 },
  error: { color: C.chili, textAlign: 'center' },
});
