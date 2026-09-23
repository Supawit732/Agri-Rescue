# พจนานุกรมข้อมูล (Data Dictionary)

แหล่งที่มา: `server/src/db/migrations/001_init.sql`, `002_otp_attempts.sql`  
ตัวอย่างค่าอ้างจาก `seedData.ts` และพฤติกรรม API จริง

## users

| คอลัมน์ | ชนิด | NULL ได้ | คีย์ | คำอธิบาย | ตัวอย่าง |
|---|---|---|---|---|---|
| id | INT AUTO_INCREMENT | ไม่ | PK | รหัสผู้ใช้ | 1 |
| name | VARCHAR(255) | ไม่ | | ชื่อที่แสดง | ลุงสมชาย |
| phone | VARCHAR(32) | ไม่ | UNIQUE `uq_users_phone` | เบอร์โทรใช้ login | 0800000001 |
| password_hash | VARCHAR(255) | ไม่ | | แฮช bcrypt | `$2a$10$...` |
| role | ENUM('farmer','buyer','driver','coordinator') | ไม่ | | บทบาท | farmer |
| buyer_type | ENUM('vendor','shop','charity') | ได้ | | ประเภทผู้ซื้อ ว่างถ้าไม่ใช่ buyer | vendor |
| lat | DOUBLE | ได้ | | ละติจูด (ผู้ซื้อใช้หาระยะ) | 13.662 |
| lng | DOUBLE | ได้ | | ลองจิจูด | 100.611 |
| created_at | DATETIME | ไม่ | | เวลาสร้าง ดีฟอลต์ CURRENT_TIMESTAMP | 2026-09-22 02:00:00 |

## crops

| คอลัมน์ | ชนิด | NULL ได้ | คีย์ | คำอธิบาย | ตัวอย่าง |
|---|---|---|---|---|---|
| id | INT AUTO_INCREMENT | ไม่ | PK | รหัสพืช | 1 |
| name_th | VARCHAR(255) | ไม่ | | ชื่อภาษาไทย | มะม่วง |
| base_shelf_days | INT | ไม่ | | อายุฐานเป็นวัน ก่อนคูณปัจจัยสุก/ร้อน | 5 |
| market_price_per_kg | DECIMAL(10,2) | ไม่ | | ราคาตลาดอ้างอิง บาท/กก. | 40.00 |

## plots

| คอลัมน์ | ชนิด | NULL ได้ | คีย์ | คำอธิบาย | ตัวอย่าง |
|---|---|---|---|---|---|
| id | INT AUTO_INCREMENT | ไม่ | PK | รหัสแปลง | 1 |
| farmer_id | INT | ไม่ | INDEX `idx_plots_farmer_id` | อ้าง users.id ของเกษตรกร | 1 |
| name | VARCHAR(255) | ไม่ | | ชื่อแปลง | แปลงลุงสมชาย |
| lat | DOUBLE | ไม่ | | ละติจูดแปลง (ใช้ดึงอากาศ) | 13.668 |
| lng | DOUBLE | ไม่ | | ลองจิจูดแปลง | 100.628 |
| area_rai | DECIMAL(10,2) | ไม่ | | พื้นที่ (ไร่) | 1.00 |

## harvest_lots

| คอลัมน์ | ชนิด | NULL ได้ | คีย์ | คำอธิบาย | ตัวอย่าง |
|---|---|---|---|---|---|
| id | INT AUTO_INCREMENT | ไม่ | PK | รหัสล็อต | 1 |
| plot_id | INT | ไม่ | INDEX | อ้าง plots.id | 1 |
| crop_id | INT | ไม่ | INDEX | อ้าง crops.id | 1 |
| weight_kg | DECIMAL(10,2) | ไม่ | | น้ำหนักที่แจ้ง | 80.00 |
| grade | ENUM('normal','substandard') | ไม่ | | เกรด | substandard |
| ripeness | TINYINT | ไม่ | | ระดับความสุก 0–4 | 3 |
| photo_url | VARCHAR(1024) | ได้ | | URL รูป (ระบบรองรับฟิลด์ แต่แอปหลักไม่บังคับอัปโหลด) | NULL |
| allow_donation | TINYINT(1) | ไม่ | | 1 = เปิดรับบริจาค ดีฟอลต์ 0 | 1 |
| predicted_shelf_hours | INT | ไม่ | | ชั่วโมงขายที่ประเมินตอนลงล็อต | 44 |
| expires_at | DATETIME | ไม่ | | เวลาหมดอายุของล็อต | 2026-09-22 22:00:00 |
| status | ENUM('open','reserved','picked','delivered','expired','cancelled') | ไม่ | | สถานะล็อต ดีฟอลต์ open | open |
| created_at | DATETIME | ไม่ | | เวลาสร้าง | 2026-09-22 02:00:00 |

## quality_assessments

| คอลัมน์ | ชนิด | NULL ได้ | คีย์ | คำอธิบาย | ตัวอย่าง |
|---|---|---|---|---|---|
| id | INT AUTO_INCREMENT | ไม่ | PK | รหัสการประเมิน | 1 |
| lot_id | INT | ไม่ | INDEX | อ้าง harvest_lots.id | 1 |
| method | ENUM('rule','model') | ไม่ | | `model` เมื่อใช้ค่า AI ไม่แก้; ไม่เช่นนั้น `rule` | model |
| ripeness | TINYINT | ไม่ | | ความสุกที่ลงประกาศจริง (0–4) | 2 |
| temp_c | DECIMAL(5,2) | ไม่ | | อุณหภูมิที่ใช้คำนวณ (เฉลี่ยกลางวันหรือ fallback) | 34.00 |
| humidity | DECIMAL(5,2) | ไม่ | | ความชื้นที่ใช้คำนวณ | 78.00 |
| predicted_shelf_hours | INT | ไม่ | | ผลลัพธ์ชั่วโมง | 61 |
| ai_ripeness | TINYINT | ได้ | | ความสุกที่โมเดลเสนอ (migration 003) | 3 |
| ai_confidence | DECIMAL(4,3) | ได้ | | ความมั่นใจ 0–1 จากโมเดล | 0.880 |
| ai_model | VARCHAR(128) | ได้ | | ชื่อโมเดลที่ประเมิน | mimo-v2.6-flash |
| created_at | DATETIME | ไม่ | | เวลาบันทึก | 2026-09-22 02:00:00 |

