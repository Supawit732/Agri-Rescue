import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Body, PrimaryButton, Screen, StackHeader } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { C } from '../../src/theme';

export default function DonorTermsScreen(): React.ReactElement {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <Screen>
      <StackHeader
        title="ข้อกำหนดผู้รับบริจาค"
        onBack={() => router.replace(user !== null ? '/(tabs)/account' : '/(tabs)')}
      />
      <Body>
        {user === null ? <Text style={styles.brand}>Agri Rescue</Text> : null}
        <Text style={styles.title}>ข้อกำหนดและนโยบายผู้รับบริจาค</Text>
        <Text style={styles.meta}>เวอร์ชัน 2026-09-24</Text>
        <Text style={styles.draftNote}>
          เนื้อหานี้เป็นร่างให้ผู้ใช้ตรวจ — ยังไม่ผ่านการตรวจทางกฎหมาย โปรดใช้ด้วยความระมัดระวังจนกว่าจะมีการรับรองอย่างเป็นทางการ
        </Text>

        <Text style={styles.h2}>1. ขอบเขต</Text>
        <Text style={styles.p}>
          ข้อกำหนดนี้ใช้กับผู้ที่สมัครเป็นผู้รับบริจาคพืชผลผ่านแพลตฟอร์ม Agri Rescue ทั้งบุคคล (จิตอาสา)
          และองค์กร รวมถึงการใช้ข้อมูลส่วนบุคคลตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)
        </Text>

        <Text style={styles.h2}>2. ห้ามนำไปขายต่อ</Text>
        <Text style={styles.p}>
          ผลผลิตที่ได้รับบริจาคต้องนำไปใช้หรือแจกจ่ายเพื่อสาธารณประโยชน์เท่านั้น ห้ามขายต่อ แลกเปลี่ยนเป็นเงิน
          หรือใช้เพื่อประโยชน์ทางการค้า หากตรวจพบอาจถูกระงับสิทธิ์ทันทีและอาจถูกปฏิเสธคำขอในอนาคต
        </Text>

        <Text style={styles.h2}>3. รูปยืนยันภายใน 48 ชั่วโมง</Text>
        <Text style={styles.p}>
          หลังรับบริจาคสำเร็จ ผู้รับต้องส่งรูปถ่ายที่แสดงการแจกจ่ายหรือการใช้ตามวัตถุประสงค์ภายใน 48 ชั่วโมง
          หากไม่ส่งตามกำหนด ระบบจะบันทึกเป็นความผิดพลาด และอาจส่งผลต่อการเลื่อนระดับหรือการระงับสิทธิ์
        </Text>

        <Text style={styles.h2}>4. เพดานรับและการเลื่อนระดับ</Text>
        <Text style={styles.p}>
          ผู้รับแต่ละระดับมีเพดานน้ำหนักต่อสัปดาห์ จิตอาสาทั่วไป 10 กก./สัปดาห์ จิตอาสาที่เชื่อถือได้ 30 กก./สัปดาห์
          องค์กรที่ยืนยันแล้วคิดตามจำนวนผู้รับประโยชน์ (0.5 กก. ต่อคนต่อสัปดาห์) การส่งรูปยืนยันที่ผ่านเกณฑ์ซ้ำ ๆ
          อาจเลื่อนระดับจิตอาสาได้
        </Text>

        <Text style={styles.h2}>5. การระงับสิทธิ์</Text>
        <Text style={styles.p}>
          หากพบการละเมิดเงื่อนไข การส่งรูปที่ไม่ตรงเรื่อง หรือพลาดกำหนดส่งรูปบ่อยครั้ง ระบบหรือผู้ดูแลอาจระงับสิทธิ์รับบริจาค
          การปลดระงับต้องผ่านผู้ดูแล
        </Text>

        <Text style={styles.h2}>6. ความปลอดภัยของอาหารใกล้หมดอายุ</Text>
        <Text style={styles.p}>
          ผลผลิตบนแพลตฟอร์มอาจใกล้หมดอายุ ผู้รับมีหน้าที่ตรวจสอบคุณภาพ ความสด และความปลอดภัยก่อนแจกจ่าย
          และต้องไม่แจกจ่ายอาหารที่เสื่อมสภาพหรือไม่เหมาะกับการบริโภค
        </Text>

        <Text style={styles.h2}>7. การใช้และเก็บข้อมูลตาม PDPA</Text>
        <Text style={styles.p}>
          เราเก็บข้อมูลที่จำเป็นต่อการสมัครและตรวจสอบ เช่น ชื่อ เบอร์โทร อีเมล ที่ตั้ง เอกสารยืนยันองค์กร
          และรูปยืนยันการแจกจ่าย ผู้ที่อาจเห็นข้อมูล ได้แก่ ผู้ดูแลระบบของแพลตฟอร์ม และเจ้าหน้าที่ที่เกี่ยวข้องกับการอนุมัติ
          เอกสารองค์กรเก็บไว้ตลอดที่บัญชียังใช้งาน และอย่างน้อย 2 ปีหลังปิดบัญชีหรือคำขอถูกปฏิเสธ เพื่อการตรวจสอบ
          ท่านสามารถขอดู แก้ไข หรือขอลบข้อมูลส่วนบุคคลที่ไม่จำเป็นต่อการปฏิบัติตามกฎหมายได้โดยติดต่อผู้ดูแลผ่านแอป
        </Text>

        <Text style={styles.h2}>8. การยอมรับข้อกำหนด</Text>
        <Text style={styles.p}>
          การส่งคำขอรับบริจาคถือว่าท่านได้อ่านและยอมรับข้อกำหนดฉบับนี้ หากมีการเปลี่ยนเวอร์ชัน ท่านต้องยอมรับใหม่ก่อนส่งคำขอหรือใช้สิทธิ์ต่อ
        </Text>

        <View style={styles.footer}>
          {user !== null ? (
            <PrimaryButton label="กลับ" onPress={() => router.back()} />
          ) : (
            <PrimaryButton label="กลับไปสมัคร" onPress={() => router.replace('/register')} />
          )}
        </View>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 22, fontWeight: '800', color: C.leaf, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 4 },
  meta: { color: C.mute, marginBottom: 8 },
  draftNote: {
    color: C.turmeric,
    backgroundColor: C.turmericSoft,
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  h2: { fontSize: 16, fontWeight: '700', color: C.leaf, marginTop: 14, marginBottom: 6 },
  p: { color: C.ink, lineHeight: 22, marginBottom: 4 },
  footer: { marginTop: 24, marginBottom: 40 },
});
