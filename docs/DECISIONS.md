# Decisions

จุดที่แผนไม่ได้ระบุ และทางที่เลือกไว้

## D001 — ค่าตัวอย่างมาจากต้นแบบผ่านข้อความ

ชุดสี พืช 5 ชนิด ผู้ซื้อ 3 ราย เกษตรกรและล็อต 3 ราย จุดรวบรวม ป้ายความสุก และ `CO2E_PER_KG = 2.5` ถูกคัดลอกจากต้นแบบผ่านข้อความ แล้วเขียนเป็นค่าคงที่ใน `server/src/db/seedData.ts` กับ `mobile/src/theme.ts` `seed.ts` import จากไฟล์นั้น ไม่ได้อ่านไฟล์ต้นแบบตอนรัน ไฟล์ `docs/prototype/App.js` จะตามมาทีหลังเพื่ออ้างอิง UI ใน Phase 5 และห้ามแก้ไฟล์นั้นเมื่อมาถึง

## D002 — migrate และ seed เชื่อม MySQL ผ่าน TCP

`migrate` สร้างฐานข้อมูลตาม `DB_NAME` ถ้ายังไม่มี แล้วรัน SQL ใน `server/src/db/migrations/` `seed` แทรกเฉพาะแถวที่ยังไม่มี จึงรันซ้ำได้โดยจำนวนแถวไม่เพิ่ม ทั้งคู่ใช้โฮสต์ `127.0.0.1` ไม่ใช้ unix socket

## D006 — ตาราง schema_migrations

แผนไม่ได้กำหนดตารางนี้ ใช้เก็บชื่อไฟล์ migration ที่รันแล้ว เพื่อไม่ให้ `npm run migrate` รัน SQL เดิมซ้ำ ไม่มี FOREIGN KEY และไม่มี VIEW

## D007 — เบอร์โทรและบัญชี role ที่ข้อความไม่ได้ให้มา

ข้อความให้ชื่อเกษตรกรและผู้ซื้อ แต่ไม่มีเบอร์โทร และไม่มีคนขับกับผู้ประสาน รหัสผ่านทุกบัญชีคือ `demo1234`

| role | name | phone |
|---|---|---|
| farmer | ลุงสมชาย | 0800000001 |
| farmer | ป้าบุญมี | 0800000002 |
| farmer | พี่ต้อม | 0800000003 |
| driver | คนขับตัวอย่าง | 0800000004 |
| coordinator | admin | 0800000005 |
| buyer vendor | รถพุ่มพวงป้าแดง | 0800000011 |
| buyer charity | บ้านพักเด็กชุมชน | 0800000012 |
| buyer shop | ร้านข้าวแกงลุงชม | 0800000013 |

## D008 — เวลาล็อต พื้นที่แปลง และอากาศ

`expires_at` = `2026-09-22T02:00:00Z` (09:00 เวลาไทย) บวกชั่วโมงที่ข้อความกำหนด (20, 30, 70) และเก็บชั่วโมงนั้นใน `predicted_shelf_hours` ใช้เวลาคงที่เพื่อให้ seed ซ้ำแล้วแถวไม่เปลี่ยน ข้อความไม่ได้ให้ `area_rai` จึงใส่ 1 ไร่ต่อแปลง ชื่อแปลงเป็น `แปลง` ตามด้วยชื่อเกษตรกร พิกัดแปลงและพิกัดผู้ใช้ของเกษตรกรใช้พิกัดล็อต

seed ไม่สร้าง `quality_assessments` เพราะข้อความให้ชั่วโมงที่เหลือ ไม่ได้ให้ผลประเมินอากาศ อากาศสำรองตอนเรียก Open-Meteo ไม่สำเร็จใช้ตามแผน 32°C / 75% ต้นแบบใช้ 34°C / 78% ค่านี้เก็บไว้เทียบใน Phase 2 เท่านั้น ตัวอย่างที่ต้องตรงใน Phase 2 เมื่อ temp 34°C: มะม่วงความสุก 2 ได้ shelfHours 61 และราคาเกรดปกติ 26 เมื่อชั่วโมงที่เหลือเท่ากับอายุการขาย, ความสุก 3 ได้ shelfHours 44

## D009 — บัญชี MySQL บนเครื่องนี้

workspace ไม่มี `server/.env` จึงสร้างไฟล์นี้ในเครื่องให้เชื่อม TCP `127.0.0.1:3306` ด้วยผู้ใช้ `agri` รหัส `agri-rescue` ฐาน `agri_rescue` บัญชี root ของ MySQL บนเครื่องนี้เข้าได้ทาง socket จึงไม่ใช้กับแอป ไฟล์ `.env` ไม่ถูก commit

## D003 — เทมเพลตมือถือเป็น `tabs`

ใช้ `npx create-expo-app mobile --template tabs` ซึ่งเป็น TypeScript และ Expo Router โฟลเดอร์ `(auth)`, `(farmer)`, `(buyer)`, `(driver)`, `(coordinator)` มีแค่ `.gitkeep` เพราะ Expo Router โหลดไฟล์ `.ts` / `.tsx` ใน `app/` เป็นหน้าจอ หน้าแท็บของเทมเพลตจึงยังเปิดได้ก่อน Phase 5 โฟลเดอร์ `components/` กับ `constants/` ที่เทมเพลตสร้างไว้คงเดิม โค้ดของโปรเจกต์อยู่ใต้ `mobile/src/`

## D004 — พิกัดจุดรวบรวม

ข้อความจากต้นแบบกำหนดจุดรวบรวมวิสาหกิจชุมชนที่ `13.65, 100.62` ค่านี้เขียนใน `seedData.ts` และใน `server/.env.example` เป็น `DEPOT_LAT` / `DEPOT_LNG`

## D010 — ระยะทางของเส้นทางเป็นเส้นเปิดจากจุดรวบรวม

Nearest-neighbor เริ่มที่ depot แล้วเลือกจุดที่ใกล้สุดโดยยังไม่รับ drop ถ้า pickup ของผู้ซื้อคนนั้นยังไม่ถูกแวะ 2-opt สลับช่วงได้เฉพาะเมื่อลำดับยังรักษา precedence และระยะรวมสั้นลงจริง ระยะรวมนับจาก depot ผ่านจุดตามลำดับ ไม่รวมเส้นกลับ depot ระยะเท่ากันให้คงจุดที่มาก่อนในรายการ

