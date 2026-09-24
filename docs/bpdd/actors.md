# ผู้มีส่วนร่วม (Actors)

สิทธิ์ถูกบังคับด้วย JWT + `requireAuth` / `requireRole` ใน `server/src/middleware/auth.ts` และประกาศที่ต้นทางของแต่ละ router หรือแต่ละ route ใน `server/src/routes/`

ถ้า role ไม่ตรง ระบบตอบ **403** รหัส `FORBIDDEN`

## ตาราง 4 role

| Role | หน้าที่ทางธุรกิจ | ทำได้ (endpoint ที่อนุญาต) | ทำไม่ได้ (ตัวอย่างจากโค้ด) |
|---|---|---|---|
| **farmer** (เกษตรกร) | มีแปลง ลงล็อตใกล้เน่าเสีย/ตกเกรด ดูล็อตของตน | `GET/POST /api/plots`, `GET /api/plots/mine`, `POST /api/lots/estimate`, `GET /api/lots` และ `/mine`, `POST /api/lots` — ทั้ง router ใช้ `requireRole('farmer')` | จองล็อต (`/api/orders` เป็น buyer), สร้างรอบ (`/api/batches` POST เป็น coordinator), ยืนยันจุดแวะ (`/api/stops` เป็น driver) |
| **buyer** (ผู้ซื้อ) | ดูตลาดด่วน จองหรือรับบริจาค ดู OTP ยกเลิกจองที่ยังไม่เข้ารอบ | `GET /api/market` → `requireRole('buyer')`; ทั้ง `/api/orders` → `requireRole('buyer')` (`POST /`, `GET /mine`, `DELETE /:id`) | ลงล็อต/จัดการแปลง, สร้างรอบ, ยืนยัน pickup/drop, ปลดล็อก OTP; บริจาคได้เฉพาะ `buyer_type = charity` และล็อต `allow_donation` |
| **driver** (คนขับ) | ดูรอบที่ถูกมอบหมาย ยืนยันรับของด้วยน้ำหนัก และส่งมอบด้วย OTP | `GET /api/batches`, `GET /api/batches/:id` → `requireRole('driver', 'coordinator')` แต่คนขับเห็นเฉพาะรอบที่ `driver_id` ตรงตน; `POST /api/stops/:id/confirm` → `requireRole('driver')` | สมัครเองผ่าน `POST /api/auth/register` (ตอบ 403); สร้างรอบ; ปลดล็อก OTP (`unlock` เป็น coordinator); ยืนยันรอบของคนขับอื่น (403 ใน `confirmStop` / `GET /batches/:id`) |
| **coordinator** (ผู้ประสาน) | สร้างรอบวิ่ง มอบหมายคนขับ ตรวจจุดแวะ ปลดล็อก OTP | `POST /api/batches` → `requireRole('coordinator')`; `GET /api/batches/drivers` → coordinator; `GET /api/batches` และ `/:id` ร่วมกับ driver; `POST /api/stops/:id/unlock` → `requireRole('coordinator')` | สมัครเองผ่าน register (403); ยืนยันจุดแวะในฐานะคนขับ; จองล็อตในฐานะผู้ซื้อ |

## Endpoint ที่ไม่ผูก role เดียว

| Endpoint | การยืนยันตัวตน | หมายเหตุ |
|---|---|---|
| `POST /api/auth/register` | ไม่ต้อง login | รับเฉพาะ role `farmer` / `buyer` แม้ schema Zod จะมี `driver` / `coordinator` |
| `POST /api/auth/login` | ไม่ต้อง login | คืน JWT + user (ไม่มี `password_hash`) |
| `GET /api/crops` | **ไม่บังคับ auth** | รายการพืชสาธารณะ |
| `GET /api/impact/summary` | `requireAuth` เท่านั้น | role ใดก็ได้ที่ login แล้ว |

## บัญชีตัวอย่างจาก seed

รหัสผ่านทุกบัญชี: `demo1234` (`server/src/db/seedData.ts`)

| Role | ชื่อ | เบอร์ |
|---|---|---|
| farmer | ลุงสมชาย / ป้าบุญมี / พี่ต้อม | 0800000001–003 |
| driver | คนขับตัวอย่าง | 0800000004 |
| coordinator | admin | 0800000005 |
| buyer | รถพุ่มพวงป้าแดง / บ้านพักเด็กชุมชน / ร้านข้าวแกงลุงชม | 0800000011–013 |
