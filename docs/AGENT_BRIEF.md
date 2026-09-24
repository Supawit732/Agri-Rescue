# Agri-Rescue — Brief สำหรับ Agent ใหม่

> อ่านไฟล์นี้ทั้งหมดก่อนเริ่มงาน แล้ววางไว้ที่ `docs/AGENT_BRIEF.md` ใน commit แรก
> ถ้าสิ่งที่เขียนในนี้ไม่ตรงกับโค้ดจริงบน main ให้เชื่อโค้ด แล้วรายงานจุดที่ไม่ตรงก่อนเริ่มเขียนโค้ด

## 1. โปรเจกต์คืออะไร

แอปมือถือ **ระบายผลผลิตตกเกรด/ใกล้เสียระดับชุมชน** ในรัศมี 10–15 กม. ผู้ใช้หนึ่งคนเป็นได้ทั้งผู้ขาย (เกษตรกร) และผู้ซื้อ ระบบประเมินอายุการขายและราคาด่วนด้วย AI + พยากรณ์อากาศ จัดเส้นทางรับของหลายแปลงในรอบเดียว และรองรับการบริจาคให้องค์กร/จิตอาสาที่ผ่านการยืนยัน

เป็นงานกลุ่มวิชา Internet Programming (รวมความรู้ BPDD, Database, AI) **นำเสนอ + เดโมบน iPhone จริงวันที่ 1 ต.ค.** หยุดแก้โค้ดวันที่ 30 ก.ย.

## 2. Repo และเครื่อง

- GitHub: `Supawit732/Agri-Rescue` (private)
- โฟลเดอร์บนเครื่องผู้ใช้: `~/development/agri-rescue` (macOS)
- `server/` — Node + Express + TypeScript (strict), mysql2/promise, zod, jsonwebtoken, bcryptjs, jest + supertest
- `mobile/` — Expo SDK 57, Expo Router, TypeScript; ระบบสองภาษา TH/EN (I18nProvider + ไฟล์แปล th/en); กราฟ react-native-gifted-charts (+ expo-linear-gradient, react-native-svg)
- MySQL 8 ผ่าน TCP `127.0.0.1:3306`, ฐาน `agri_rescue`, test ใช้ `agri_rescue_test` จาก `server/.env.test`
- CI: `.github/workflows/ci.yml` (server test/lint/build + mobile export)

## 3. เอกสารที่ต้องอ่าน
- `docs/IMPLEMENTATION_PLAN.md` — แผนเดิม Phase 0–5 และ Conventions
- `docs/PLAN_V2.md` — แผน v2 (มีตารางสถานะด้านบน)
- `docs/DECISIONS.md` — การตัดสินใจทั้งหมด (D001 ขึ้นไป) อ่านก่อนเปลี่ยนพฤติกรรมใด ๆ
- `docs/UI_PLAN.md` + `docs/design/mockups/*.dc.html` — งาน UI ที่ต้องทำต่อ (mockup เป็น HTML inline style อ่านค่าจากไฟล์ตรง ๆ ข้อความใน `[ ]` คือข้อมูลตัวอย่าง)
- `docs/bpdd/` — เอกสารวิชา BPDD, `docs/DEVICE_DEMO.md`, `docs/DEMO_SCRIPT.md`

## 4. สถานะปัจจุบัน (merge แล้ว)
| ส่วน | สรุป |
|---|---|
| Phase 0–5 | server, schema, domain logic (shelf-life, pricing, haversine, routing NN + 2-opt, state machine), API, แอป |
| 6.1 / 6.1b | บัญชีหลายบทบาท (can_sell, can_buy, is_admin), ผู้รับบริจาค 3 ระดับ (volunteer, trusted_volunteer, verified_org) เอกสารองค์กรแบบ private, รูปยืนยันบริจาค 48 ชม. |
| 6.1c | ราคาเริ่มต้น/ต่ำสุดที่ผู้ขายกำหนดในกรอบ, ราคาอ้างอิงกรมการค้าภายใน (MOC Open Data) จับคู่อัตโนมัติ + retry รายชั่วโมง + fallback, sale_mode (sell / donate / sell_then_donate), แก้ไขล็อตพร้อม log, AI แยกลักษณะปกติกับตำหนิ |
| 6.1d | error รายช่องทุกฟอร์ม (`{ error: { code, message, fields } }`), ฟอร์มสมัครรับบริจาคแบบ wizard + ข้อกำหนด |
| 6.1e | แบ่งขายล็อต (quantity_kg ต่อออเดอร์, FOR UPDATE) |
| 6.1f | แท็บ + side nav บนจอกว้าง, หน้ารายละเอียด/ยืนยัน/สำเร็จ, ซ่อนแผนบริจาคจากผู้ซื้อ (available_as) |
| demo-prep | dashboard, ลบล็อตแบบ soft delete, `npm run seed:demo`, ผู้ขายยืนยันรับของด้วย OTP + น้ำหนักจริง, CI |
| 6.2 | ตลาดสาธารณะไม่ต้อง login, รูปล็อต (lot_photos, server/uploads), กรองพืช, เรียงใกล้/ด่วน/ถูก |
| i18n | ระบบสองภาษา TH/EN, crops.name_en |

