import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { FormField, useFieldErrors, useFieldScroll } from '../src/components/form';
import { PrimaryButton, Screen, StackHeader } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { C } from '../src/theme';

export default function LoginScreen(): React.ReactElement {
  const { login } = useAuth();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, setFieldError, applyServerFields } = useFieldErrors();
  const { scrollRef, registerY, scrollToField } = useFieldScroll();
  const touched = useRef<Record<string, boolean>>({});

  const validateField = (name: string): string | null => {
    if (name === 'phone') {
      if (!/^\d{9,15}$/.test(phone.trim())) {
        return 'เบอร์โทรไม่ถูกต้อง';
      }
      return null;
    }
    if (name === 'password') {
      if (password.length < 1) {
        return 'กรุณากรอกรหัสผ่าน';
      }
      return null;
    }
    return null;
  };

  const onBlurField = (name: string): void => {
    touched.current[name] = true;
    setFieldError(name, validateField(name));
  };

  const onSubmit = async (): Promise<void> => {
    const next: Record<string, string> = {};
    for (const name of ['phone', 'password']) {
      const msg = validateField(name);
      if (msg !== null) {
        next[name] = msg;
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      scrollToField(Object.keys(next)[0] ?? null);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await login(phone.trim(), password);
      const target =
        typeof returnTo === 'string' && returnTo.length > 0 && returnTo.startsWith('/')
          ? returnTo
          : '/(tabs)';
      router.replace(target as never);
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerFields(err.fields);
        if (err.fields !== undefined && Object.keys(err.fields).length > 0) {
          scrollToField(Object.keys(err.fields)[0] ?? null);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('เข้าสู่ระบบไม่สำเร็จ');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <StackHeader title="เข้าสู่ระบบ" onBack={() => router.replace('/(tabs)')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.body}>
          <Text style={styles.brand}>Agri-Rescue</Text>
          <Text style={styles.tagline}>ระบายผลผลิตใกล้เน่าเสียสู่ผู้รับซื้อในพื้นที่</Text>
          <FormField
            label="เบอร์โทร"
            name="phone"
            value={phone}
            onChangeText={(text) => {
              setPhone(text);
              if (touched.current.phone) {
                setFieldError('phone', /^\d{9,15}$/.test(text.trim()) ? null : 'เบอร์โทรไม่ถูกต้อง');
              }
            }}
            onBlurField={onBlurField}
            fieldRef={registerY}
            error={errors.phone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            placeholder="เช่น 0800000011"
          />
          <FormField
            label="รหัสผ่าน"
            name="password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (touched.current.password) {
                setFieldError('password', text.length < 1 ? 'กรุณากรอกรหัสผ่าน' : null);
              }
            }}
            onBlurField={onBlurField}
            fieldRef={registerY}
            error={errors.password}
            secureTextEntry
            placeholder="รหัสผ่าน"
          />
          {formError !== null ? <Text style={styles.error}>{formError}</Text> : null}
          <PrimaryButton label="เข้าสู่ระบบ" onPress={() => void onSubmit()} loading={submitting} />
          <View style={styles.footer}>
            <Text style={styles.footerText}>ยังไม่มีบัญชี? </Text>
            <Link href="/register" style={styles.link}>
              สมัครสมาชิก
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  brand: { fontSize: 32, fontWeight: '800', color: C.leaf, marginTop: 24, textAlign: 'center' },
  tagline: { fontSize: 14, color: C.mute, textAlign: 'center', marginBottom: 28 },
  error: { color: C.chili, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: C.mute },
  link: { color: C.leaf, fontWeight: '700' },
});
