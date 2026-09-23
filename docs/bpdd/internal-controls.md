# การควบคุมภายใน (Internal Controls)

ตารางด้านล่างเชื่อม**ความเสี่ยงทางธุรกิจ**กับ**การควบคุมในระบบ** โดยอ้างไฟล์โค้ดและเทสที่มีอยู่จริงเท่านั้น

| ความเสี่ยง | Control ในระบบ | โค้ดที่บังคับใช้ | Test ที่ยืนยัน |
|---|---|---|---|
| จองล็อตซ้อนสองคนพร้อมกัน ทำให้ขายของชิ้นเดียวสองครั้ง | ล็อกล็อตด้วยธุรกรรม `SELECT ... FOR UPDATE`; รับเฉพาะสถานะ `open` มิฉะนั้น 409 `LOT_NOT_OPEN` | `server/src/routes/orders.ts` (สร้างออเดอร์) | `server/tests/api/orders.test.ts` — concurrent booking ได้สถานะ `[201, 409]` และฝ่ายแพ้ได้รหัส `LOT_NOT_OPEN` |
| มีคนสมัครเป็น coordinator หรือ driver เองเพื่อสร้างรอบหรือยืนยันของโดยไม่ได้รับมอบหมาย | `POST /auth/register` อนุญาตเฉพาะ `farmer` และ `buyer`; role อื่นตอบ 403 | `server/src/routes/auth.ts` | `server/tests/api/auth.test.ts` — สมัคร coordinator/driver ได้ 403 ข้อความ `สมัครได้เฉพาะเกษตรกรและผู้ซื้อ` และไม่มีแถวในฐาน |
| เดา OTP ซ้ำ ๆ (brute force) ที่จุดส่ง | นับ `otp_attempts`; เมื่อครบ 5 ตอบ 409 `OTP_LOCKED` และต้องให้ผู้ประสานปลดล็อก | `server/src/delivery/confirmStop.ts` (`confirmDrop`); `POST /api/stops/:id/unlock` ใน `stops.ts` จำกัด `requireRole('coordinator')` | `server/tests/api/delivery.test.ts` — ผิด 4 ครั้งได้ `OTP_MISMATCH`, ครั้งที่ 5 ได้ `OTP_LOCKED` และ `otp_attempts === 5`; OTP ถูกหลังล็อกยังเข้าไม่ได้จนกว่า unlock |
| น้ำหนักที่รับจริงไม่ตรงกับที่เกษตรกรแจ้ง | คำนวณส่วนต่างสัมพัทธ์; ถ้าเกิน 10% ตั้ง `weight_flag = 1` ให้ผู้ประสานตรวจได้ (ยังยืนยันรับของได้) | `confirmStop.ts` (`confirmPickup`): `abs(w - planned) / planned > 0.1` | `server/tests/api/delivery.test.ts` — ชั่งเท่าที่แจ้ง → `weight_flag` เท็จ; ชั่ง 50 จากที่แจ้ง 40 → `weight_flag` จริง |
| คนขับยืนยันจุดแวะของรอบที่ไม่ได้มอบหมายให้ตน | เทียบ `batches.driver_id` กับ user ที่ login; ไม่ตรงตอบ 403 | `confirmStop.ts` ต้นฟังก์ชัน; `GET /api/batches/:id` ใน `batches.ts` | `server/tests/api/delivery.test.ts` — คนขับอื่น confirm / ดูรายละเอียดรอบได้ 403 |
| ส่งมอบ (drop) ก่อนรับของ (pickup) ครบ | ถ้ายังมีออเดอร์ของจุดส่งเป็น `reserved` หรือยังไม่มีน้ำหนัก pickup ที่ done → 409 `PICKUP_REQUIRED` | `confirmStop.ts` (`confirmDrop`) | `server/tests/api/delivery.test.ts` — ยืนยัน drop ก่อน pickup ได้ `PICKUP_REQUIRED`; เคส merge drop ยังต้องรับครบก่อน |
| SSRF ผ่าน resolve ลิงก์ Maps | allowlist host Google Maps เท่านั้น; บล็อก localhost / IP literal / IPv6; ตาม redirect สูงสุด 5 ครั้ง; timeout 5 วินาที | `server/src/geo/resolveLink.ts`, `domain/mapsLink.ts` | `server/tests/geo/resolveLink.test.ts`, `server/tests/api/geo.test.ts` |
| ยิง `/api/geo` ถี่เกินไป | rate limit 20 คำขอต่อ IP ต่อนาที → 429 `RATE_LIMIT` | `server/src/middleware/geoRateLimit.ts` | `server/tests/api/geo.test.ts` |
| ใช้รูปที่ไม่ใช่พืชที่เลือกมาตั้งความสุก | โมเดลต้องส่ง `subject_match`; ถ้า false API ไม่คืนค่าความสุกให้แอปใช้ | `server/src/ai/vision.ts` | `server/tests/ai/vision.test.ts` — เคส `subject_match: false` |

## Control เสริมที่เกี่ยวข้อง (มีในโค้ด)

| ความเสี่ยง | Control | โค้ด / เทส |
|---|---|---|
| ออเดอร์เดียวถูกใส่สองรอบ | ล็อกออเดอร์ `reserved` ที่ `batch_id IS NULL` ด้วย `FOR UPDATE` ตอนสร้างรอบ | `createBatch.ts`; เทส concurrent สร้างรอบใน `delivery.test.ts` |
| ยกเลิกออเดอร์หลังเข้ารอบแล้วทำให้แผนวิ่งเพี้ยน | ห้ามยกเลิกเมื่อ `batch_id !== null` (409 `ORDER_IN_BATCH`) | `orders.ts` |
| ล็อตหมดอายุแล้วยังถูกจอง | ตอนจองตรวจ `expires_at`; job หมดอายุเปลี่ยนเฉพาะล็อต `open` | `orders.ts`, `expireLots.ts`, `expireLots.test.ts` |
| เปลี่ยนสถานะล็อตข้ามขั้น | `assertLotTransition` | `lotStateMachine.ts`, `lotStateMachine.test.ts` |