AI และบริการภายนอก:
- **ประเมินความสุกจากรูป**: OpenAI-compatible chat completions ตั้งค่าด้วย `AI_VISION_BASE_URL` / `AI_VISION_API_KEY` / `AI_VISION_MODEL` (ใช้ OpenCode Go + `mimo-v2.6-flash`, ต้องส่ง header `x-opencode-session`), json_schema, subject_match, low_confidence, fallback เมื่อใช้ไม่ได้
- **อากาศ**: Open-Meteo hourly 72 ชม. ใช้ค่าเฉลี่ยกลางวัน + ความชื้น > 85% ลดอายุ, cache 60 นาที
- **Reverse geocode**: Nominatim ผ่าน server พร้อม cache และ rate limit; resolve ลิงก์ Google Maps แบบกัน SSRF
- ห้ามเรียก API ภายนอกจริงใน test

ยังไม่ทำ: escrow/ชำระเงิน, ส่งพัสดุ, ข้อพิพาท, push notification, ร้านค้า/ติดตาม, ติดต่อเรา, LINE Login (อยู่ใน PLAN_V2 และ UI_PLAN)

## 5. บัญชีเดโม (รหัสผ่าน `demo1234`)
- `0800000001` เกษตรกร · `0800000011` ผู้ซื้อ · `0800000012` องค์กรที่อนุมัติแล้ว · `0800000005` ผู้ดูแลระบบ
- ก่อนเดโมใช้ `npm run seed:reset` หรือ `npm run seed:demo` (ตรวจใน DEMO_SCRIPT.md ว่าบัญชีตรงกัน)

## 6. การรันบนเครื่องผู้ใช้
- ผู้ใช้รัน server (`server/`: `npm run dev`) และ Expo (`mobile/`: `npx expo start -c`) เอง
- **ห้ามเปิด server หรือ Expo ค้างไว้ที่พอร์ต 3000/8081 หลังทำงานเสร็จ** เคยแย่งพอร์ตกับผู้ใช้หลายครั้ง
- `mobile/.env`: `EXPO_PUBLIC_API_URL=http://<LAN IP>:3000` (**ไม่มี `/api` ต่อท้าย** client เติมเอง)
- ทดสอบบน iPhone ผ่าน Expo Go, Mac กับมือถือต้องอยู่วง Wi-Fi เดียวกันหรือใช้ hotspot

## 7. กฎที่ต้องทำตามเสมอ
**Git**
- หนึ่งงาน = หนึ่ง branch จาก main ล่าสุด (`git checkout main && git pull` ก่อนเสมอ) = หนึ่ง PR
- เปิด draft PR หลัง commit แรก, push ทุกครั้งที่ test/lint/build **และ** `mobile npm run build` ผ่าน
- ห้าม force-push, ห้าม rebase branch ที่ push แล้ว, ห้าม push หรือ merge เข้า main เอง
- จบงานแล้วอัปเดตคำอธิบาย PR เป็นสรุปผล แล้ว**หยุดรอผู้ใช้ merge** ห้ามเริ่มงานถัดไปเอง
- ถ้า branch ต้องการงานจาก PR ที่ยังไม่ merge ให้ถามผู้ใช้ก่อน ห้ามแตก branch ต่อจาก PR ที่ยังเปิดอยู่
- ห้าม commit `.env*`, secret, API key, `server/uploads/*`, `server/private_uploads/*`, `server/.cache`

**ฐานข้อมูล**
- ไม่มี FOREIGN KEY และ VIEW (ตรวจ integrity ใน service) ใส่ INDEX บนคอลัมน์อ้างอิง
- migration ใหม่ใช้เลขถัดไป **ห้ามแก้ ห้ามเปลี่ยนชื่อ/เลข migration ที่เคย push แล้ว**
- query ใช้ placeholder เสมอ

**โค้ด**
- สูตรคำนวณทั้งหมดอยู่ใน `server/src/domain` เป็น pure function มี unit test; route ห้ามเขียนสูตรซ้ำ
- ทุกข้อความที่ผู้ใช้เห็นต้องอยู่ในไฟล์แปล th และ en ห้ามฝังข้อความในหน้าจอ
- error ของฟอร์มใช้รูปแบบ fields เดิม และแสดงกรอบแดงรายช่อง
- เคารพ safe area (Dynamic Island / แถบโฮม) ด้วย react-native-safe-area-context
- test ใช้ mock สำหรับ AI, Open-Meteo, MOC, Nominatim และ temp dir สำหรับ cache/ไฟล์
- อัปเดต `DECISIONS.md` ทุกครั้งที่ตัดสินใจเรื่องที่แผนไม่ได้ระบุ และอัปเดตตารางสถานะใน `PLAN_V2.md`

**การสื่อสาร**
- ผู้ใช้สื่อสารภาษาไทย รายงานเป็นภาษาไทย กระชับ
- สรุปทุก PR: ทำอะไร, จำนวน test, คำสั่งที่ผู้ใช้ต้องรันบนเครื่อง (เช่น `npm install`, `npm run migrate`), และสิ่งที่ควรลองบน iPhone

## 8. งานแรก
1. `git checkout main && git pull` แล้วตรวจว่าสถานะในข้อ 4 ตรงกับโค้ดจริง รายงานจุดที่ไม่ตรง
2. สร้าง branch ใหม่ commit `docs/AGENT_BRIEF.md`, `docs/UI_PLAN.md`, `docs/design/mockups/` (ผู้ใช้วางไฟล์ไว้ในเครื่องแล้ว)
3. ทำ **PR A** ตาม `docs/UI_PLAN.md` — ตรวจก่อนว่าข้อไหน 6.2/#24 ทำไปแล้ว (รูปล็อต ตัวกรองพืช การเรียงลำดับ) แล้วทำเฉพาะส่วนที่เหลือ และย้ายข้อความที่ยังไม่อยู่ในไฟล์แปลเข้าไปด้วย
4. จบแล้วรายงานและหยุดรอ
