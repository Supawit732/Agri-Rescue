import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { DonorIntroModal, type DonorIntroChoice } from '../components/DonorIntroModal';
import { ApiError } from '../src/api/client';
import { Body, Chip, Field, PrimaryButton, Screen, SectionTitle, SecondaryButton, TopBar } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { C } from '../src/theme';
import type { BuyerType } from '../src/api/types';

const buyerTypes: { key: BuyerType; label: string }[] = [
  { key: 'vendor', label: 'รถเร่' },
  { key: 'shop', label: 'ร้านค้า' },
  { key: 'charity', label: 'รับบริจาค' },
];

export default function ProfileScreen(): React.ReactElement {
  const { user, api, logout, mode, setMode, refreshUser } = useAuth();
  const router = useRouter();
  const [lineId, setLineId] = useState(user?.line_id ?? '');
  const [buyerType, setBuyerType] = useState<BuyerType>(user?.buyer_type ?? 'vendor');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [pendingEnableBuy, setPendingEnableBuy] = useState(false);

  if (user === null) {
    return (
      <Screen>
        <TopBar title="โปรไฟล์" onLogout={logout} />
        <Body>
          <Text style={styles.muted}>กรุณาเข้าสู่ระบบ</Text>
        </Body>
      </Screen>
    );
  }

  const selectBuyerType = (key: BuyerType): void => {
    if (key === 'charity') {
      setIntroVisible(true);
      return;
    }
    setBuyerType(key);
  };

  const onIntroChoice = (choice: DonorIntroChoice): void => {
    setIntroVisible(false);
    if (choice === 'cancel') {
      if (buyerType === 'charity') {
        setBuyerType('vendor');
      }
      setPendingEnableBuy(false);
      return;
    }
    setBuyerType('charity');
    if (pendingEnableBuy) {
      void runEnableBuy(choice);
      setPendingEnableBuy(false);
    } else if (choice === 'now') {
      router.push('/donor-apply');
    } else if (choice === 'later') {
      void (async () => {
        setBusy(true);
        try {
          await api.saveDonorDraft({ draft_step: 0 });
          await refreshUser();
          setMessage('บันทึกร่างแล้ว — กรอกคำขอรับบริจาคได้จากแบนเนอร์ด้านบน');
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'บันทึกร่างไม่สำเร็จ');
        } finally {
          setBusy(false);
        }
      })();
    }
  };

  const runEnableBuy = async (intent: 'now' | 'later'): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const auth = await api.updateProfile({
        can_buy: true,
        ...(user.buyer_type === null ? { buyer_type: 'charity' } : {}),
      });
      if (intent === 'later') {
        await api.saveDonorDraft({ draft_step: 0 });
        await refreshUser();
        setMessage('เปิดโหมดซื้อแล้ว — คำขอรับบริจาคยังเป็นร่าง');
      } else {
        setMessage(
          auth.user.org_status === 'draft' || auth.user.org_status === 'pending'
            ? 'เปิดโหมดซื้อแล้ว — กรุณากรอกคำขอรับบริจาค'
            : 'เปิดโหมดซื้อแล้ว',
        );
        setMode('buy');
        router.replace('/donor-apply');
        return;
      }
      setMode('buy');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const enableSell = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateProfile({ can_sell: true });
      setMessage('เปิดโหมดขายแล้ว');
      setMode('sell');
      router.replace('/farmer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const enableBuy = async (): Promise<void> => {
    if (buyerType === 'charity') {
      setPendingEnableBuy(true);
      setIntroVisible(true);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateProfile({
        can_buy: true,
        ...(user.buyer_type === null ? { buyer_type: buyerType } : {}),
      });
      setMessage('เปิดโหมดซื้อแล้ว');
      setMode('buy');
      router.replace('/buyer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const saveLine = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateProfile({ line_id: lineId.trim() === '' ? null : lineId.trim() });
      setMessage('บันทึก LINE ID แล้ว');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <DonorIntroModal visible={introVisible} onChoice={onIntroChoice} />
      <TopBar title="โปรไฟล์" onLogout={logout} />
      <Body>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.muted}>{user.phone}</Text>
        <Text style={styles.muted}>
          สิทธิ์: {[user.can_sell ? 'ขาย' : null, user.can_buy ? 'ซื้อ' : null, user.is_admin ? 'ผู้ดูแล' : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {user.can_buy ? (
          <Text style={styles.muted}>
            ประเภทผู้ซื้อ: {user.buyer_type ?? '-'}
            {user.donor_tier !== null ? ` · ระดับผู้รับ ${user.donor_tier}` : ''}
            {user.donation_suspended ? ' · ระงับสิทธิ์รับบริจาค' : ''}
          </Text>
        ) : null}

        {user.org_status === 'draft' ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>คำขอรับบริจาคยังไม่ครบ</Text>
            <Text style={styles.bannerText}>ยังรับบริจาคไม่ได้จนกว่าจะส่งคำขอครบ (บุคคล) หรือได้รับอนุมัติ (องค์กร)</Text>
            <PrimaryButton label="กรอกคำขอต่อ" onPress={() => router.push('/donor-apply')} />
          </View>
        ) : null}

        {user.org_status === 'pending' ? (
          <Text style={styles.muted}>คำขอองค์กร: รอผู้ดูแลอนุมัติ</Text>
        ) : null}
        {user.org_status === 'needs_more_info' ? (
          <>
            <Text style={styles.error}>ขอเอกสารเพิ่ม: {user.org_reject_reason ?? '-'}</Text>
            <PrimaryButton label="แก้ไขคำขอ / อัปโหลดเอกสาร" onPress={() => router.push('/donor-apply')} />
            <PrimaryButton
              label="อัปโหลดเอกสารเพิ่ม (รูป)"
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (!permission.granted) {
                      setError('ไม่ได้รับสิทธิ์เข้าถึงรูปภาพ');
                      return;
                    }
                    const picked = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ['images'],
                      base64: true,
                      quality: 0.8,
                    });
                    if (picked.canceled || picked.assets[0] === undefined) {
                      return;
                    }
                    const asset = picked.assets[0];
                    if (asset.base64 == null || asset.base64 === '') {
                      return;
                    }
                    const base64: string = asset.base64;
                    const mime = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
                    await api.addOrgDocuments([
                      {
                        filename: asset.fileName ?? `doc-${Date.now()}.jpg`,
                        mime,
                        base64,
                        doc_category: 'other',
                      },
                    ]);
                    setMessage('อัปโหลดเอกสารเพิ่มแล้ว');
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'อัปโหลดไม่สำเร็จ');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              loading={busy}
            />
            <PrimaryButton
              label="ส่งตรวจอีกครั้ง"
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api.resubmitOrg();
                    setMessage('ส่งคำขอตรวจอีกครั้งแล้ว');
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'ส่งตรวจไม่สำเร็จ');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              loading={busy}
            />
          </>
        ) : null}
        {user.org_status === 'rejected' ? (
          <>
            <Text style={styles.error}>คำขอองค์กรถูกปฏิเสธ: {user.org_reject_reason ?? '-'}</Text>
            <PrimaryButton label="สมัครใหม่" onPress={() => router.push('/donor-apply')} />
          </>
        ) : null}
        {user.org_status === 'approved' && user.application_kind === 'organization' ? (
          <Text style={styles.ok}>องค์กรที่ยืนยันแล้ว: {user.org_name ?? '-'}</Text>
        ) : null}
        {user.org_status === 'approved' && user.application_kind === 'individual' ? (
          <Text style={styles.ok}>จิตอาสาพร้อมรับบริจาค</Text>
        ) : null}

        <SectionTitle>LINE ID</SectionTitle>
        <Field label="LINE ID" value={lineId} onChangeText={setLineId} placeholder="ไม่บังคับ" autoCapitalize="none" />
        <PrimaryButton label="บันทึก LINE" onPress={saveLine} loading={busy} />

        {!user.can_sell ? (
          <>
            <SectionTitle>เปิดโหมดขาย</SectionTitle>
            <PrimaryButton label="เปิดสิทธิ์ขาย" onPress={enableSell} loading={busy} />
          </>
        ) : null}

        {!user.can_buy ? (
          <>
            <SectionTitle>เปิดโหมดซื้อ</SectionTitle>
            <View style={styles.row}>
              {buyerTypes.map((entry) => (
                <Chip
                  key={entry.key}
                  label={entry.label}
                  selected={buyerType === entry.key}
                  onPress={() => selectBuyerType(entry.key)}
                />
              ))}
            </View>
            <PrimaryButton label="เปิดสิทธิ์ซื้อ" onPress={enableBuy} loading={busy} />
          </>
        ) : null}

        {user.is_admin ? (
          <>
            <SectionTitle>ผู้ดูแล</SectionTitle>
            <SecondaryButton label="ดูคำขอองค์กร" onPress={() => router.push('/admin')} />
          </>
        ) : null}

        {user.can_buy &&
        user.donor_tier === null &&
        user.org_status !== 'pending' &&
        user.org_status !== 'draft' &&
        user.org_status !== 'needs_more_info' ? (
          <>
            <SectionTitle>รับบริจาค</SectionTitle>
            <PrimaryButton
              label="เป็นจิตอาสา (เร็ว)"
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api.becomeVolunteer();
                    setMessage('เปิดสิทธิ์จิตอาสาแล้ว');
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'เปิดสิทธิ์ไม่สำเร็จ');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              loading={busy}
            />
            <SecondaryButton
              label="สมัครแบบทางการ"
              onPress={() => {
                setIntroVisible(true);
              }}
            />
          </>
        ) : null}

        {user.can_sell && user.can_buy ? (
          <Text style={styles.hint}>โหมดปัจจุบัน: {mode === 'sell' ? 'ขาย' : 'ซื้อ'} — สลับได้ที่หัวข้อหน้า</Text>
        ) : null}

        {message !== null ? <Text style={styles.ok}>{message}</Text> : null}
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 4 },
  muted: { color: C.mute, marginBottom: 4 },
  hint: { color: C.mute, marginTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  ok: { color: C.leaf, marginTop: 12 },
  error: { color: C.chili, marginTop: 12 },
  banner: {
    backgroundColor: C.turmericSoft,
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
    gap: 8,
  },
  bannerTitle: { fontWeight: '800', color: C.ink },
  bannerText: { color: C.mute, marginBottom: 4 },
});