## D011 — seed:reset ใช้ก่อนเดโมเท่านั้น

`npm run seed:reset` ลบ `orders`, `batches`, `route_stops`, `impact_logs`, `quality_assessments`, `harvest_lots` แล้วสร้างล็อตตัวอย่างใหม่โดย `expires_at` นับจากเวลาที่รันคำสั่ง ไม่ลบ `users`, `crops`, `plots` ไม่ได้ถูกเรียกจาก `dev`, `migrate`, `seed` หรือตอนเปิดเซิร์ฟเวอร์

## D012 — Phase 3: สิทธิ์ ราคา อากาศ และฐานเทส

`POST /auth/register` รับเฉพาะ role `farmer` และ `buyer` ถ้าส่ง `driver` หรือ `coordinator` ตอบ 403 บัญชีสอง role นั้นสร้างจาก seed เท่านั้น JWT ใช้ `expiresIn: 7d` ทุก response ที่คืนผู้ใช้ไม่มีฟิลด์ `password_hash`

เกษตรกรสร้างและดูได้เฉพาะแปลงกับล็อตของตนเอง ถ้าส่ง `plot_id` ของเกษตรกรคนอื่น ตอบ 403

`GET /market` เลือกเฉพาะล็อต `open` ที่ `expires_at > UTC_TIMESTAMP()` ใน SQL แล้วตัดล็อตนอก `radius_km` (ค่าเริ่มต้น 15) ราคาใน `/market`, `/lots/estimate`, การสร้างล็อต และการจองเรียก `urgentPricePerKg` และ `predictShelfHours` จาก `src/domain`

ไคลเอนต์ Open-Meteo ตัดการเชื่อมต่อที่ 3000 มิลลิวินาที แล้วใช้ 32°C / 75% (รายละเอียดพยากรณ์ 72 ชม. ดู D014)

Jest โหลด `server/.env.test` ก่อน แล้วรีเซ็ตตารางข้อมูลใน `agri_rescue_test` ก่อนแต่ละไฟล์ รันทีละไฟล์ และ mock `fetch` ทั้งกรณีสำเร็จและกรณี timeout คัดลอก `server/.env.test.example` เป็น `server/.env.test` แล้วใส่รหัสฐานเทสในเครื่อง ไฟล์นี้ไม่ถูก commit

## D013 — Phase 4: รอบที่มอบหมายคนขับ และการล็อก OTP

`POST /batches` ต้องส่ง `driver_id` ที่เป็น user role `driver` ไม่มีออเดอร์ `reserved` ที่ยังไม่มีรอบตอบ 422 ข้อความภาษาไทย การสร้างรอบล็อกออเดอร์ด้วย `SELECT ... FOR UPDATE` คนขับดูและยืนยันได้เฉพาะรอบที่ `driver_id` ตรงกับตนเอง

จุดที่ `done` แล้วยืนยันซ้ำตอบ 409 น้ำหนักที่ต่างจาก `weight_kg` เกิน 10% ตั้ง `weight_flag` drop ทำได้เมื่อ pickup ของทุกออเดอร์ของผู้ซื้อคนนั้นในรอบเสร็จแล้ว ไม่งั้น 409 OTP ผิดสะสมใน `route_stops.otp_attempts` จาก migration `002_otp_attempts.sql` ครบ 5 ครั้งจุดนั้นถูกล็อก ผู้ประสานปลดล็อกที่ `POST /stops/:id/unlock`

`impact_logs.kg_saved` ใช้น้ำหนักที่ชั่งได้ ไม่ใช่น้ำหนักที่เกษตรกรแจ้ง ออเดอร์บริจาคไม่นำราคาไปคิดรายได้เกษตรกร `co2e_kg = kg_saved × 2.5`

`expireOpenLots(now)` เปลี่ยนเฉพาะล็อต `open` ที่เลยเวลาเป็น `expired` `startExpireSchedule` ถูกเรียกจาก `server.ts` เท่านั้น

## D014 — พยากรณ์อากาศ 72 ชม. และผลของความชื้นต่อ shelf-life

ไคลเอนต์ Open-Meteo ดึง `hourly=temperature_2m,relative_humidity_2m` ล่วงหน้า 72 ชั่วโมง ตามพิกัดแปลง ตั้ง `timezone=Asia/Bangkok` แล้วใช้**ค่าเฉลี่ยช่วงกลางวัน 10:00–17:00** ของช่วงนั้นเป็น `temp_c` / `humidity` ใน `predictShelfHours` แทนค่าปัจจุบัน `/lots/estimate` คืน `weather_basis: forecast_72h_daytime_avg` คู่กับ `weather_source` (`live` | `fallback`)

เหตุผลที่เพิ่มปัจจัยความชื้น: ความชื้นสูงเร่งการเน่าเสียของผลผลิตสด เมื่อความชื้นเฉลี่ยกลางวัน **มากกว่า 85%** ให้คูณอายุที่คำนวณได้ด้วย 0.9 (ลดลงอีก 10%) ก่อนปัดและก่อนเพดานขั้นต่ำ 6 ชั่วโมง ค่าเท่ากับ 85% ไม่ลด เพื่อไม่ให้ขอบเขตกำกวม บันทึกสูตรนี้ใน `src/domain/shelfLife.ts` และตัวอย่างใน `phase2Samples`

## D015 — ประเมินความสุกจากภาพผ่าน OpenAI-compatible vision API

ใช้ตัวแปร `AI_VISION_BASE_URL` / `AI_VISION_API_KEY` / `AI_VISION_MODEL` (ค่าใน `.env.example` ว่าง; ถ้าไม่ใส่ base/model จะใช้ค่าเริ่มต้นของแผน) เรียก `POST {base}/chat/completions` ส่งรูปเป็น data URI ไม่ผูกกับผู้ให้บริการรายใดรายหนึ่ง ใส่ `User-Agent: agri-rescue/0.1` และ `x-opencode-session` ทุกครั้ง (โฮสต์ OpenAI-compatible ทั่วไปมักเพิกเฉย ส่วน OpenCode Go ใช้เพื่อ routing)

