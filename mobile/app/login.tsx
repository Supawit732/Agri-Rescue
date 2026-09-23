import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { Body, Field, PrimaryButton, Screen } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { C } from '../src/theme';

export default function LoginScreen(): React.ReactElement {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      await login(phone.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Body>
          <Text style={styles.brand}>Agri-Rescue</Text>
          <Text style={styles.tagline}>ระบายผลผลิตใกล้เน่าเสียสู่ผู้รับซื้อในพื้นที่</Text>
          <Field
            label="เบอร์โทร"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            placeholder="เช่น 0800000011"
          />
          <Field label="รหัสผ่าน" value={password} onChangeText={setPassword} secureTextEntry placeholder="รหัสผ่าน" />
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="เข้าสู่ระบบ" onPress={onSubmit} loading={submitting} />
          <View style={styles.footer}>
            <Text style={styles.footerText}>ยังไม่มีบัญชี? </Text>
            <Link href="/register" style={styles.link}>
              สมัครสมาชิก
            </Link>
          </View>
        </Body>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 32, fontWeight: '800', color: C.leaf, marginTop: 24, textAlign: 'center' },
  tagline: { fontSize: 14, color: C.mute, textAlign: 'center', marginBottom: 28 },
  error: { color: C.chili, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: C.mute },
  link: { color: C.leaf, fontWeight: '700' },
});
