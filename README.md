# Agri-Rescue

แอปมือถือช่วยระบายผลผลิตตกเกรดหรือใกล้เน่าเสียของเกษตรกรรายย่อยไปยังผู้รับซื้อในพื้นที่ แผนการทำอยู่ที่ [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)

ตอนนี้ Phase 4 พร้อมใช้ สคีมาอยู่ใน `server/src/db/migrations/` ค่าตัวอย่างจากต้นแบบอยู่ใน `server/src/db/seedData.ts` และสีอยู่ใน `mobile/src/theme.ts` API อยู่ใต้ `/api`

## โครงโปรเจกต์

- `server/` — API ด้วย Node.js, Express, TypeScript
- `mobile/` — แอป Expo (TypeScript, Expo Router)
- `docs/` — แผน, การตัดสินใจ, และต้นแบบ UI

## สิ่งที่ต้องมี

- Node.js 22
- npm
- MySQL 8 ที่ฟัง TCP `127.0.0.1:3306` (ใช้ตั้งแต่ Phase 1)
- แอป Expo Go บนมือถือ สำหรับเปิด `mobile/`

## ตั้งค่าเซิร์ฟเวอร์

```bash
cd server
cp .env.example .env
npm install
```

ตัวแปรใน `.env` (ดูค่าตัวอย่างใน `server/.env.example`)

| ตัวแปร | ความหมาย |
|---|---|
| `PORT` | พอร์ตของ API |
| `DB_HOST` | โฮสต์ MySQL ใช้ `127.0.0.1` |
| `DB_PORT` | พอร์ต MySQL |
| `DB_USER` | ผู้ใช้ฐานข้อมูล |
| `DB_PASSWORD` | รหัสผ่านฐานข้อมูล |
| `DB_NAME` | ชื่อฐานข้อมูล |
| `JWT_SECRET` | ความลับสำหรับเซ็น JWT |
| `DEPOT_LAT` | ละติจูดจุดเริ่มรอบวิ่ง |
| `DEPOT_LNG` | ลองจิจูดจุดเริ่มรอบวิ่ง |

ไฟล์ `.env` ไม่ถูก commit

## คำสั่งเซิร์ฟเวอร์

รันในโฟลเดอร์ `server/`

```bash
npm test       # unit test และ API test กับฐาน agri_rescue_test
npm run lint   # eslint
npm run build  # คอมไพล์ไปที่ dist/
npm run dev    # รัน API แบบ watch
npm run migrate
npm run seed
npm run seed:reset
```

`npm test` อ่าน `server/.env.test` แล้วรีเซ็ตข้อมูลในฐานนั้นก่อนแต่ละไฟล์เทส ไม่เรียก Open-Meteo จริง ฐานพัฒนาใน `.env` ไม่ถูกแตะ คัดลอก `server/.env.test.example` เป็น `server/.env.test` แล้วใส่รหัสฐานเทส ไฟล์ `.env` และ `.env.test` ไม่ถูก commit

## เรียก API

หลัง `npm run dev` (พอร์ตจาก `PORT` โดยทั่วไปคือ 3000) และมีข้อมูลจาก `npm run seed`

เข้าสู่ระบบด้วยผู้ซื้อตัวอย่าง:

```bash
curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"0800000011","password":"demo1234"}'
```

คำตอบมี `token` และ `user` โดยไม่มี `password_hash` นำ token ไปดูตลาดด่วนในรัศมี 15 กม. จากรถพุ่มพวงป้าแดง:

```bash
curl -s 'http://127.0.0.1:3000/api/market?lat=13.662&lng=100.611&radius_km=15' \
  -H 'Authorization: Bearer TOKEN'
```

สมัครสมาชิกได้เฉพาะเกษตรกรและผู้ซื้อ คนขับกับผู้ประสานมีจาก seed เท่านั้น JWT อายุ 7 วัน

ผู้ประสานสร้างรอบโดยส่ง `driver_id` ของคนขับ ดูตัวอย่างด้านล่าง คนขับที่ถูกมอบหมายยืนยันจุดรับด้วยน้ำหนัก หรือจุดส่งด้วย OTP รหัสผิดครบ 5 ครั้งจะล็อกจุดนั้น ผู้ประสานปลดล็อกที่ `POST /api/stops/:id/unlock`

สร้างรอบ หลัง login ผู้ประสาน `0800000005` และคนขับ `0800000004` ใช้ `user.id` ของคนขับเป็น `driver_id`:

```bash
curl -s -X POST http://127.0.0.1:3000/api/batches \
  -H 'Authorization: Bearer COORDINATOR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"driver_id": DRIVER_USER_ID}'
```

ยืนยันจุดรับ และจุดส่ง:

```bash
curl -s -X POST http://127.0.0.1:3000/api/stops/STOP_ID/confirm \
  -H 'Authorization: Bearer DRIVER_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"weight_kg": 80}'

curl -s -X POST http://127.0.0.1:3000/api/stops/STOP_ID/confirm \
  -H 'Authorization: Bearer DRIVER_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"otp": "1234"}'
```

`npm run migrate` สร้างตารางถ้ายังไม่มี และข้ามไฟล์ที่รันไปแล้ว `npm run seed` ใส่ค่าจาก `seedData.ts` โดยข้ามแถวที่มีอยู่แล้ว จึงรันซ้ำได้โดยจำนวนแถวไม่เพิ่ม

`npm run seed:reset` ใช้ก่อนเดโมเท่านั้น ลบออเดอร์ รอบวิ่ง จุดแวะ ผลลัพธ์ และการประเมินคุณภาพ แล้วสร้างล็อตตัวอย่างใหม่ให้ `expires_at` นับจากเวลาปัจจุบัน ไม่ลบผู้ใช้ พืช และแปลง และไม่ได้รันเองตอนเปิดเซิร์ฟเวอร์

รหัสผ่านทุกบัญชีคือ `demo1234`

| role | name | phone |
|---|---|---|
| farmer | ลุงสมชาย | 0800000001 |
| farmer | ป้าบุญมี | 0800000002 |
| farmer | พี่ต้อม | 0800000003 |
| driver | คนขับตัวอย่าง | 0800000004 |
| coordinator | ผู้ประสานตัวอย่าง | 0800000005 |
| buyer | รถพุ่มพวงป้าแดง | 0800000011 |
| buyer | บ้านพักเด็กชุมชน | 0800000012 |
| buyer | ร้านข้าวแกงลุงชม | 0800000013 |

## รันแอปมือถือ

```bash
cd mobile
npm install
npx expo start
```

สแกน QR ด้วย Expo Go บนเครื่องที่อยู่เครือข่ายเดียวกับเครื่องที่รันคำสั่งนี้