`POST /lots/assess-photo` จำกัด jpeg/png ≤ 5MB timeout 20 วินาที ส่ง `response_format` แบบ json_schema และ `thinking: { type: "disabled" }` ถ้าได้ 400 เพราะไม่รองรับพารามิเตอร์ ให้ retry ครั้งเดียวโดยตัดพารามิเตอร์นั้นออก แล้วดึง JSON จากคำตอบ (รองรับ code fence) validate ด้วย zod ฟิลด์ `subject_match` บอกว่าในรูปมีพืชที่เลือกชัดเจนหรือไม่ ถ้าเป็น false ตอบ `{ available: true, subject_match: false }` โดยไม่ส่ง ripeness ถ้าไม่มี key / timeout / error / parse ไม่ได้ ตอบ `{ available: false, reason }` ความมั่นใจต่ำกว่า 0.6 ตอบพร้อม `low_confidence: true`

ตอนสร้างล็อต ถ้ามีค่า AI และเกษตรกรใช้ความสุกเดียวกับ AI → `quality_assessments.method = model` ถ้าแก้ค่า → `method = rule` แต่ยังเก็บ `ai_ripeness` / `ai_confidence` / `ai_model` (migration `003_ai_assessment.sql`) เทส mock ทุกกรณีห้ามยิง API จริง สคริปต์ `npm run ai:smoke` ไว้ทดสอบมือกับ API จริง

## D005 — เซิร์ฟเวอร์ใช้ CommonJS

`tsconfig` ตั้ง `module` เป็น `commonjs` เพื่อให้ Express, Jest และ ts-jest ทำงานร่วมกันโดยไม่ตั้งค่า ESM เพิ่ม

## D016 — LocationPicker และ geo API

หน้าสมัครและหน้าเพิ่มแปลงใช้ `LocationPicker` ร่วมกัน ไม่ใส่พิกัดเริ่มต้น 13.65/100.62 ต้องมีพิกัดก่อนส่ง ลิงก์ Google Maps แบบเต็มแยกพิกัดในแอป ลิงก์สั้น `maps.app.goo.gl` / `goo.gl/maps` ไปที่ `POST /api/geo/resolve-link` (ตาม redirect แบบ `manual` สูงสุด 5 ทอด ตรวจ allowlist ทุกทอด ห้าม IP/localhost ภายใน 5 วินาที) ชื่อสถานที่จาก `GET /api/geo/reverse` เรียก Nominatim ด้วย User-Agent ของแอป แคช 24 ชม. และไม่เกิน 1 request/วินาที ถ้าเรียกไม่ได้แสดงพิกัดตัวเลข พิกัดนอกกรอบไทยคร่าว ๆ (lat 5–21, lng 97–106) เตือนแต่ไม่บล็อก `/api/geo/*` จำกัด 20 requests/นาทีต่อ IP ด้วย `express-rate-limit` ตอบ 429 ภาษาไทย

## D017 — ข้อความ 401 ของ mobile client

`mobile/src/api/client.ts` บังคับ logout และข้อความ «เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่» **เฉพาะเมื่อส่ง Bearer token ไปแล้วได้ 401** (เซสชันจริงหมดอายุ) ถ้าเรียกโดยไม่มี token (เช่น `POST /api/auth/login` ที่เบอร์/รหัสผิด ซึ่งเซิร์ฟเวอร์ตอบ 401 พร้อม «เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง») ให้ parse body แล้วแสดงข้อความจากเซิร์ฟเวอร์ตามปกติ ไม่มี unit test ฝั่ง mobile ใน repo นี้ จึงบันทึกพฤติกรรมไว้ที่นี่

## D018 — Phase 6.1 บัญชีหลายบทบาท

Migration `004_multi_role.sql` เพิ่ม `users.can_sell` / `can_buy` / `is_admin` / `line_id` และตาราง `buyer_profiles(user_id, buyer_type, charity_approved)` แล้วย้าย `users.buyer_type` ออก คอลัมน์ `users.role` **ยังเก็บไว้** เพื่อให้เส้นทางคนขับ/รอบวิ่ง (`WHERE role = 'driver'`) และการล็อก OTP ทำงานต่อได้โดยไม่ต้องมี `can_drive`

JWT เก็บ `sub`, `role`, `can_sell`, `can_buy`, `is_admin` (อายุ 7 วันเหมือนเดิม) middleware ใหม่คือ `requireCapability('sell' | 'buy' | 'admin')` ใช้กับ plots/lots/market/orders และงานผู้ดูแล (สร้างรอบ, ปลด OTP, อนุมัติ charity) `requireRole('driver')` เหลือเฉพาะยืนยันจุดของคนขับ

สมัครด้วย `can_sell` / `can_buy` (อย่างน้อยหนึ่งอย่าง) ประเภทสงเคราะห์ตั้ง `charity_approved = 0` จนกว่า `POST /api/auth/admin/approve-charity/:userId` ผู้ใช้เปิดบทบาทอีกฝั่งได้ที่ `PATCH /api/auth/profile` แอปเก็บโหมดขาย/ซื้อใน storage แล้วสลับที่ TopBar หน้าคนขับ/ผู้ประสานยังอยู่ใน repo แต่ AuthGate ไม่ส่งผู้ใช้ไปหน้าเหล่านั้น

## D019 — Phase 6.1b เพดานและเกณฑ์ผู้รับบริจาค

ค่าใน `server/src/domain/donorRules.ts` (`DONOR_CONFIG`):

| รายการ | ค่า |
|---|---|
| เพดาน `volunteer` | 10 กก./สัปดาห์ (สัปดาห์เริ่มวันจันทร์ 00:00 เวลาไทย) |
| เพดาน `trusted_volunteer` | 30 กก./สัปดาห์ |
| เพดาน `verified_org` | `beneficiary_count × 0.5` กก./สัปดาห์ |
| เลื่อนเป็น trusted | รูปยืนยัน `subject_match = true` ครบ 5 ครั้ง |
| ระงับสิทธิ์ | infractions 3 ครั้งใน 60 วัน (พลาดกำหนด 48 ชม. หรือ subject_match = false) |
| เอกสารองค์กร | pdf/jpg/png ไม่เกิน 5MB ต่อไฟล์ สูงสุด 10 ไฟล์ ใน `server/private_uploads/` ดาวน์โหลดเฉพาะ admin |
| สถานะคำขอองค์กร | `pending → approved \| rejected \| needs_more_info`; `needs_more_info → pending` เมื่อ resubmit; เหตุผลบังคับเมื่อ reject/needs_more_info; ประวัติใน `org_review_logs` |
| `donation_audience` เริ่มต้น | `verified_org_only` |

