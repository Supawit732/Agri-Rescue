# Agri-Rescue

แอปมือถือช่วยระบายผลผลิตตกเกรดหรือใกล้เน่าเสียของเกษตรกรรายย่อยไปยังผู้รับซื้อในพื้นที่ แผนการทำอยู่ที่ [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)

ตอนนี้เสร็จ Phase 0 (โครงโปรเจกต์) บัญชีตัวอย่างจะมากับ seed ใน Phase 1

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
npm test       # unit test
npm run lint   # eslint
npm run build  # คอมไพล์ไปที่ dist/
npm run dev    # รัน API แบบ watch
npm run migrate
npm run seed
```

Phase 0: `migrate` และ `seed` ยังไม่เขียนสคีมา จบการทำงานโดยไม่เชื่อมฐานข้อมูล

## รันแอปมือถือ

```bash
cd mobile
npm install
npx expo start
```

สแกน QR ด้วย Expo Go บนเครื่องที่อยู่เครือข่ายเดียวกับเครื่องที่รันคำสั่งนี้
