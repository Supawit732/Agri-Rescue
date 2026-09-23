# Agri-Rescue — Implementation Plan

> สำหรับ Claude Code: อ่านไฟล์นี้ทั้งหมดก่อนเริ่ม ทำทีละ Phase ตามลำดับ
> จบแต่ละ Phase ให้รันการตรวจสอบใน "Done when" ให้ผ่าน, commit, แล้วสรุปสิ่งที่ทำพร้อมหยุดรอให้ผู้ใช้สั่ง Phase ถัดไป
> ถ้าเจอจุดที่แผนไม่ได้ระบุ ให้เลือกทางที่ง่ายที่สุดที่ไม่ขัดกับแผน แล้วบันทึกไว้ใน `docs/DECISIONS.md`

## 1. เป้าหมาย

แอปมือถือที่ช่วยระบาย "ผลผลิตตกเกรด/ใกล้เน่าเสีย" ของเกษตรกรรายย่อยในรัศมี 10–15 กม. ไปยังผู้รับซื้อท้องถิ่น รถเร่ ร้านค้า และสถานสงเคราะห์ โดยระบบ

1. ประเมินอายุการขาย (shelf-life) และราคาด่วนของแต่ละล็อต
2. รวมคำสั่งซื้อเป็นรอบวิ่ง (batch) และจัดลำดับจุดรับ-ส่งให้วิ่งรอบเดียว
3. ยืนยันการส่งมอบพร้อมการควบคุมภายใน และบันทึก Food Waste / CO₂e ที่ลดได้

ต้นแบบ UI อยู่ที่ `docs/prototype/App.js` (Expo ไฟล์เดียว, mock data) ใช้เป็นแหล่งอ้างอิงเรื่องหน้าจอ สี และสูตรคำนวณ ห้ามแก้ไฟล์นั้น

## 2. Tech stack และโครงสร้าง repo