บัญชี charity ที่อนุมัติแล้ว migration เป็น `verified_org` พร้อม `beneficiary_count` สำรอง 100 ถ้าไม่มีค่า

ผู้สมัครองค์กรที่ยัง `pending` / `needs_more_info` / `rejected` ไม่มีสิทธิ์ขอรับบริจาค (แม้เคยเป็นจิตอาสา) — ตรวจแล้วใน DB ว่าจองล็อต `verified_org_only` ตอนรออนุมัติถูกบันทึกเป็นซื้อปกติ (`is_donation=0`) ไม่ใช่บริจาค; UI จึงแยกปุ่มซื้อ/ขอรับชัดเจน

## D020 — Phase 6.1c ราคาอ้างอิงและโหมดขาย

ค่าใน `server/src/domain/sellerPricing.ts` (`PRICING_CONFIG`) และแหล่ง MOC:

| รายการ | ค่า |
|---|---|
| API สินค้า | `GET https://dataapi.moc.go.th/gis-products` |
| API ราคา | `GET https://dataapi.moc.go.th/gis-product-prices?product_id=&from_date=&to_date=` (พหูพจน์; เอกพจน์ 404) |
| ราคาวัน | ค่ากลาง `(price_min + price_max) / 2` ของวันล่าสุดใน `price_list` |
| รหัสขายส่ง/ปลีก | `W…` = ขายส่ง, `P…` = ขายปลีก; ราคาตลาดใช้ขายส่ง |
| อายุอ้างอิงสูงสุด | 7 วัน แล้วค่อย fallback `crops.market_price_per_kg` (ป้ายราคาประมาณ) |
| หน่วยนอก กก. | เก็บ `dit_unit`; ใช้ได้เมื่อ admin ใส่ `dit_unit_to_kg` เท่านั้น (ห้ามเดา) |
| ตัวคูณเกรดตก | start = ตลาด × 0.7 |
| floor แนะนำ | 30% ของ start |
| floor ขั้นต่ำ | ≥ 20% ของราคาตลาด; ต่ำกว่านี้แนะนำโหมดบริจาค |
| สูตรราคาล็อต | `max(floor, round(start × (0.3 + 0.7 × freshness)))` |
| เปิดบริจาค sell_then_donate | เมื่อเหลือ &lt; 12 ชม. (job 10 นาที) |
| มัธยฐานใกล้เคียง | รัศมี 15 กม. และ ≥ 3 ล็อตพืชเดียวกัน |

`crop_reference_prices` เก็บ `product_code`, `unit`, `source_url`, `date`, `wholesale_price` เพื่อตรวจย้อนได้

## D021 — Phase 6.1e การแบ่งขายล็อต

| รายการ | ค่า |
|---|---|
| `split_allowed` ดีฟอลต์ | true (แบ่งขายได้) |
| `min_order_kg` / `order_step_kg` ดีฟอลต์ | 1 |
| คงเหลือ | `weight_kg − Σ quantity_kg` ของออเดอร์สถานะไม่ใช่ `cancelled` |
| สถานะจอง | `open` / `partially_reserved` / `fully_reserved` (migrate `reserved` เดิม → `fully_reserved`) |
| เศษท้าย | ถ้าคงเหลือ &lt; `min_order_kg` ต้องจองทั้งเศษ (ข้ามขั้นต่ำ/step) |
| แก้ migration ที่ชนเลข | ตาม Conventions: ห้ามเปลี่ยนไฟล์ที่อยู่บน main แล้ว; ตอนรวม 6.1c+6.1d เลข 6.1c เป็น 008–010 หลัง `007_donor_formal_apply` |

## D022 — Phase 6.1f โครงนำทาง

| รายการ | ค่า |
|---|---|
| แท็บหลัก | ตลาด / ขาย / คำสั่งซื้อ / แจ้งเตือน / บัญชี (`expo-router` Tabs) |
| ไอคอน | `@expo/vector-icons` (Ionicons) |
| Side nav breakpoint | ความกว้าง ≥ **900px** ใช้เมนูซ้าย; แคบกว่าใช้ bottom tabs; ไม่ใช้ hamburger |
| AuthGate | ไม่ login เข้า `(tabs)/*` ได้; ไม่บังคับ redirect ตามโหมดขาย/ซื้อ; หน้าที่ต้องสิทธิ์ใช้ `LoginPrompt` + `/login?returnTo=` |
| เลิก mode toggle | ไม่แสดงสลับโหมดบน TopBar ของแท็บ (capabilities จัดการที่บัญชี/โปรไฟล์) |
| การจอง | `/lots/:id` → `/lots/:id/confirm` → `/lots/:id/success`; คำสั่งซื้อ `/orders/:id` |
| `available_as` | response ที่ไม่ใช่เจ้าของล็อต: `['buy']` / `['donate']` / `['buy','donate']` ตามสถานะปัจจุบัน; ห้ามคืน `sale_mode` ดิบ; `sell_then_donate` ก่อนเปิดบริจาค = เหมือนขาย (`['buy']` เท่านั้น) |
| พื้นที่รับของ | แสดง `location_label` (ตำบล · อำเภอ ตาม D033) + ระยะทาง; พิกัดเฉพาะเจ้าของออเดอร์/เจ้าของล็อต |
| OTP ผู้ขาย | เดโม: `POST /api/orders/:id/seller-confirm` (OTP+น้ำหนัก → delivered+impact); flow เต็ม 6.4 ยังจะขยายภายหลัง |
| ปุ่ม UI | `paddingHorizontal ≥ 20`, `minWidth ≥ 160`; หน้าว่าง/ชวน login/สำเร็จ ใช้ `CtaStack` ให้ปุ่มกว้างเท่ากันเรียงแนวตั้ง; ข้อความปุ่มมี `textAlign: center` + padding กันชนขอบ |
| ตกแต่งภาพ | เลื่อนไปขั้น **6.12** (หลัง 6.10) |

