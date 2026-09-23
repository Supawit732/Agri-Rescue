import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { Body, Chip, Field, PrimaryButton, Screen, SectionTitle } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { C } from '../src/theme';
import type { BuyerType } from '../src/api/types';

const buyerTypes: { key: BuyerType; label: string }[] = [
  { key: 'vendor', label: 'รถเร่' },
  { key: 'shop', label: 'ร้านค้า' },
  { key: 'charity', label: 'สงเคราะห์' },
];

export default function RegisterScreen(): React.ReactElement {
  const { register } = useAuth();
  const [role, setRole] = useState<'farmer' | 'buyer'>('farmer');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [buyerType, setBuyerType] = useState<BuyerType>('vendor');
  const [lat, setLat] = useState('13.65');
  const [lng, setLng] = useState('100.62');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      await register({
        name: name.trim(),
        phone: phone.trim(),
        password,
        role,
        buyer_type: role === 'buyer' ? buyerType : null,
        lat: Number(lat),
        lng: Number(lng),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'สมัครสมาชิกไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Body>
          <Text style={styles.brand}>สมัครสมาชิก</Text>
          <SectionTitle>บทบาท</SectionTitle>
          <View style={styles.row}>
            <Chip label="เกษตรกร" selected={role === 'farmer'} onPress={() => setRole('farmer')} />
            <Chip label="ผู้ซื้อ" selected={role === 'buyer'} onPress={() => setRole('buyer')} />
          </View>
          {role === 'buyer' ? (
            <>
              <SectionTitle>ประเภทผู้ซื้อ</SectionTitle>
              <View style={styles.row}>
                {buyerTypes.map((entry) => (
                  <Chip
                    key={entry.key}
                    label={entry.label}
                    selected={buyerType === entry.key}
                    onPress={() => setBuyerType(entry.key)}
                  />
                ))}
              </View>
            </>
          ) : null}
          <Field label="ชื่อ" value={name} onChangeText={setName} placeholder="ชื่อ-สกุล" />
          <Field
            label="เบอร์โทร"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="เช่น 0899999999"
          />
          <Field label="รหัสผ่าน (อย่างน้อย 8 ตัว)" value={password} onChangeText={setPassword} secureTextEntry />
          <View style={styles.coords}>
            <View style={{ flex: 1 }}>
              <Field label="ละติจูด" value={lat} onChangeText={setLat} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="ลองจิจูด" value={lng} onChangeText={setLng} keyboardType="numeric" />
            </View>
          </View>
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="สมัครสมาชิก" onPress={onSubmit} loading={submitting} />
          <View style={styles.footer}>
            <Text style={styles.footerText}>มีบัญชีแล้ว? </Text>
            <Link href="/login" style={styles.link}>
              เข้าสู่ระบบ
            </Link>
          </View>
        </Body>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 26, fontWeight: '800', color: C.leaf, marginTop: 12, marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  coords: { flexDirection: 'row', gap: 12 },
  error: { color: C.chili, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: C.mute },
  link: { color: C.leaf, fontWeight: '700' },
});