## batches

| คอลัมน์ | ชนิด | NULL ได้ | คีย์ | คำอธิบาย | ตัวอย่าง |
|---|---|---|---|---|---|
| id | INT AUTO_INCREMENT | ไม่ | PK | รหัสรอบวิ่ง | 1 |
| driver_id | INT | ได้ | INDEX | อ้าง users.id role driver | 4 |
| status | ENUM('planned','in_progress','completed') | ไม่ | | สถานะรอบ จากจำนวนจุดที่ done | planned |
| planned_km | DECIMAL(10,2) | ไม่ | | ระยะรวมของเส้นทางที่วางแผน | 12.35 |
| created_at | DATETIME | ไม่ | | เวลาสร้างรอบ | 2026-09-22 03:00:00 |

## orders

| คอลัมน์ | ชนิด | NULL ได้ | คีย์ | คำอธิบาย | ตัวอย่าง |
|---|---|---|---|---|---|
| id | INT AUTO_INCREMENT | ไม่ | PK | รหัสคำสั่งซื้อ | 1 |
| lot_id | INT | ไม่ | INDEX | อ้าง harvest_lots.id | 1 |
| buyer_id | INT | ไม่ | INDEX | อ้าง users.id ของผู้ซื้อ | 11 |
| agreed_price_per_kg | DECIMAL(10,2) | ไม่ | | ราคาที่ตกลง บาท/กก. (บริจาคเป็น 0) | 18.00 |
| is_donation | TINYINT(1) | ไม่ | | 1 = บริจาค ดีฟอลต์ 0 | 0 |
| status | ENUM('reserved','picked','delivered','cancelled') | ไม่ | | สถานะออเดอร์ | reserved |
| batch_id | INT | ได้ | INDEX | อ้าง batches.id เมื่อเข้าสู่รอบแล้ว | NULL |
| drop_otp | CHAR(4) | ไม่ | | รหัสยืนยันส่ง 4 หลัก | 0427 |
| created_at | DATETIME | ไม่ | | เวลาจอง | 2026-09-22 02:30:00 |

## route_stops

| คอลัมน์ | ชนิด | NULL ได้ | คีย์ | คำอธิบาย | ตัวอย่าง |
|---|---|---|---|---|---|
| id | INT AUTO_INCREMENT | ไม่ | PK | รหัสจุดแวะ | 1 |
| batch_id | INT | ไม่ | INDEX | อ้าง batches.id | 1 |
| seq | INT | ไม่ | | ลำดับในเส้นทาง เริ่ม 1 | 1 |
| stop_type | ENUM('pickup','drop') | ไม่ | | รับของหรือส่งของ | pickup |
| lot_id | INT | ได้ | INDEX | ใช้กับ pickup | 1 |
| buyer_id | INT | ได้ | INDEX | ใช้กับ drop | 11 |
| lat | DOUBLE | ไม่ | | พิกัดจุด | 13.668 |
| lng | DOUBLE | ไม่ | | พิกัดจุด | 100.628 |
| leg_km | DECIMAL(10,2) | ไม่ | | ระยะจากจุดก่อนหน้า | 3.20 |
| status | ENUM('pending','done') | ไม่ | | สถานะจุด ดีฟอลต์ pending | pending |
| confirmed_weight_kg | DECIMAL(10,2) | ได้ | | น้ำหนักที่ชั่งได้ตอน pickup | 80.00 |
| proof_photo_url | VARCHAR(1024) | ได้ | | ฟิลด์หลักฐานรูป (มีในสคีมา) | NULL |
| weight_flag | TINYINT(1) | ไม่ | | 1 = น้ำหนักต่างเกิน 10% ดีฟอลต์ 0 | 0 |
| confirmed_at | DATETIME | ได้ | | เวลายืนยันจุด | 2026-09-22 04:00:00 |
| otp_attempts | INT | ไม่ | | จำนวนครั้งที่กรอก OTP ผิด ดีฟอลต์ 0 (migration 002) | 0 |

## impact_logs

| คอลัมน์ | ชนิด | NULL ได้ | คีย์ | คำอธิบาย | ตัวอย่าง |
|---|---|---|---|---|---|
| id | INT AUTO_INCREMENT | ไม่ | PK | รหัสบันทึกผลลัพธ์ | 1 |
| order_id | INT | ไม่ | UNIQUE `uq_impact_logs_order_id` | อ้าง orders.id หนึ่งออเดอร์หนึ่งแถว | 1 |
| kg_saved | DECIMAL(10,2) | ไม่ | | กก. จากน้ำหนักที่ยืนยันตอน pickup | 80.00 |
| co2e_kg | DECIMAL(10,2) | ไม่ | | kg_saved × 2.5 | 200.00 |
| created_at | DATETIME | ไม่ | | เวลาบันทึกตอนส่งมอบสำเร็จ | 2026-09-22 05:00:00 |