## D023 — Demo-prep: แดชบอร์ด Soft-delete และยืนยันรับที่ฟาร์ม

| รายการ | ค่า |
|---|---|
| Soft-delete | `harvest_lots.deleted_at` + `lot_delete_logs.snapshot_json`; ลบได้เมื่อสถานะ `open`/`partially_reserved` และไม่มีออเดอร์ที่ `status <> 'cancelled'` |
| รายการของฉัน / ตลาด | ซ่อนล็อตที่ `deleted_at IS NOT NULL` จาก `/lots/mine` และตลาด; impact ที่ส่งมอบแล้วคงไว้ |
| Dashboard | `GET /api/dashboard` — admin เห็นทั้งระบบ; `can_sell` เห็นเฉพาะล็อตของตน; buyer-only ได้ 403 |
| Seller confirm | `POST /api/orders/:id/seller-confirm` — OTP + น้ำหนัก; ออเดอร์ `reserved` → `delivered` โดยไม่ผ่าน batch (เดโมรับที่ฟาร์ม); ไม่มีคอลัมน์ `weight_flag` บน orders จึงใช้น้ำหนักเข้า `impact_logs` อย่างเดียว |
| seed:demo | เติมประวัติ ~14 วัน (marker `photo_url = 'seed:demo'`); รันซ้ำแล้วลบแถว marker ก่อน; ต้อง `migrate`+`seed` ก่อน; ล็อตเปิดจาก seed ปกติยังอยู่สำหรับเดโมสด |
| Listen | API ฟังที่ `0.0.0.0` เพื่อให้มือถือในเครือข่ายเดียวกันเรียกได้ |

## D024 — Phase 6.2 ตลาดสาธารณะ + รูปล็อต

| รายการ | ค่า |
|---|---|
| Endpoints | `GET /api/public/market`, `GET /api/public/lots/:id` — ไม่ต้อง token (Bearer เสริมได้) |
| Rate limit | `GET /api/public/*` 60 ครั้ง/นาที/IP ด้วย in-memory store (process-local; รีสตาร์ทแล้วรีเซ็ต) |
| ระยะทาง | ปัดเป็นขั้น 0.5 กม. (`Math.round(km * 2) / 2`); มี lat/lng → กรองรัศมี; ไม่มี → `distance_km = null` (เรียง urgent/cheap ได้; `sort=near` ถอยเป็น urgent) |
| พื้นที่แปลง | คืน `plot_name` / `location_label` (ต./อ. ตาม D033); **ห้าม** คืน lat/lng ของแปลงใน public API |
| ชื่ออังกฤษ | จาก `crops.name_en` (migration `014_crop_name_en`; ดู D025) |
| รูปล็อต | ตาราง `lot_photos` (migration `015_lot_photos`) + ไฟล์ใน `server/uploads/` เสิร์ฟที่ `/uploads/...`; รูปจาก `POST /api/lots/assess-photo` (subject_match) บันทึกอัตโนมัติแล้วส่ง `photo_url` กลับ; ตอนสร้าง/แก้ล็อตถ้ามี `photo_url` จะ insert `lot_photos` และคง `harvest_lots.photo_url` เป็นรูปหลัก |
| ขนาดรูป | ฝั่งแอปย่อด้วย `expo-image-manipulator` (ขอบยาว ≤1024, jpeg compress 0.8); เซิร์ฟเวอร์บังคับ ≤ 1MB หลัง decode (jpeg/webp/png) |
| `available_as` | เหมือนตลาดล็อกอิน (D022); ไม่คืน `sale_mode` / `donation_opened` / ชื่อผู้ขาย / ติดต่อ |
| Bearer เสริม | ถ้ามี token จะเติม `donation_audience`, `can_request_donation`, `reason` สำหรับสิทธิ์รับบริจาค — ไม่เปิดเผยแผน `sell_then_donate` |
| แอป | guest ใช้ `/api/public/*`; login แล้วใช้ `/api/market/*` ตามเดิม |

## D025 — สองภาษา TH/EN (แอป)

| รายการ | ค่า |
|---|---|
| กลไก | `I18nProvider` + `mobile/src/i18n/{th,en}.ts`; เก็บ locale ใน SecureStore/localStorage (`agri_rescue_locale`) |
| สลับภาษา | แท็บบัญชี (รวมตอนยังไม่ login) — ชิป ไทย / English |
| ครอบคลุม | แคตตาล็อก `Messages` + ผูกทุกหน้าจอหลัก; helper `formatNumber/Date/cropName/translateError/translateFieldError`; server message → code map; `scripts/check-no-thai-ui.mjs` + key-parity test |
| ความสุกตอนลงล็อต | สร้างล็อตใหม่ไม่เลือกความสุกล่วงหน้า; ปุ่มลงประกาศ disabled จนกว่ามีค่า; กล่องประเมินชวนถ่ายรูป/เลือก; แสดงที่มาความสุก + พยากรณ์อากาศ; แก้ล็อตใช้ค่าเดิม |
| `crops.name_en` | migration `014_crop_name_en.sql`; seed 5 พืชมี `nameEn`; API คืน `name_en` / `crop_name_en` จาก DB (crops, market, public market, my lots, orders, dashboard `by_crop`) |
| AI assess-photo | `defects` + `note_th` (ไทย) คู่กับ `defects_en` + `note_en` (อังกฤษ) ในสคีมา/prompt/response |

## D026 — UI PR A: shell, market, profile, login

