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
| coordinator | ผู้ประสานตัวอย่าง | 0800000005 |
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