- **mobile/** — Expo (TypeScript), Expo Router, `expo-secure-store` เก็บ JWT
- **server/** — Node.js + Express + TypeScript, `mysql2/promise`, `jsonwebtoken`, `bcryptjs`, `zod` สำหรับ validate input
- **Tests** — `jest` + `ts-jest` (unit), `supertest` (API)
- **docs/** — `prototype/App.js`, `DECISIONS.md`, `ERD.md` (Mermaid)

```
agri-rescue/
  server/
    src/
      domain/        # pure functions: shelfLife, pricing, geo, routing  (ไม่มี I/O)
      db/            # pool, migrations/*.sql, seed.ts
      routes/        # auth, crops, plots, lots, market, orders, batches, stops, impact
      middleware/    # auth (JWT), requireRole, errorHandler
      jobs/          # expireLots
      app.ts server.ts
    tests/
  mobile/
    app/             # Expo Router: (auth)/, (farmer)/, (buyer)/, (driver)/, (coordinator)/
    src/api/ src/context/ src/components/ src/theme.ts
  docs/
```

## 3. ข้อจำกัดที่ต้องทำตาม

- **ห้ามใช้ FOREIGN KEY constraint และ VIEW ในฐานข้อมูล** (เซิร์ฟเวอร์ของวิชาไม่ให้สิทธิ์ REFERENCES / CREATE VIEW) — ให้ตรวจ integrity ใน service layer และเขียน JOIN ใน query ตรง ๆ แต่ใส่ INDEX บนคอลัมน์ที่เป็น FK
- **ห้ามใช้ native module ที่ต้อง compile** (เช่น `bcrypt`) — ใช้ `bcryptjs`
- ค่า config ทั้งหมดอ่านจาก `.env` มีแค่ `.env.example` ใน repo (`PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `DEPOT_LAT`, `DEPOT_LNG`)
- MySQL เชื่อมผ่าน TCP (`127.0.0.1:3306`) ไม่ใช่ unix socket
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยทั้งหมด; ชื่อตัวแปร ตาราง และ endpoint เป็นภาษาอังกฤษ
- เวลาเก็บเป็น UTC ใน DB แสดงผลเป็นเวลาไทยในแอป

## 4. Data model

| ตาราง | คอลัมน์หลัก |
|---|---|
| `users` | id, name, phone (unique), password_hash, role ENUM('farmer','buyer','driver','coordinator'), buyer_type ENUM('vendor','shop','charity') NULL, lat, lng, created_at |
| `crops` | id, name_th, base_shelf_days, market_price_per_kg |
| `plots` | id, farmer_id, name, lat, lng, area_rai |
| `harvest_lots` | id, plot_id, crop_id, weight_kg, grade ENUM('normal','substandard'), ripeness TINYINT(0–4), photo_url NULL, allow_donation BOOL, predicted_shelf_hours, expires_at, status ENUM('open','reserved','picked','delivered','expired','cancelled'), created_at |
| `quality_assessments` | id, lot_id, method ENUM('rule','model'), ripeness, temp_c, humidity, predicted_shelf_hours, created_at |
| `orders` | id, lot_id, buyer_id, agreed_price_per_kg, is_donation, status ENUM('reserved','picked','delivered','cancelled'), batch_id NULL, drop_otp CHAR(4), created_at |
| `batches` | id, driver_id NULL, status ENUM('planned','in_progress','completed'), planned_km, created_at |
| `route_stops` | id, batch_id, seq, stop_type ENUM('pickup','drop'), lot_id NULL, buyer_id NULL, lat, lng, leg_km, status ENUM('pending','done'), confirmed_weight_kg NULL, proof_photo_url NULL, weight_flag BOOL DEFAULT 0, confirmed_at NULL |
| `impact_logs` | id, order_id, kg_saved, co2e_kg, created_at |

ความสัมพันธ์: users 1–N plots, plots 1–N harvest_lots, crops 1–N harvest_lots, harvest_lots 1–N quality_assessments, harvest_lots 1–0..1 orders ที่ active, batches 1–N orders, batches 1–N route_stops, orders 1–1 impact_logs

เขียน `docs/ERD.md` เป็น Mermaid `erDiagram` ให้ตรงกับตารางนี้

## 5. Business rules

**Shelf-life (rule-based, ต้องให้ผลตรงกับต้นแบบ)**
```
base = crop.base_shelf_days * 24
ripeFactor = 1 - ripeness * 0.18
heatFactor = temp > 30 ? max(0.6, 1 - (temp - 30) * 0.05) : 1
shelfHours = max(6, round(base * ripeFactor * heatFactor))
expires_at = created_at + shelfHours
```

**ราคาด่วน** (คำนวณ ณ เวลาที่ดู ไม่เก็บลง DB จนกว่าจะจอง)
```
freshness = clamp(hoursLeft / base, 0, 1)
gradeFactor = grade == 'substandard' ? 0.7 : 1
price = max(5, round(market_price * (0.3 + 0.7 * freshness) * gradeFactor))
```
ตอนจองให้ล็อกราคาไว้ใน `orders.agreed_price_per_kg`

**อากาศ** ดึงจาก Open-Meteo (ไม่ต้องใช้ API key) ตามพิกัดแปลง; ถ้าเรียกไม่สำเร็จใช้ค่า fallback 32°C / 75% และบันทึก warning

**ตลาด** แสดงเฉพาะล็อต `open` ที่ยังไม่หมดเวลา และอยู่ในรัศมี `radius_km` (ค่าเริ่มต้น 15) จากตำแหน่งผู้ซื้อ เรียงตาม `expires_at` จากใกล้สุด

**การจอง**
- ใช้ transaction + `SELECT ... FOR UPDATE` บนล็อต กันการจองซ้อน; ถ้าล็อตไม่ใช่ `open` ตอบ 409
- จองแบบบริจาคได้เฉพาะ `buyer_type = 'charity'` และ `allow_donation = 1` (ราคา = 0)
- สร้าง `drop_otp` สุ่ม 4 หลักตอนจอง แสดงให้ผู้ซื้อเห็นเท่านั้น
- ผู้ซื้อยกเลิกได้เฉพาะก่อนถูกใส่ใน batch → ล็อตกลับเป็น `open`

**State machine ของล็อต**
`open → reserved → picked → delivered`, `open → expired` (job), `reserved → open` (ยกเลิก)
ทุกการเปลี่ยนสถานะต้องผ่านฟังก์ชันเดียวใน service ที่ตรวจว่า transition ถูกต้อง

**การจัดรอบและเส้นทาง**
- coordinator กด "สร้างรอบ" → ดึง orders `reserved` ที่ยังไม่มี batch_id
- สร้าง stops: pickup ต่อล็อต, drop ต่อผู้ซื้อ (รวมหลายออเดอร์ของผู้ซื้อคนเดียวเป็นจุดเดียว)
- จัดลำดับด้วย nearest-neighbor จาก depot แล้วปรับด้วย 2-opt โดยต้องรักษาเงื่อนไข **pickup ของออเดอร์ต้องมาก่อน drop ของผู้ซื้อคนนั้นเสมอ**
- routing อยู่หลัง interface `RouteSolver` เพื่อสลับเป็น OR-Tools (Python service) ได้ภายหลังโดยไม่แก้ route handler

**การยืนยันส่งมอบ (internal control)**
- pickup: คนขับกรอกน้ำหนักที่ชั่งจริง; ถ้าต่างจาก `weight_kg` เกิน 10% ให้ตั้ง `weight_flag = 1`
- drop: ต้องกรอก OTP ของผู้ซื้อให้ถูก และทำได้เฉพาะเมื่อ pickup ของออเดอร์นั้นเสร็จแล้ว
- เมื่อ drop สำเร็จ: order และ lot → `delivered`, สร้าง `impact_logs` (co2e = kg × 2.5), batch → `completed` เมื่อทุก stop เสร็จ

**Job หมดอายุ** รันทุก 10 นาที: ล็อต `open` ที่เลย `expires_at` → `expired`

## 6. API

ทุก endpoint อยู่ใต้ `/api`, ใช้ JWT ยกเว้น auth และ `GET /crops`; error format `{ error: { code, message } }`

| Method | Path | Role | หมายเหตุ |
|---|---|---|---|
| POST | /auth/register, /auth/login | – | คืน token + user |
| GET | /crops | – | |
| POST / GET | /plots, /plots/mine | farmer | |
| POST | /lots/estimate | farmer | preview shelfHours + price ไม่บันทึก |
| POST / GET | /lots, /lots/mine | farmer | POST สร้าง quality_assessment ด้วย |
| GET | /market?lat=&lng=&radius_km= | buyer | ราคาคำนวณสด |
| POST | /orders | buyer | `{ lot_id, donation }` |
| GET | /orders/mine | buyer | รวม drop_otp |
| DELETE | /orders/:id | buyer | ยกเลิกก่อนเข้า batch |
| POST | /batches | coordinator | สร้างรอบ + จัดเส้นทาง |
| GET | /batches/:id | driver, coordinator | พร้อม stops เรียงตาม seq |
| POST | /stops/:id/confirm | driver | pickup: `{ weight_kg }`, drop: `{ otp }` |
| GET | /impact/summary | ทุก role | kg, co2e, รายได้เกษตรกร, kg บริจาค, จำนวนล็อต |

## 7. Phases

### Phase 0 — Scaffold
- สร้างโครง repo ตามข้อ 2, คัดลอกต้นแบบไป `docs/prototype/App.js`
- server: tsconfig, eslint, jest, script `dev` / `build` / `test` / `migrate` / `seed`
- mobile: `npx create-expo-app mobile --template` (TypeScript + Expo Router)
- **Done when:** `npm test` ใน server ผ่าน (test ว่าง 1 ตัว), แอป mobile เปิดได้ใน Expo Go

### Phase 1 — Database
- `server/src/db/migrations/001_init.sql` ตามข้อ 4 (ไม่มี FK/VIEW, มี INDEX)
- `seed.ts`: 5 crops จากต้นแบบ, ผู้ใช้ตัวอย่างทุก role (รหัสผ่าน `demo1234`), 3 แปลง, 3 ล็อตแบบในต้นแบบ, ผู้ซื้อ 3 รายแบบในต้นแบบ
- `docs/ERD.md`
- **Done when:** `npm run migrate && npm run seed` รันซ้ำได้โดยไม่ error (idempotent)

### Phase 2 — Domain logic (pure functions + unit tests)
- `shelfLife.ts`, `pricing.ts`, `geo.ts` (haversine), `routing.ts` (NN + 2-opt + precedence), `lotStateMachine.ts`
- test: ค่าตัวอย่างต้องตรงกับที่ต้นแบบคำนวณ, 2-opt ไม่ทำให้ระยะแย่ลง, precedence ไม่ถูกละเมิดใน 100 กรณีสุ่ม, transition ที่ผิดต้อง throw
- **Done when:** coverage ของ `src/domain` ≥ 90%

### Phase 3 — Auth, lots, market, orders
- middleware auth + `requireRole`, zod validation, error handler
- endpoints auth, crops, plots, lots, market, orders ตามข้อ 6 รวม weather client + fallback
- API test: การจองพร้อมกัน 2 request ต้องสำเร็จ 1 ได้ 409 อีก 1; บริจาคโดยผู้ซื้อที่ไม่ใช่ charity ต้องได้ 403
- **Done when:** `npm test` ผ่านทั้งหมดกับ test database แยก

### Phase 4 — Batching, routing, delivery, impact
- endpoints batches, stops, impact + expire job
- API test flow เต็ม: สร้างล็อต → จอง 2 ผู้ซื้อ → สร้างรอบ → confirm pickup (มีกรณีน้ำหนักต่าง >10%) → drop ด้วย OTP ผิดแล้วถูก → impact summary ถูกต้อง
- **Done when:** flow test ผ่าน และ `GET /batches/:id` คืน stops ที่เคารพ precedence

### Phase 5 — Mobile app
- `src/api/client.ts` (base URL จาก `EXPO_PUBLIC_API_URL`), `AuthContext` เก็บ token ใน secure store, hook `useApiData` + component loading/error/empty
- หน้า login/register แล้ว redirect ตาม role:
  - farmer: ลงล็อต (เรียก `/lots/estimate` แบบ debounce เพื่อ preview), ล็อตของฉัน
  - buyer: ตลาดด่วน (countdown อัปเดตทุก 30 วิ, สีตามความด่วนแบบต้นแบบ), การจองของฉัน + OTP
  - driver: รอบวิ่ง, ยืนยัน pickup (กรอกน้ำหนัก) / drop (กรอก OTP)
  - coordinator: ปุ่มสร้างรอบ, รายการ stops ที่ `weight_flag = 1`
  - ทุก role: หน้าผลลัพธ์
- ใช้โทนสีและ typography จาก `C` ในต้นแบบ ย้ายไป `src/theme.ts`
- **Done when:** เดิน flow ใน Phase 4 ผ่านแอปได้ครบโดยสลับ login 4 role

### Phase 6 — Polish (ทำเมื่อผู้ใช้สั่ง)
- `react-native-maps` แสดงจุดและเส้นทางในหน้าคนขับ
- `expo-notifications` แจ้งผู้ซื้อในรัศมีเมื่อมีล็อตใหม่ที่เหลือ < 48 ชม.
- อัปโหลดรูปล็อตและรูปหลักฐานส่งมอบ
- `RouteSolver` แบบ OR-Tools (FastAPI service แยก) พร้อม time windows และความจุรถ

### Phase 7 — AI ประเมินความสุกจากภาพ (ทำเมื่อผู้ใช้สั่ง)
- เก็บรูปพร้อม ripeness ที่เกษตรกรเลือกเป็น dataset ตั้งแต่ Phase 6
- เพิ่ม `method = 'model'` ใน quality_assessments; โมเดลเสนอ ripeness แต่เกษตรกรแก้ได้เสมอ

## 8. Out of scope
ระบบชำระเงินจริง, แชท, หลายภาษา, web dashboard

## 9. Conventions
- TypeScript strict ทั้งสองฝั่ง, ห้าม `any` ใน domain layer
- query ใช้ placeholder (`?`) เสมอ ห้ามต่อ string
- หนึ่ง commit ต่อหนึ่งหน่วยงานที่ทดสอบผ่าน, message แบบ `feat(server): ...`
- อัปเดต README (วิธี setup, env, migrate, seed, run, บัญชี demo) เมื่อจบทุก Phase
- **ห้ามเปลี่ยนชื่อหรือเลขไฟล์ migration ที่เคย push แล้ว** ถ้าเลขชนตอน merge ให้เปลี่ยนเฉพาะไฟล์ที่ยังไม่เคยอยู่บน `main` และบันทึกเหตุผลใน `docs/DECISIONS.md`

### การ push
- เปิด draft PR ทันทีหลัง commit แรกของ phase
- push ทุกครั้งที่ commit และ npm test, lint, build ผ่าน ไม่ต้องรอจบ phase; ถ้างานยังไม่เสร็จแต่ test ผ่าน ให้ commit เป็น "wip(...)" แล้ว push อย่างน้อยทุก ~30 นาทีของการทำงาน
- ห้าม push commit ที่ test ไม่ผ่าน, ห้าม force-push, ห้าม push หรือ merge เข้า main เอง
- ห้าม commit .env, .env.test หรือไฟล์ที่มีรหัสผ่าน
- ถ้า push ไม่สำเร็จ ให้หยุดแล้วรายงาน error
- จบ phase: อัปเดตคำอธิบาย draft PR เป็นสรุปผล แล้วหยุดรอให้ผู้ใช้ตรวจและ merge