| รายการ | ค่า |
|---|---|
| Design tokens | ค่าใน `docs/UI_PLAN.md` ย้ายเข้า `mobile/src/theme.ts` (bg/surface/line/ink/leaf/urgent/soon/ok/danger) |
| ฟอนต์ | `@expo-google-fonts/anuphan` + `@expo-google-fonts/ibm-plex-sans-thai` โหลดใน root layout; ถ้าโหลดไม่ได้ fallback system |
| ไอคอนใหม่ | `@expo/vector-icons` **Feather** เส้น; หน้าเดิมที่ยังไม่ redesign คง Ionicons ไว้จนถึง 6.12 |
| แท็บ | เหลือ 4 (ตลาด/ขาย/คำสั่งซื้อ/แจ้งเตือน); บัญชีเป็นเมนูโปรไฟล์มุมขวาบน → `/profile`; route `/(tabs)/account` ยังอยู่แต่ซ่อน (`href: null`) และลิงก์ทั้งระบบชี้ `/profile` |
| `users.email` | migration `016_users_email.sql` unique NULL; login รับ `phone` ฟิลด์เดียวเป็นเบอร์ **หรือ** อีเมล (`WHERE phone = ? OR email = ?`); profile อัปเดต email/line_id |
| `crop_categories` | migration `017_crop_categories.sql` แบบย่อ 5 หมวด (ผลไม้/ผักใบ/ผักผล/สมุนไพร/หัว-ราก) ผูก `crops.category_id` — **ไม่ใช่** catalog เต็มของ 6.3 (ยังไม่มี parcel/storage/pending) |
| Public market filters | เพิ่ม `category_id`, `price_min`, `price_max`, `max_hours` ต่อจาก `crop_id`/`sort`/`radius_km` ของ 6.2 |
| รูปล็อต | ของ 6.2 แล้ว (migration 015) — PR A ใช้เฉพาะ UI การ์ด/placeholder |
| ชื่อร้านบนการ์ด | แสดง `shop_name` + `location_label` (D033) ตาม D022 |
| ปุ่ม PR B/C ในเมนู | ร้านที่ติดตาม / ติดต่อเรา แสดงแล้ว (PR B/C merge) |
| Login mockup | ยังไม่มีปุ่ม LINE Login (PR D) และ "ลืมรหัสผ่าน" แสดงเป็นข้อความ disabled |

## D027 — UI PR B: ร้านค้า · ติดตาม · แจ้งเตือนในแอป

| รายการ | ค่า |
|---|---|
| `shops` / `shop_follows` | migration `018_shops.sql`; ไม่มี FK; PK `shops.user_id` = เจ้าของ; `shop_follows(user_id, shop_id)` unique PK คู่ |
| สร้างร้าน | อัตโนมัติเมื่อ register/open `can_sell` และตอนสร้างล็อต; ชื่อเริ่มต้น = ชื่อผู้ใช้ แก้ที่ `PATCH /api/shops/mine` |
| Public shop | `GET /api/shops/:userId` คืนชื่อร้าน/คำอธิบาย/สถิติจริง (ส่งมอบ, ผู้ติดตาม, กก.) ชื่อแปลง · ระยะ (ถ้ามี lat/lng query) พืชขายบ่อย; **ไม่คืน** ตำแหน่ง/เบอร์/phone |
| ตำบล/อำเภอ | ยังไม่มีใน `plots` (D022) — ใช้ `plot_name` แทน |
| ค้นหาตลาด | `GET /api/public/market?q=` จับคู่ crop หรือ `shop_name` |
| การ์ดตลาด | คืน `shop_name` + `farmer_id`; ไม่คืน `farmer_name` |
| `notifications` | migration `019_notifications.sql`; เก็บ `title_key` + `params_json` + `link`; อ่านเฉพาะ `user_id` ของตน |
| เหตุการณ์ PR B | `shop_new_lot` (ผู้ติดตาม), `lot_booked` (ผู้ขาย), `order_delivered` (ผู้ซื้อ), `donor_review` (อนุมัติ/ปฏิเสธ/ขอเพิ่ม), `donor_proof_due` (หลังยืนยันรับบริจาค); `support_reply` เตรียมไว้สำหรับ PR C |
| push | ยังไม่ทำ — เฉพาะ in-app + badge แท็บ |
| ชื่อฟอนต์ข้อความ | แคตตาล็อก `t.notif.*` ใช้ template `{param}` จาก `params_json` |
| เมนู | เพิ่ม «ร้านที่ติดตาม» → `/followed-shops` |

## D028 — UI PR C: ติดต่อเรา (support tickets)

| รายการ | ค่า |
|---|---|
| ตาราง | migration `020_support_tickets.sql` — `support_tickets` / `support_messages` / `support_attachments` (ไม่มี FK) |
| หัวข้อ | `order_pickup` · `item_mismatch` · `account_login` · `donation` · `other` (label จาก server เป็น fallback; UI ไทย/อังกฤษจาก i18n) |
| สถานะ | `open → in_progress → closed` — admin เท่านั้นแก้สถานะ; user ตอบได้จนกว่าปิด |
| รูปแนบ | ≤ 3 รูป JPEG/PNG/WebP ≤ 1MB ต่อรูป ใน `private_uploads/` ดาวน์โหลดเฉพาะ owner/admin ที่ `GET /api/support/tickets/:id/attachments/:attachmentId` |
| Rate limit | สร้างเรื่อง **5 เรื่อง/ชม./ผู้ใช้** (`supportCreateRateLimit`) |
| แจ้งเตือน | ฝั่ง admin ตอบ → `notifications` type `support_reply` + link `/support/:id` |
| ยังไม่ทำ | ปุ่มยกเลิกออเดอร์จากหน้านี้, สถิติผู้ซื้อ/ผู้ขาย (ตาม UI_PLAN) |
| เมนู | เพิ่ม «ติดต่อเรา» → `/contact-us`; admin มีแท็บ «ติดต่อเรา» ใน `/admin` |
| กล่องเตือน OTP | ข้อความเตือนบนหน้า `contact-us` ไม่ให้ OTP เมื่อของไม่ตรงตามรูป |

## D029 — ปรับหน้าตลาดตามทดสอบ iPhone Air

| รายการ | ค่า |
|---|---|
| Safe area | หน้าตลาดใช้ `Screen skipTopSafeArea` + `AppHeader` `paddingTop = insets.top + 4` — ไม่ซ้อน inset |
| พื้นหลัง header | `C.bg` ตรงกับหน้าจอ |
| Guest | ไม่มีปุ่ม Log in บน header; เหลือแถบชวน login แถวเดียว (ปุ่มขนาดปกติ) |
| Badge ตัวกรอง | นับเฉพาะ category / ราคา / เวลาที่เหลือ / **รัศมีที่เปลี่ยนจากค่าเริ่มต้น**; **ไม่นับ sort**; 0 = ซ่อนตัวเลข |
| Placeholder | `ค้นหาพืช หรือชื่อร้าน` / `Search crops or shops` |
| Location denied | ไม่บังคับ LocationPicker; แสดงล็อตทั้งหมดเรียง `urgent` (เวลาที่เหลือ) |
| seed | ล็อต `open` คำนวณ `expires_at` จาก **now + hoursLeft**; ถ้ามีอยู่แล้วแต่หมดอายุจะ refresh; แปลงอยู่รัศมี demo 13.63–13.67 / 100.60–100.63 |
| seed:demo | live lot `openExpires = now + 3 วัน` ที่แปลงลุงสมชาย |

