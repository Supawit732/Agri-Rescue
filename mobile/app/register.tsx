import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { LocationPicker, type LatLng } from '../src/components/LocationPicker';
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
  const [canSell, setCanSell] = useState(true);
  const [canBuy, setCanBuy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [lineId, setLineId] = useState('');
  const [buyerType, setBuyerType] = useState<BuyerType>('vendor');
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    password.length >= 8 &&
    coords !== null &&
    (canSell || canBuy);

  const onSubmit = async (): Promise<void> => {
    if (coords === null) {
      setError('กรุณาเลือกตำแหน่งก่อนสมัคร');
      return;
    }
    if (!canSell && !canBuy) {
      setError('เลือกอย่างน้อยหนึ่งบทบาท: ขาย หรือ ซื้อ');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await register({
        name: name.trim(),
        phone: phone.trim(),
        password,
        can_sell: canSell,
        can_buy: canBuy,
        buyer_type: canBuy ? buyerType : null,
        line_id: lineId.trim() === '' ? null : lineId.trim(),
        lat: coords.lat,
        lng: coords.lng,
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
            <Chip label="ขาย" selected={canSell} onPress={() => setCanSell((v) => !v)} />
            <Chip label="ซื้อ" selected={canBuy} onPress={() => setCanBuy((v) => !v)} />
          </View>
          <Text style={styles.hint}>เลือกได้ทั้งคู่ แล้วสลับโหมดในแอปได้ภายหลัง</Text>
          {canBuy ? (
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
              {buyerType === 'charity' ? (
                <Text style={styles.hint}>ประเภทสงเคราะห์ต้องรอผู้ดูแลอนุมัติก่อนรับบริจาค</Text>
              ) : null}
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
          <Field
            label="LINE ID (ไม่บังคับ)"
            value={lineId}
            onChangeText={setLineId}
            placeholder="เช่น agrirescue"
            autoCapitalize="none"
          />
          <LocationPicker value={coords} onChange={setCoords} label="ตำแหน่ง" />
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            label="สมัครสมาชิก"
            onPress={onSubmit}
            loading={submitting}
            disabled={!canSubmit}
          />
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
  hint: { color: C.mute, marginBottom: 8 },
  error: { color: C.chili, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: C.mute },
  link: { color: C.leaf, fontWeight: '700' },
});
