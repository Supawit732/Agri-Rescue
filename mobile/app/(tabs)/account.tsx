import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import {
  Body,
  Card,
  LoginPrompt,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionTitle,
} from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { C } from '../../src/theme';

function donorStatusLabel(user: NonNullable<ReturnType<typeof useAuth>['user']>): string {
  if (user.donation_suspended) {
    return 'ระงับสิทธิ์รับบริจาค';
  }
  if (user.donor_tier === 'verified_org') {
    return 'องค์กรที่ยืนยันแล้ว';
  }
  if (user.donor_tier === 'trusted_volunteer') {
    return 'จิตอาสาที่เชื่อถือได้';
  }
  if (user.donor_tier === 'volunteer') {
    return 'จิตอาสา';
  }
  if (user.org_status === 'pending') {
    return 'รออนุมัติองค์กร';
  }
  if (user.org_status === 'needs_more_info') {
    return 'ต้องส่งเอกสารเพิ่ม';
  }
  if (user.org_status === 'draft') {
    return 'แบบร่างคำขอ';
  }
  if (user.org_status === 'rejected') {
    return 'คำขอถูกปฏิเสธ';
  }
  return 'ยังไม่ได้สมัครรับบริจาค';
}

export default function AccountTab(): React.ReactElement {
  const { user, logout, api, refreshUser } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (user === null) {
    return (
      <Screen>
        <LoginPrompt
          title="บัญชีของฉัน"
          message="เข้าสู่ระบบเพื่อจัดการโปรไฟล์ สิทธิ์ขาย/ซื้อ และการรับบริจาค"
          returnTo="/(tabs)/account"
        />
      </Screen>
    );
  }

  const enableSell = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateProfile({ can_sell: true });
      await refreshUser();
      setMessage('เปิดการขายแล้ว');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const enableBuy = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateProfile({ can_buy: true, ...(user.buyer_type === null ? { buyer_type: 'vendor' } : {}) });
      await refreshUser();
      setMessage('เปิดการซื้อแล้ว');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Body>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.muted}>{user.phone}</Text>
        <Text style={styles.muted}>
          สิทธิ์: {[user.can_sell ? 'ขาย' : null, user.can_buy ? 'ซื้อ' : null, user.is_admin ? 'ผู้ดูแล' : null]
            .filter(Boolean)
            .join(' · ') || 'ยังไม่มีสิทธิ์ขาย/ซื้อ'}
        </Text>
        {message !== null ? <Text style={styles.ok}>{message}</Text> : null}
        {error !== null ? <Text style={styles.err}>{error}</Text> : null}

        <SectionTitle>บัญชี</SectionTitle>
        <Card>
          {(user.can_sell || user.is_admin) ? (
            <View style={styles.gap}>
              <PrimaryButton label="แดชบอร์ด" onPress={() => router.push('/dashboard')} />
            </View>
          ) : null}
          <PrimaryButton label="โปรไฟล์" onPress={() => router.push('/profile')} />
          {!user.can_sell ? (
            <View style={styles.gap}>
              <PrimaryButton label="เปิดการขาย" onPress={() => void enableSell()} loading={busy} />
            </View>
          ) : null}
          {!user.can_buy ? (
            <View style={styles.gap}>
              <PrimaryButton label="เปิดการซื้อ" onPress={() => void enableBuy()} loading={busy} />
            </View>
          ) : null}
        </Card>

        <SectionTitle>รับบริจาค</SectionTitle>
        <Card>
          <Text style={styles.cardLine}>สถานะ: {donorStatusLabel(user)}</Text>
          <PrimaryButton label="สมัคร / จัดการคำขอรับบริจาค" onPress={() => router.push('/donor-apply')} />
        </Card>

        <SectionTitle>อื่นๆ</SectionTitle>
        <Card>
          <PrimaryButton label="ผลลัพธ์" onPress={() => router.push('/impact')} />
          <View style={styles.gap}>
            <SecondaryButton label="ข้อกำหนดผู้รับบริจาค" onPress={() => router.push('/terms/donor')} />
          </View>
          {user.is_admin ? (
            <View style={styles.gap}>
              <PrimaryButton label="ผู้ดูแลระบบ" onPress={() => router.push('/admin')} />
            </View>
          ) : null}
          <View style={styles.gap}>
            <SecondaryButton
              label="ออกจากระบบ"
              onPress={() => {
                logout();
                router.replace('/(tabs)');
              }}
            />
          </View>
        </Card>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontWeight: '800', color: C.ink },
  muted: { color: C.mute, marginTop: 4 },
  ok: { color: C.leaf, marginTop: 8, fontWeight: '600' },
  err: { color: C.chili, marginTop: 8, fontWeight: '600' },
  cardLine: { color: C.ink, marginBottom: 10 },
  gap: { marginTop: 8 },
});