## D030 — Pre-demo audit: ซ่อนปุ่มที่ยังไม่มีฟีเจอร์

| รายการ | ค่า |
|---|---|
| เหตุผล | ห้ามโชว์ปุ่มที่กดแล้วไม่เกิดอะไรตอนเดโม |
| ซ่อน | รูปโปรไฟล์เปลี่ยนรูป (ไม่มี upload), ปุ่มแนบรูปใน contact-us (ยังไม่มี picker), ข้อความ “ลืมรหัสผ่าน?” (ไม่มี flow) — **การ์ดตำแหน่งรับของกลับมาแล้วใน D033** |
| เมนู | «แดชบอร์ด» แสดงเฉพาะ `can_sell` หรือ `is_admin`; «ร้านของฉัน» ไป `/shops/:id` |
| ตลาด | ไม่ให้สิทธิ์ตำแหน่ง → ไม่บังคับ LocationPicker, เรียง urgent |
| seed | `expires_at = now + hoursLeft`; refresh ล็อต open ที่หมดอายุ |
| DEMO_SCRIPT | อัปเดตเป็น 4 แท็บ + เมนูโปรไฟล์ (ไม่มีแท็บบัญชี) |


## D031 — Phone/email identity fields

| รายการ | ค่า |
|---|---|
| Toggle | ปุ่ม «เบอร์โทร \| อีเมล» จำใน `agri_rescue_identity_mode` — **ใช้เฉพาะหน้า login** (ค่าเริ่มต้นเบอร์โทร) |
| หน้าสมัคร | **บังคับเบอร์โทร** เสมอ (ฟอร์แมต `0XX-XXX-XXXX`) + ช่องอีเมลแยก **ไม่บังคับ** พร้อมชิปโดเมน; **ไม่มี** ปุ่มสลับ |
| เบอร์ UI | แป้นเลข, ฟอร์맷 `0XX-XXX-XXXX`, paste `+66`/ขีด/ช่องว่าง → `0XXXXXXXXX`, ส่งเป็น digits, ตรวจน้ำแดง 10 หลักขึ้นต้น 0 |
| โค้ด | `mobile/src/lib/phoneEmail.ts` + unit test; `PhoneEmailField` รับ `mode: toggle \| phone \| email` |
| Server | `normalizePhone`; **register บังคับ `phone` ด้วย zod** (`fields.phone` เมื่อผิด); login ค้น raw หรือ normalized หรือ email |
| `users.phone` | migration `021_users_phone_nullable` **ไม่แก้** หลัง push (แม้สมัครจะบังคับเบอร์แล้ว — คงไว้เพื่อ compatibility) |
| อีเมล | ไม่ autocapitalize/autocorrect; ชิปโดเมน; ข้อเสนอพิมพ์ผิด ไม่บังคับ; trim+lowercase ก่อนส่ง |
| หน้าจอ | login (toggle), register (phone+email แยก, ไม่สลับ), profile (phone ฟอร์แมต read-only + email chips) |
| i18n | `identity.*` th/en (รวม `optional` สำหรับป้ายอีเมลสมัคร) |
| Test | สมัครไม่มีเบอร์ → 400 พร้อม `error.fields.phone` |


## D032 — Admin Console + segregation of duties

| รายการ | ค่า |
|---|---|
| เหตุผล | แบ่งแยกหน้าที่ (segregation of duties): `is_admin` แยกจาก `can_sell`/`can_buy` |
| Server | `PATCH /auth/profile` ปฏิเสธ admin เปิดขาย/ซื้อ (403); seed `can_sell=0, can_buy=0` เมื่อ `is_admin` |
| Migration | `022_admin_console.sql` — แก้ผู้ใช้เดิมให้ admin ไม่ขาย/ซื้อ, ชื่อ `0800000005` = `admin`, คำขอ individual ค้าง → volunteer approved |
| หน้าเข้าสู่ระบบแล้ว | admin → `/admin` ทันที (ไม่ใช่ marketplace tabs); ซ่อนแท็บขาย/คำสั่งซื้อเมื่อเป็น admin |
| Shell | 4 แท็บ: ภาพรวม · ตลาด · งานรอจัดการ (badge) · ข้อมูลระบบ; หัว light + เมนู ภาษา/ออกจากระบบ |
| Overview API | `GET /api/admin/overview` — คำนวณจาก DB จริง (ผู้ใช้/ล็อต/impact/คิว/สุขภาพ/กราฟ) + test |
| ตลาดแอดมิน | `GET /api/admin/lots`, `POST hide/unhide` + log เหตุผล |
| งานรอจัดการ | `GET /api/admin/inbox` — org/support/weight/otp/proof รวม badge |
| ข้อมูลระบบ | DIT เดิม + `GET /api/admin/users` อ่านอย่างเดียว + คิว OTP/weight |
| Org queue | แสดงเฉพาะ `application_kind = organization` |
| Checklist | checkbox จริง (ไม่ใช่ Chip) |
| i18n | `admin.tabOverview` ฯลฯ th/en |


## D033 — ตำแหน่งรับของ + ป้ายตำบล/อำเภอ

| รายการ | ค่า |
|---|---|
| เหตุผล | `PATCH /auth/profile` เดิมไม่บันทึก `lat/lng` — การ์ดตำแหน่งรับของในโปรไฟล์ถูกซ่อนไว้ (D030) |
| Server | `PATCH /auth/profile` รับ `lat`+`lng` เป็นคู่; reverse-geocode เก็บ `users.subdistrict_th`/`district_th`; ถ้า `can_sell` อัปเดต `plots` ของผู้ใช้คนนั้นด้วยค่าเดียวกัน |
| สร้างแปลง | `POST /api/plots` reverse-geocode เก็บป้ายตำบล/อำเภอของแปลง |
| Migration | `023_location_labels.sql` — เพิ่ม `subdistrict_th`/`district_th` บน `plots` และ `users` |
| แสดงผล | `location_label` = ตำบล · อำเภอ ถ้ามี ไม่งั้น `plot_name`; ใช้บนการ์ดตลาด, หน้าล็อต, หน้าร้าน |
| ข้อมูลเก่า | `npm run backfill:location-labels` (ครั้งเดียว/รันซ้ำได้) เติมป้ายจาก lat/lng ที่มีอยู่ |
| Reverse geocode | Nominatim `addressdetails=1` คีย์ `suburb`/`village`/… → ตำบล, `city_district`/`county`/… → อำเภอ |


