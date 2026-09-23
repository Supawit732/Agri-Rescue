import { Link } from 'expo-router';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../src/theme';
import { PrimaryButton, SecondaryButton, CtaStack } from '../src/components/ui';

export type DonorIntroChoice = 'now' | 'later' | 'cancel';

export function DonorIntroModal({
  visible,
  onChoice,
}: {
  visible: boolean;
  onChoice: (choice: DonorIntroChoice) => void;
}): React.ReactElement {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => onChoice('cancel')}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>ก่อนสมัครรับบริจาค</Text>
            <Text style={styles.lead}>กรุณาเตรียมข้อมูลและอ่านเงื่อนไขสำคัญก่อนดำเนินการ</Text>

            <Text style={styles.section}>สิ่งที่ต้องเตรียม — บุคคล (จิตอาสา)</Text>
            <Text style={styles.bullet}>· ชื่อ-นามสกุล และเบอร์โทรติดต่อ</Text>
            <Text style={styles.bullet}>· พื้นที่ที่จะแจกจ่าย และกลุ่มผู้รับ</Text>
            <Text style={styles.bullet}>· วัตถุประสงค์สั้น ๆ (ไม่ต้องใช้บัตรประชาชน)</Text>

            <Text style={styles.section}>สิ่งที่ต้องเตรียม — องค์กร</Text>
            <Text style={styles.bullet}>· ชื่อองค์กรตามเอกสาร ประเภท และการจดทะเบียน</Text>
            <Text style={styles.bullet}>· ที่อยู่ตามทะเบียน + ที่ตั้งจริง</Text>
            <Text style={styles.bullet}>· ผู้ติดต่อ ตำแหน่ง เบอร์ อีเมล</Text>
            <Text style={styles.bullet}>· หนังสือรับรองจดทะเบียน หรือจากผู้นำชุมชน/อบต. (≥1)</Text>
            <Text style={styles.bullet}>· รูปสถานที่ 1–3 รูป</Text>

            <Text style={styles.section}>เงื่อนไขหลัก</Text>
            <Text style={styles.bullet}>· ห้ามนำไปขายต่อหรือแลกเปลี่ยนเป็นเงิน</Text>
            <Text style={styles.bullet}>· ส่งรูปยืนยันการแจกภายใน 48 ชั่วโมงหลังรับ</Text>
            <Text style={styles.bullet}>· มีเพดานรับต่อสัปดาห์ตามระดับผู้รับ</Text>
            <Text style={styles.bullet}>· ละเมิดเงื่อนไขอาจถูกระงับสิทธิ์</Text>

            <Link href="/terms/donor">
              <Text style={styles.link}>อ่านข้อกำหนดและนโยบายฉบับเต็ม</Text>
            </Link>
            <Text style={styles.hint}>สามารถเปิดอ่านข้อกำหนดฉบับเต็มได้ทุกเมื่อจากลิงก์ด้านบน</Text>
          </ScrollView>

          <View style={styles.actions}>
            <CtaStack>
              <PrimaryButton label="เข้าใจแล้ว กรอกเลย" block onPress={() => onChoice('now')} />
              <SecondaryButton label="ไว้กรอกทีหลัง" block onPress={() => onChoice('later')} />
              <SecondaryButton label="ยกเลิก" block onPress={() => onChoice('cancel')} />
            </CtaStack>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,42,31,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: C.white,
    borderRadius: 16,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  scroll: { maxHeight: 420 },
  scrollContent: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: C.ink, marginBottom: 6 },
  lead: { color: C.mute, marginBottom: 14 },
  section: { fontWeight: '700', color: C.leaf, marginTop: 12, marginBottom: 4 },
  bullet: { color: C.ink, marginBottom: 2, lineHeight: 20 },
  link: { color: C.leaf, fontWeight: '700', marginTop: 14, textDecorationLine: 'underline' },
  hint: { color: C.mute, fontSize: 12, marginTop: 6 },
  actions: { padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: C.line },
});