## D034 — 6.7 ปุ่มติดต่อหลัง “จองแล้ว”

| รายการ | ค่า |
|---|---|
| เหตุผล | แผนเขียน “หลังชำระเงิน” แต่ยังไม่มีขั้น 6.5 — ใช้เงื่อนไข **จองแล้ว** (`status ≠ cancelled`) แทน |
| API | `GET /api/orders/:id` คืน `contact: { name, phone, line_id }` ของอีกฝ่าย **เฉพาะเมื่อสั่งซื้อนี้มีอยู่จริงและไม่ถูกยกเลิก**; ก่อนจองไม่มี order อยู่แล้ว และ market/public **ห้าม** คืนเบอร์/LINE อยู่แล้ว |
| UI | หน้ารายละเอียดคำสั่งซื้อฝั่งผู้ซื้อ/ผู้ขาย: ปุ่ม `tel:` และ LINE (`https://line.me/ti/p/~{line_id}`) ถ้ามี `line_id` |
| บริจาค | เงื่อนไขเดียวกับขาย (จองแล้ว) — ยังไม่แยก “ยืนยันนัดรับ” เพราะยังไม่มี flow นั้น |
| Test | order detail หลังจองมี `contact`; cancelled → `contact: null`; raw market ไม่มี `"phone"` |

## D035 — 6.4 แบบย่อ: ช่วงนัดรับ + เส้นทางผู้ซื้อ

| รายการ | ค่า |
|---|---|
| ช่วงเวลา | วันนี้/พรุ่งนี้ (ปฏิทินกรุงเทพ UTC+7) × 08–10, 10–12, 13–15, 15–17 |
| กฎหมดอายุ | `pickup_slot_end + 2 ชม. ≤ expires_at` |
| ช่วงที่ใช้ไม่ได้ | `started` / `past` / `too_close_to_expiry` แสดงเหตุผลใน UI |
| เคารพนัด | ถ้า NN+2-opt ทำให้ลำดับเวลานัดย้อนลง ให้เรียงตาม `pickup_slot_start` แล้วบอกในหน้าว่า “เรียงตามเวลากำหนด” |
| ระยะ | เส้นทางรวม (กลับบ้าน) เทียบกับ ไปทีละแปลงกลับบ้าน |
| ไม่ทำ | parcel, batches คนขับ, แผนที่ในแอป |
| seed:demo | 4 ล็อต reserved ของผู้ซื้อเดโมคนแรก ช่วงนัดคนละเวลาในวันเดียวกัน (ถ้าวันนี้เต็มจะใช้พรุ่งนี้) |

## D036 — EN system i18n (crops, locations, notifications, dates)

| รายการ | ค่า |
|---|---|
| ชื่อพืช | ใช้ helper `cropName(crop, locale)` ทุกหน้า; API คืน `name_th` + `name_en` |
| หมวดพืช | `crop_categories.name_en` (มีจาก 017) ผ่าน `cropName` |
| ตำบล/อำเภอ EN | migration `025_location_labels_en.sql` — `subdistrict_en`/`district_en` บน plots/users; Nominatim เรียกสองรอบ (`th` + `accept-language=en`); `locationDisplayLabelFor(locale, …)` |
| ข้อมูลเก่า | `npm run backfill:location-labels` เติมทั้ง TH/EN |
| แจ้งเตือน | params ใหม่เกิด `crop_id`/`crop_name_th`/`crop_name_en`; ฝั่ง client แปลงด้วย `cropName` (ข้อมูลเก่า `params.crop` ยังแสดงได้) |
| วันที่ EN | `en-GB` ปี ค.ศ. + เดือนอังกฤษ; TH ใช้ `th-TH` (พ.ศ.) |
| Client lang | `Accept-Language` จาก locale แอป (`setApiLang`) |
| Scan | `npm run check:en-api` เรียก API ด้วย `lang=en` แล้ว fail ถ้ามีไทยใน field ระบบ |
| seed ชื่อ | ร้าน/แปลง/ผู้ใช้สองภาษา เช่น `Somchai Farm (สวนลุงสมชาย)` — ข้อความที่ผู้ใช้พิมพ์เองไม่บังคับแปล |
| ไม่ทำ | แปลชื่อร้าน/แปลง/ข้อความ support ที่ผู้ใช้กรอกเอง |

## D037 — งานเล็กก่อนเดโม (6.9 + รูป)

| รายการ | ค่า |
|---|---|
| 6.9 tips | `crops.storage_tip_th/en`, `fridge_ok`, `fridge_extra_days` (migration 026); คำนวณใน `server/src/domain/storageAdvice.ts` + unit test; ข้อความจาก i18n ไม่ใช่ AI |
| แสดงผล | หน้า `/orders/:id` เมื่อ `status=delivered`: ควรทาน/ขาย/แจก ภายใน `expires_at`; แช่เย็นยืด `+fridge_extra_days`; รถเร่/ร้าน ลดราคาเมื่อ &lt;12 ชม. |
| แหล่ง | `docs/crop-sources.md` (ค่าประมาณ สำหรับเดโม/ให้ความรู้) |
| รูปโปรไฟล์ | `users.avatar` (migration 027); `POST /api/auth/avatar` ย่อ ≤512px ฝั่ง client; เก็บ `uploads/avatars/` แบบเดียวกับรูปล็อต; sync `shops.avatar`; แสดงบน ProfileMenu, profile, หน้าร้าน (fallback ปก) |
| รูปติดต่อเรา | เปิด UI แนบ ≤3 รูป (backend มีอยู่แล้ว): `private_uploads/` เห็นเฉพาะ owner/admin |
| ไม่ทำ | หน้า “ของที่ได้รับ” แยก — tips อยู่ใน order detail |

