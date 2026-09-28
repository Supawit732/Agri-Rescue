-- =============================================================================
-- Agri-Rescue — Final Database Schema WITH Foreign Keys (MySQL / InnoDB / utf8mb4)
-- =============================================================================
-- ไฟล์นี้แตกมาจาก docs/database/schema.sql (โครงสร้างสุดท้ายที่รวมทุก migration)
-- โดยเพิ่ม FOREIGN KEY จริงให้ทุกคอลัมน์ *_id ที่อ้างอิงตารางอื่นอย่างชัดเจน
-- เพื่อบังคับความถูกต้องของข้อมูล (referential integrity) ในระดับฐานข้อมูล
-- ไฟล์นี้ปลอดภัยสำหรับรันซ้ำ (CREATE TABLE IF NOT EXISTS) และไม่มีคำสั่ง
-- CREATE DATABASE / USE / DROP ใดๆ จึงใช้ import เข้าฐานข้อมูลที่มีตารางของ
-- โปรเจกต์อื่นอยู่ร่วมกันได้โดยไม่กระทบตารางเหล่านั้น
--
-- ตารางทั้งหมดในระบบ (เรียงตามลำดับที่สร้างในไฟล์นี้):
--   users                   ผู้ใช้ระบบทุกบทบาท (เกษตรกร/ผู้ซื้อ/คนขับ/ผู้ประสาน) พร้อมสิทธิ์ซื้อ-ขาย-แอดมิน
--   buyer_profiles          โปรไฟล์ผู้ซื้อ/ผู้รับบริจาค (ประเภท, ระดับความน่าเชื่อถือ, ข้อมูลองค์กร)
--   org_application_docs    ไฟล์เอกสารแนบประกอบการสมัครเป็นองค์กรผู้รับบริจาค
--   org_review_logs         ประวัติการตรวจสอบ/อนุมัติ/ปฏิเสธใบสมัครองค์กรโดยแอดมิน
--   crop_categories         หมวดหมู่พืชผล (ผลไม้ ผักใบ ฯลฯ) พร้อมค่าเริ่มต้นของแต่ละหมวด
--   crops                   แค็ตตาล็อกพืชผล ราคาตลาด อายุการเก็บ และข้อมูลอ้างอิง DIT
--   crop_reference_prices   ราคาอ้างอิงรายวันจากกรมการค้าภายใน (DIT) ต่อพืชผล
--   crop_season_factors     ตัวคูณราคาตามฤดูกาลของแต่ละพืชผลรายเดือน
--   dit_mapping_suggestions ข้อเสนอจับคู่พืชผลกับรหัสสินค้า DIT ที่รอตรวจสอบ
--   plots                   แปลงเพาะปลูกของเกษตรกร พร้อมพิกัดและชื่อตำบล/อำเภอ
--   harvest_lots            ล็อตผลผลิตที่เก็บเกี่ยวแล้ว พร้อมราคา สถานะขาย/บริจาค และวันหมดอายุ
--   lot_photos              รูปภาพประกอบล็อตผลผลิตสำหรับหน้าตลาดสาธารณะ
--   lot_edit_logs           ประวัติการแก้ไขข้อมูลล็อตผลผลิต
--   lot_delete_logs         ประวัติการลบล็อต (soft delete) พร้อมสำเนาข้อมูลก่อนลบ
--   quality_assessments     ผลประเมินคุณภาพ/ความสุกของล็อต (แบบกฎเกณฑ์หรือ AI)
--   batches                 รอบการขนส่งของคนขับ 1 รอบ
--   orders                  คำสั่งซื้อ/รับบริจาคของผู้ซื้อต่อหนึ่งล็อต
--   route_stops             จุดแวะรับ/ส่งในแต่ละรอบขนส่ง
--   donation_proofs         หลักฐานการนำผลผลิตที่รับบริจาคไปแจกจ่ายจริง
--   donation_infractions    ประวัติการทำผิดเงื่อนไขการรับบริจาค (พลาดกำหนด/หลักฐานไม่ตรง)
--   impact_logs             บันทึกผลกระทบเชิงบวก (กก. ที่ช่วยได้ / CO2e ที่ลดได้) ต่อคำสั่งซื้อ
--   shops                   โปรไฟล์ร้านค้าของผู้ขาย (ชื่อร้าน โลโก้ ปก คำอธิบาย)
--   shop_follows            ผู้ใช้ที่ติดตามร้านค้า
--   notifications           การแจ้งเตือนในแอปของผู้ใช้แต่ละคน
--   support_tickets         ตั๋วคำร้อง/แจ้งปัญหาจากผู้ใช้
--   support_messages        ข้อความสนทนาในแต่ละตั๋วคำร้อง
--   support_attachments     ไฟล์แนบในตั๋วคำร้องหรือข้อความ
--
-- ระบบบทบาทผู้ใช้ (User roles):
--   คอลัมน์ users.role เป็น ENUM หลัก 4 ค่า: 'farmer' (เกษตรกรผู้ขาย/บริจาคผลผลิต),
--   'buyer' (ผู้ซื้อทั่วไป/ร้านค้า/มูลนิธิ), 'driver' (คนขับรถขนส่ง),
--   'coordinator' (ผู้ประสานงาน/แอดมินเริ่มต้นของระบบ) — นี่คือบทบาท "หลัก" ที่ตั้งตอนสมัคร
--   ต่อมาระบบเพิ่มความสามารถแบบ multi-role ผ่านคอลัมน์ boolean บนตาราง users เอง:
--   can_sell (ขายผลผลิตได้), can_buy (ซื้อ/รับบริจาคได้), is_admin (มีสิทธิ์แอดมิน)
--   ผู้ใช้คนเดียวจึงอาจมีได้หลายความสามารถพร้อมกัน โดยไม่ต้องมีตารางแยกสำหรับ role-mapping
--   ผู้ใช้ที่ can_buy = 1 จะมีข้อมูลเสริมอยู่ในตาราง buyer_profiles (1:1 กับ users ผ่าน user_id)
--
-- นโยบาย FOREIGN KEY ที่ใช้ในไฟล์นี้:
--   CASCADE  — ใช้กับข้อมูลลูกที่ "อยู่ไม่ได้" หากไม่มีพ่อแม่ (โปรไฟล์, รูปภาพ, log, การแจ้งเตือน,
--              ตั๋วคำร้องและข้อความ) ลบพ่อแม่แล้วลบข้อมูลลูกตามไปด้วยได้อย่างปลอดภัย
--   RESTRICT — ใช้กับข้อมูลหลัก/แค็ตตาล็อก (users เป็นเจ้าของ/ผู้แก้ไข/แอดมิน, crops, crop_categories)
--              และห่วงโซ่ธุรกรรม (orders, batches และสิ่งที่อ้างอิงถึงมัน เช่น donation_proofs,
--              impact_logs) เพื่อป้องกันการลบที่ทำให้ประวัติการทำธุรกรรมหายไปโดยไม่ตั้งใจ
--   หมายเหตุ: lot_delete_logs.lot_id ไม่ได้ใส่ FK ไปยัง harvest_lots.id โดยตั้งใจ เพราะตารางนี้
--   ถูกออกแบบให้เก็บสำเนาข้อมูล (snapshot) ไว้ "หลังจาก" ล็อตต้นทางถูกลบจริงแล้วในบางกรณี
--   การใส่ FK แบบ CASCADE จะทำให้ log เพิ่งสร้างถูกลบตามไปด้วยในธุรกรรมเดียวกัน
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- ตารางผู้ใช้ เก็บชื่อ เบอร์ อีเมล รหัสผ่าน บทบาทหลัก และสิทธิ์ซื้อ/ขาย/แอดมิน
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NULL, -- เดิมบังคับกรอก ภายหลังอนุญาตให้ใช้อีเมลแทนได้
  email VARCHAR(255) NULL,
  password_hash VARCHAR(255) NOT NULL,
  can_sell TINYINT(1) NOT NULL DEFAULT 0, -- 1 = ขายผลผลิตได้ (โดยทั่วไปคือเกษตรกร)
  can_buy TINYINT(1) NOT NULL DEFAULT 0, -- 1 = ซื้อ/รับบริจาคได้ (buyer และ driver)
  is_admin TINYINT(1) NOT NULL DEFAULT 0, -- 1 = สิทธิ์ผู้ดูแลระบบ (coordinator)
  line_id VARCHAR(64) NULL,
  role ENUM('farmer', 'buyer', 'driver', 'coordinator') NOT NULL, -- บทบาทหลักตอนสมัคร
  lat DOUBLE NULL,
  lng DOUBLE NULL,
  subdistrict_th VARCHAR(128) NULL,
  district_th VARCHAR(128) NULL,
  subdistrict_en VARCHAR(128) NULL,
  district_en VARCHAR(128) NULL,
  avatar VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางโปรไฟล์ผู้ซื้อ/ผู้รับบริจาค เก็บประเภทผู้ซื้อ ระดับผู้บริจาค และข้อมูลองค์กร
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buyer_profiles (
  user_id INT NOT NULL,
  buyer_type ENUM('vendor', 'shop', 'charity') NOT NULL, -- vendor=พ่อค้าคนกลาง, shop=ร้านค้า, charity=องค์กรการกุศล
  charity_approved TINYINT(1) NOT NULL DEFAULT 0,
  donor_tier ENUM('volunteer', 'trusted_volunteer', 'verified_org') NULL, -- ระดับความน่าเชื่อถือของผู้รับบริจาค
  beneficiary_count INT NULL,
  recipient_groups_json TEXT NULL, -- รายชื่อกลุ่มผู้รับผลประโยชน์ (JSON)
  purpose_th VARCHAR(512) NULL,
  distribution_mode ENUM('self_use', 'redistribute') NULL, -- ใช้เอง หรือ นำไปแจกจ่ายต่อ
  redistribute_place VARCHAR(512) NULL,
  redistribute_frequency VARCHAR(128) NULL,
  donation_suspended TINYINT(1) NOT NULL DEFAULT 0, -- 1 = ถูกระงับสิทธิ์รับบริจาคชั่วคราว
  trusted_proof_count INT NOT NULL DEFAULT 0,
  org_name VARCHAR(255) NULL,
  org_type ENUM('foundation', 'association', 'shelter', 'community_kitchen', 'community_enterprise', 'other') NULL,
  registered TINYINT(1) NULL, -- 1 = จดทะเบียนเป็นนิติบุคคล
  registration_number VARCHAR(64) NULL,
  registered_address VARCHAR(512) NULL,
  contact_name VARCHAR(255) NULL,
  contact_title VARCHAR(128) NULL,
  contact_phone VARCHAR(32) NULL,
  contact_email VARCHAR(255) NULL,
  org_lat DOUBLE NULL,
  org_lng DOUBLE NULL,
  org_status ENUM('none', 'draft', 'pending', 'approved', 'rejected', 'needs_more_info') NOT NULL DEFAULT 'none', -- สถานะใบสมัครองค์กร
  application_kind ENUM('individual', 'organization') NULL,
  draft_step INT NULL, -- ขั้นตอนแบบร่างที่กรอกล่าสุด (สำหรับฟอร์มหลายขั้นตอน)
  org_reject_reason VARCHAR(512) NULL,
  requested_fields_json TEXT NULL, -- ฟิลด์ที่แอดมินขอให้แก้ไข/เพิ่มเติม (JSON)
  org_reviewed_at DATETIME NULL,
  donor_terms_version VARCHAR(32) NULL,
  donor_terms_accepted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY idx_buyer_profiles_type (buyer_type),
  CONSTRAINT fk_buyer_profiles_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- โปรไฟล์อยู่ไม่ได้ถ้าไม่มีผู้ใช้เจ้าของ
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางเอกสารแนบประกอบการสมัครเป็นองค์กรผู้รับบริจาค
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_application_docs (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime VARCHAR(64) NOT NULL,
  doc_category ENUM('registration_cert', 'community_cert', 'site_photo', 'other') NOT NULL DEFAULT 'other',
  size_bytes INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_org_docs_user (user_id),
  CONSTRAINT fk_org_application_docs_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- เอกสารแนบผูกกับผู้สมัครรายนี้เท่านั้น
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางประวัติการตรวจสอบ/อนุมัติ/ปฏิเสธใบสมัครองค์กรโดยแอดมิน
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_review_logs (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  admin_id INT NOT NULL,
  action ENUM('approved', 'rejected', 'needs_more_info', 'checklist_saved', 'withdrawn') NOT NULL,
  reason VARCHAR(512) NULL,
  checklist_json TEXT NULL,
  requested_fields_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_org_review_logs_user (user_id, created_at),
  CONSTRAINT fk_org_review_logs_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE, -- ประวัติผูกกับผู้สมัครรายนี้
  CONSTRAINT fk_org_review_logs_admin FOREIGN KEY (admin_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบบัญชีแอดมินถ้ายังมีประวัติการตรวจสอบอ้างอิงอยู่
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางหมวดหมู่พืชผล เก็บชื่อหมวดและค่าเริ่มต้น (อายุเก็บ/ลักษณะปกติ-ผิดปกติ) ของหมวดนั้น
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crop_categories (
  id INT NOT NULL AUTO_INCREMENT,
  name_th VARCHAR(64) NOT NULL,
  name_en VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  default_shelf_days INT NOT NULL DEFAULT 5,
  parcel_allowed TINYINT(1) NOT NULL DEFAULT 0, -- 1 = อนุญาตให้ขายเป็นหน่วยพัสดุ/มัด ไม่ใช่ชั่งกิโลอย่างเดียว
  default_normal_features_th VARCHAR(512) NULL,
  default_defect_examples_th VARCHAR(512) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางแค็ตตาล็อกพืชผล เก็บชื่อ อายุการเก็บพื้นฐาน ราคาตลาด และข้อมูลอ้างอิง DIT
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crops (
  id INT NOT NULL AUTO_INCREMENT,
  name_th VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NULL,
  category_id INT NULL,
  base_shelf_days INT NOT NULL, -- อายุการเก็บพื้นฐานหลังเก็บเกี่ยว (วัน)
  market_price_per_kg DECIMAL(10, 2) NOT NULL,
  dit_product_code VARCHAR(32) NULL, -- รหัสสินค้าตามกรมการค้าภายใน (DIT)
  dit_product_name VARCHAR(255) NULL,
  dit_unit VARCHAR(64) NULL,
  dit_unit_to_kg DOUBLE NULL,
  dit_match_source ENUM('auto', 'manual') NULL, -- วิธีจับคู่รหัส DIT: อัตโนมัติ หรือ แอดมินจับคู่เอง
  dit_price_status VARCHAR(255) NULL,
  normal_features_th TEXT NULL,
  defect_examples_th TEXT NULL,
  storage_tip_th VARCHAR(512) NULL,
  storage_tip_en VARCHAR(512) NULL,
  fridge_ok TINYINT(1) NOT NULL DEFAULT 0, -- 1 = แช่เย็นได้เพื่อยืดอายุ
  fridge_extra_days INT NOT NULL DEFAULT 0,
  parcel_allowed TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('approved', 'pending') NOT NULL DEFAULT 'approved', -- pending = พืชผลที่ผู้ใช้เพิ่มเองรอแอดมินอนุมัติ
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crops_category_id (category_id),
  KEY idx_crops_status (status),
  KEY idx_crops_created_by (created_by),
  CONSTRAINT fk_crops_category FOREIGN KEY (category_id) REFERENCES crop_categories (id)
    ON DELETE RESTRICT ON UPDATE CASCADE, -- ห้ามลบหมวดหมู่ถ้ายังมีพืชผลใช้งานอยู่
  CONSTRAINT fk_crops_created_by FOREIGN KEY (created_by) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบบัญชีผู้เพิ่มพืชผลถ้ายังมีพืชผลที่เขาเพิ่มไว้ในระบบ
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางราคาอ้างอิงรายวันจากกรมการค้าภายใน (DIT) ของแต่ละพืชผล
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crop_reference_prices (
  id INT NOT NULL AUTO_INCREMENT,
  crop_id INT NOT NULL,
  date DATE NOT NULL,
  wholesale_price DECIMAL(12, 2) NULL,
  retail_price DECIMAL(12, 2) NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'moc_dit',
  product_code VARCHAR(32) NOT NULL,
  unit VARCHAR(64) NULL,
  source_url VARCHAR(512) NOT NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rejected_as_outlier TINYINT(1) NOT NULL DEFAULT 0, -- 1 = ราคาที่ดึงมาถูกตัดทิ้งเพราะผิดปกติ
  outlier_baseline DECIMAL(12, 2) NULL,
  outlier_ratio DECIMAL(12, 4) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crop_ref_price_day (crop_id, date, product_code),
  KEY idx_crop_ref_prices_crop_date (crop_id, date),
  CONSTRAINT fk_crop_reference_prices_crop FOREIGN KEY (crop_id) REFERENCES crops (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- ราคาอ้างอิงอยู่ไม่ได้ถ้าไม่มีพืชผลนี้แล้ว
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางตัวคูณราคาตามฤดูกาลของแต่ละพืชผลรายเดือน (factor > 1 = พีคดันราคาขึ้น, < 1 = นอกฤดูราคาลด)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crop_season_factors (
  id INT NOT NULL AUTO_INCREMENT,
  crop_id INT NOT NULL,
  month TINYINT NOT NULL COMMENT '1=ม.ค. ... 12=ธ.ค.',
  factor DECIMAL(4, 3) NOT NULL DEFAULT 1.000,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crop_month (crop_id, month),
  CONSTRAINT fk_crop_season_factors_crop FOREIGN KEY (crop_id) REFERENCES crops (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- ตัวคูณฤดูกาลอยู่ไม่ได้ถ้าไม่มีพืชผลนี้แล้ว
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางข้อเสนอจับคู่พืชผลกับรหัสสินค้า DIT ที่รอแอดมินตรวจสอบ
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dit_mapping_suggestions (
  id INT NOT NULL AUTO_INCREMENT,
  crop_id INT NOT NULL,
  product_code VARCHAR(32) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  sell_type VARCHAR(32) NULL,
  unit VARCHAR(64) NULL,
  note_th VARCHAR(512) NULL,
  status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_dit_suggestions_crop (crop_id, status),
  CONSTRAINT fk_dit_mapping_suggestions_crop FOREIGN KEY (crop_id) REFERENCES crops (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- ข้อเสนอจับคู่อยู่ไม่ได้ถ้าไม่มีพืชผลนี้แล้ว
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางแปลงเพาะปลูกของเกษตรกร เก็บชื่อแปลง พิกัด และชื่อตำบล/อำเภอ
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plots (
  id INT NOT NULL AUTO_INCREMENT,
  farmer_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  subdistrict_th VARCHAR(128) NULL,
  district_th VARCHAR(128) NULL,
  subdistrict_en VARCHAR(128) NULL,
  district_en VARCHAR(128) NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  area_rai DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_plots_farmer_id (farmer_id),
  CONSTRAINT fk_plots_farmer FOREIGN KEY (farmer_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- แปลงเพาะปลูกอยู่ไม่ได้ถ้าไม่มีเกษตรกรเจ้าของ
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางล็อตผลผลิตที่เก็บเกี่ยวแล้ว เก็บน้ำหนัก เกรด ราคา สถานะขาย/บริจาค และวันหมดอายุ
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS harvest_lots (
  id INT NOT NULL AUTO_INCREMENT,
  plot_id INT NOT NULL,
  crop_id INT NOT NULL,
  weight_kg DECIMAL(10, 2) NOT NULL,
  split_allowed TINYINT(1) NOT NULL DEFAULT 1, -- 1 = อนุญาตให้จองซื้อบางส่วนได้ (ไม่ต้องซื้อทั้งล็อต)
  min_order_kg DECIMAL(10, 2) NOT NULL DEFAULT 1,
  order_step_kg DECIMAL(10, 2) NOT NULL DEFAULT 1,
  grade ENUM('normal', 'substandard') NOT NULL,
  ripeness TINYINT NOT NULL,
  photo_url VARCHAR(1024) NULL,
  allow_donation TINYINT(1) NOT NULL DEFAULT 0,
  donation_audience ENUM('verified_org_only', 'all_donors') NOT NULL DEFAULT 'verified_org_only', -- ใครรับบริจาคได้บ้าง
  start_price_per_kg DECIMAL(12, 2) NULL,
  floor_price_per_kg DECIMAL(12, 2) NULL, -- ราคาต่ำสุดที่ราคาจะลดลงไปได้ก่อนเปลี่ยนเป็นบริจาค
  sale_mode ENUM('sell', 'donate', 'sell_then_donate') NOT NULL DEFAULT 'sell',
  donation_opened TINYINT(1) NOT NULL DEFAULT 0, -- 1 = เปิดให้รับบริจาคแล้ว (ราคาลดถึง floor)
  market_price_snapshot DECIMAL(12, 2) NULL,
  market_price_is_estimate TINYINT(1) NOT NULL DEFAULT 1,
  market_price_as_of DATE NULL,
  predicted_shelf_hours INT NOT NULL,
  expires_at DATETIME NOT NULL,
  status ENUM('open', 'partially_reserved', 'fully_reserved', 'picked', 'delivered', 'expired', 'cancelled') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL, -- soft delete: ไม่ NULL แปลว่าเกษตรกรลบล็อตนี้แล้ว
  description VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_harvest_lots_plot_id (plot_id),
  KEY idx_harvest_lots_crop_id (crop_id),
  CONSTRAINT fk_harvest_lots_plot FOREIGN KEY (plot_id) REFERENCES plots (id)
    ON DELETE CASCADE ON UPDATE CASCADE, -- ล็อตอยู่ไม่ได้ถ้าไม่มีแปลงเพาะปลูกต้นทาง
  CONSTRAINT fk_harvest_lots_crop FOREIGN KEY (crop_id) REFERENCES crops (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบพืชผลในแค็ตตาล็อกถ้ายังมีล็อตผลผลิตอ้างอิงอยู่
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางรูปภาพประกอบล็อตผลผลิตสำหรับหน้าตลาดสาธารณะ
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lot_photos (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  path VARCHAR(1024) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lot_photos_lot_id (lot_id),
  CONSTRAINT fk_lot_photos_lot FOREIGN KEY (lot_id) REFERENCES harvest_lots (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- รูปภาพอยู่ไม่ได้ถ้าไม่มีล็อตต้นทาง
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางประวัติการแก้ไขข้อมูลล็อตผลผลิต (เก็บค่าก่อน/หลังแก้ไขทีละฟิลด์)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lot_edit_logs (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  editor_id INT NOT NULL,
  field_name VARCHAR(64) NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lot_edit_logs_lot (lot_id, created_at),
  CONSTRAINT fk_lot_edit_logs_lot FOREIGN KEY (lot_id) REFERENCES harvest_lots (id)
    ON DELETE CASCADE ON UPDATE CASCADE, -- ประวัติแก้ไขอยู่ไม่ได้ถ้าไม่มีล็อตต้นทาง
  CONSTRAINT fk_lot_edit_logs_editor FOREIGN KEY (editor_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบบัญชีผู้แก้ไขถ้ายังมีประวัติการแก้ไขอ้างอิงอยู่
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางประวัติการลบล็อตผลผลิต เก็บเหตุผลและสำเนาข้อมูลทั้งหมดก่อนลบ (JSON)
-- หมายเหตุ: lot_id ไม่ได้ใส่ FK ไปยัง harvest_lots.id โดยตั้งใจ (ดูคำอธิบายด้านบนของไฟล์)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lot_delete_logs (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  farmer_id INT NOT NULL,
  reason VARCHAR(255) NULL,
  snapshot_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lot_delete_logs_lot_id (lot_id),
  KEY idx_lot_delete_logs_farmer_id (farmer_id),
  CONSTRAINT fk_lot_delete_logs_farmer FOREIGN KEY (farmer_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบบัญชีเกษตรกรถ้ายังมีประวัติการลบล็อตอ้างอิงอยู่
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางผลประเมินคุณภาพ/ความสุกของล็อตผลผลิต (ประเมินด้วยกฎเกณฑ์ หรือโมเดล AI)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quality_assessments (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  method ENUM('rule', 'model') NOT NULL, -- rule=คำนวณตามกฎ, model=ประเมินด้วยโมเดล AI
  ripeness TINYINT NOT NULL,
  temp_c DECIMAL(5, 2) NOT NULL,
  humidity DECIMAL(5, 2) NOT NULL,
  predicted_shelf_hours INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ai_ripeness TINYINT NULL,
  ai_confidence DECIMAL(4, 3) NULL,
  ai_model VARCHAR(128) NULL,
  PRIMARY KEY (id),
  KEY idx_quality_assessments_lot_id (lot_id),
  CONSTRAINT fk_quality_assessments_lot FOREIGN KEY (lot_id) REFERENCES harvest_lots (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- ผลประเมินอยู่ไม่ได้ถ้าไม่มีล็อตต้นทาง
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางรอบการขนส่งของคนขับ 1 รอบ (แผนเส้นทาง สถานะ ระยะทางรวม)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batches (
  id INT NOT NULL AUTO_INCREMENT,
  driver_id INT NULL,
  status ENUM('planned', 'in_progress', 'completed') NOT NULL,
  planned_km DECIMAL(10, 2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_batches_driver_id (driver_id),
  CONSTRAINT fk_batches_driver FOREIGN KEY (driver_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบบัญชีคนขับถ้ายังมีรอบขนส่ง (ธุรกรรม) อ้างอิงอยู่
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางคำสั่งซื้อ/รับบริจาคของผู้ซื้อต่อหนึ่งล็อตผลผลิต
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  quantity_kg DECIMAL(10, 2) NOT NULL,
  buyer_id INT NOT NULL,
  agreed_price_per_kg DECIMAL(10, 2) NOT NULL,
  is_donation TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('reserved', 'picked', 'delivered', 'cancelled') NOT NULL,
  batch_id INT NULL,
  drop_otp CHAR(4) NOT NULL, -- รหัส OTP 4 หลักยืนยันการส่งมอบ
  distribution_place VARCHAR(512) NULL, -- สถานที่ที่จะนำไปแจกจ่ายต่อ (กรณีรับบริจาค)
  distribution_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pickup_slot_start DATETIME NULL,
  pickup_slot_end DATETIME NULL,
  otp_attempts INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_orders_lot_id (lot_id),
  KEY idx_orders_buyer_id (buyer_id),
  KEY idx_orders_batch_id (batch_id),
  KEY idx_orders_pickup_slot_start (pickup_slot_start),
  CONSTRAINT fk_orders_lot FOREIGN KEY (lot_id) REFERENCES harvest_lots (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT, -- ห้ามลบล็อตถ้ายังมีคำสั่งซื้อ (ธุรกรรม) อ้างอิงอยู่
  CONSTRAINT fk_orders_buyer FOREIGN KEY (buyer_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT, -- ห้ามลบบัญชีผู้ซื้อถ้ายังมีคำสั่งซื้ออ้างอิงอยู่
  CONSTRAINT fk_orders_batch FOREIGN KEY (batch_id) REFERENCES batches (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบรอบขนส่งถ้ายังมีคำสั่งซื้อผูกอยู่กับรอบนั้น
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางจุดแวะรับ/ส่งในแต่ละรอบขนส่ง (pickup ที่แปลง หรือ drop ที่ผู้ซื้อ)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS route_stops (
  id INT NOT NULL AUTO_INCREMENT,
  batch_id INT NOT NULL,
  seq INT NOT NULL,
  stop_type ENUM('pickup', 'drop') NOT NULL,
  lot_id INT NULL,
  buyer_id INT NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  leg_km DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'done') NOT NULL DEFAULT 'pending',
  confirmed_weight_kg DECIMAL(10, 2) NULL,
  proof_photo_url VARCHAR(1024) NULL,
  weight_flag TINYINT(1) NOT NULL DEFAULT 0, -- 1 = น้ำหนักที่ชั่งจริงต่างจากที่ตกลงไว้มาก
  confirmed_at DATETIME NULL,
  otp_attempts INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_route_stops_batch_id (batch_id),
  KEY idx_route_stops_lot_id (lot_id),
  KEY idx_route_stops_buyer_id (buyer_id),
  CONSTRAINT fk_route_stops_batch FOREIGN KEY (batch_id) REFERENCES batches (id)
    ON DELETE CASCADE ON UPDATE CASCADE, -- จุดแวะเป็นส่วนหนึ่งของรอบขนส่งนี้เท่านั้น
  CONSTRAINT fk_route_stops_lot FOREIGN KEY (lot_id) REFERENCES harvest_lots (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT, -- ห้ามลบล็อตถ้ายังมีจุดแวะรับอ้างอิงอยู่ (ธุรกรรม)
  CONSTRAINT fk_route_stops_buyer FOREIGN KEY (buyer_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบบัญชีผู้ซื้อถ้ายังมีจุดแวะส่งอ้างอิงอยู่ (ธุรกรรม)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางหลักฐานการนำผลผลิตที่รับบริจาคไปแจกจ่ายจริง พร้อมกำหนดส่งหลักฐาน
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donation_proofs (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  due_at DATETIME NOT NULL,
  submitted_at DATETIME NULL,
  stored_name VARCHAR(255) NULL,
  subject_match TINYINT(1) NULL, -- ตรวจสอบว่าภาพหลักฐานตรงกับหัวข้อที่กำหนดหรือไม่
  status ENUM('pending', 'passed', 'failed', 'missed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_donation_proofs_order (order_id),
  KEY idx_donation_proofs_due (status, due_at),
  CONSTRAINT fk_donation_proofs_order FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบคำสั่งรับบริจาคถ้ายังมีหลักฐานอ้างอิงอยู่
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางประวัติการทำผิดเงื่อนไขการรับบริจาค (พลาดกำหนดส่งหลักฐาน/หลักฐานไม่ตรง)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donation_infractions (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  order_id INT NULL,
  reason ENUM('missed_deadline', 'subject_mismatch') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_infractions_user_created (user_id, created_at),
  CONSTRAINT fk_donation_infractions_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT, -- ห้ามลบบัญชีผู้รับบริจาคถ้ายังมีประวัติการทำผิดอ้างอิงอยู่
  CONSTRAINT fk_donation_infractions_order FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบคำสั่งรับบริจาคถ้ายังมีประวัติการทำผิดอ้างอิงอยู่
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางบันทึกผลกระทบเชิงบวก (กก. ที่ช่วยกอบกู้ได้ / CO2e ที่ลดได้) ต่อคำสั่งซื้อ
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS impact_logs (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  kg_saved DECIMAL(10, 2) NOT NULL,
  co2e_kg DECIMAL(10, 2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_impact_logs_order_id (order_id),
  CONSTRAINT fk_impact_logs_order FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบคำสั่งซื้อถ้ายังมีบันทึกผลกระทบอ้างอิงอยู่
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางโปรไฟล์ร้านค้าของผู้ขาย (ชื่อร้าน โลโก้ ปกร้าน คำอธิบาย)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shops (
  user_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  avatar VARCHAR(1024) NULL,
  cover VARCHAR(1024) NULL,
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_shops_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- ร้านค้าอยู่ไม่ได้ถ้าไม่มีผู้ใช้เจ้าของ
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางผู้ใช้ที่ติดตามร้านค้า (ความสัมพันธ์ many-to-many ระหว่างผู้ใช้กับร้าน)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_follows (
  user_id INT NOT NULL,
  shop_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, shop_id),
  KEY idx_shop_follows_shop_id (shop_id),
  CONSTRAINT fk_shop_follows_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE, -- ผู้ติดตามหายไปเมื่อผู้ใช้ถูกลบ
  CONSTRAINT fk_shop_follows_shop FOREIGN KEY (shop_id) REFERENCES shops (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE -- การติดตามหายไปเมื่อร้านค้าถูกลบ
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางการแจ้งเตือนในแอปของผู้ใช้แต่ละคน (title_key + params สำหรับรองรับหลายภาษา)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  type VARCHAR(64) NOT NULL,
  title_key VARCHAR(64) NOT NULL, -- คีย์ข้อความสำหรับแปลภาษาในแอป
  params_json JSON NULL,
  link VARCHAR(512) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_id (user_id),
  KEY idx_notifications_user_unread (user_id, read_at),
  KEY idx_notifications_type (type),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- การแจ้งเตือนอยู่ไม่ได้ถ้าไม่มีผู้ใช้เจ้าของ
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางตั๋วคำร้อง/แจ้งปัญหาจากผู้ใช้ (หัวข้อ สถานะ ช่องทางตอบกลับ)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  topic ENUM('order_pickup', 'item_mismatch', 'account_login', 'donation', 'other') NOT NULL,
  topic_label VARCHAR(255) NULL,
  order_id INT NULL,
  status ENUM('open', 'in_progress', 'closed') NOT NULL DEFAULT 'open',
  reply_via ENUM('app', 'phone') NOT NULL DEFAULT 'app',
  has_new_reply TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_tickets_user_id (user_id),
  KEY idx_support_tickets_status (status),
  KEY idx_support_tickets_order_id (order_id),
  KEY idx_support_tickets_updated (updated_at),
  CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE, -- ตั๋วคำร้องอยู่ไม่ได้ถ้าไม่มีผู้ใช้เจ้าของ
  CONSTRAINT fk_support_tickets_order FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT -- ห้ามลบคำสั่งซื้อถ้ายังมีตั๋วคำร้องอ้างอิงอยู่
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางข้อความสนทนาในแต่ละตั๋วคำร้อง (จากผู้ใช้ หรือ แอดมิน)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id INT NOT NULL AUTO_INCREMENT,
  ticket_id INT NOT NULL,
  sender_role ENUM('user', 'admin') NOT NULL,
  body VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_messages_ticket_id (ticket_id),
  KEY idx_support_messages_created (ticket_id, created_at),
  CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- ข้อความอยู่ไม่ได้ถ้าไม่มีตั๋วคำร้องต้นทาง
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- ตารางไฟล์แนบในตั๋วคำร้องหรือข้อความสนทนา
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_attachments (
  id INT NOT NULL AUTO_INCREMENT,
  ticket_id INT NOT NULL,
  message_id INT NULL,
  stored_name VARCHAR(512) NOT NULL,
  original_name VARCHAR(255) NULL,
  mime VARCHAR(128) NOT NULL,
  size_bytes INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_attachments_ticket_id (ticket_id),
  KEY idx_support_attachments_message_id (message_id),
  CONSTRAINT fk_support_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets (id)
    ON DELETE CASCADE ON UPDATE CASCADE, -- ไฟล์แนบอยู่ไม่ได้ถ้าไม่มีตั๋วคำร้องต้นทาง
  CONSTRAINT fk_support_attachments_message FOREIGN KEY (message_id) REFERENCES support_messages (id)
    ON DELETE CASCADE ON UPDATE CASCADE -- ไฟล์แนบอยู่ไม่ได้ถ้าไม่มีข้อความต้นทาง (กรณีแนบกับข้อความ)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- Sample data — ข้อมูลตัวอย่าง (ปลอม) สำหรับสาธิตความสัมพันธ์ระหว่างตาราง
-- =============================================================================

-- ผู้ใช้: เกษตรกร 2 คน, ผู้ซื้อ/ร้านค้า 1 คน, องค์กรการกุศล 1 คน, คนขับ 1 คน, ผู้ประสานงาน 1 คน
INSERT INTO users (id, name, phone, email, password_hash, can_sell, can_buy, is_admin, role, lat, lng, subdistrict_th, district_th, created_at) VALUES
  (1, 'สมชาย ใจดี', '0811111111', 'somchai@example.com', '$2a$10$examplehashsomchai0000000000000000000000000000', 1, 0, 0, 'farmer', 13.7367, 100.5232, 'บางรัก', 'บางรัก', '2026-01-05 08:00:00'),
  (2, 'มาลี สวนงาม', '0822222222', 'malee@example.com', '$2a$10$examplehashmalee00000000000000000000000000000', 1, 0, 0, 'farmer', 14.9799, 102.0977, 'ในเมือง', 'เมืองขอนแก่น', '2026-01-06 09:00:00'),
  (3, 'ร้านผักสดหทัย', '0833333333', 'hathai.shop@example.com', '$2a$10$examplehashhathai0000000000000000000000000000', 0, 1, 0, 'buyer', 13.7563, 100.5018, 'สยาม', 'ปทุมวัน', '2026-01-07 10:00:00'),
  (4, 'มูลนิธิแบ่งปันอิ่ม', '0844444444', 'foundation@example.com', '$2a$10$examplehashfoundation000000000000000000000000', 0, 1, 0, 'buyer', 13.8200, 100.5600, 'จตุจักร', 'จตุจักร', '2026-01-08 11:00:00'),
  (5, 'วีระ ขับดี', '0855555555', 'weera.driver@example.com', '$2a$10$examplehashweera0000000000000000000000000000', 0, 1, 0, 'driver', 13.7500, 100.5300, 'บางรัก', 'บางรัก', '2026-01-08 12:00:00'),
  (6, 'admin', '0800000005', 'admin@example.com', '$2a$10$examplehashadmin00000000000000000000000000000', 0, 0, 1, 'coordinator', NULL, NULL, NULL, NULL, '2026-01-01 00:00:00');

-- โปรไฟล์ผู้ซื้อ: ร้านค้าทั่วไป และ มูลนิธิที่ผ่านการรับรองเป็นองค์กรผู้รับบริจาคแล้ว
INSERT INTO buyer_profiles (user_id, buyer_type, charity_approved, donor_tier, org_name, org_type, org_status, application_kind, distribution_mode, beneficiary_count, created_at) VALUES
  (3, 'shop', 0, NULL, NULL, NULL, 'none', 'individual', NULL, NULL, '2026-01-07 10:05:00'),
  (4, 'charity', 1, 'verified_org', 'มูลนิธิแบ่งปันอิ่ม', 'foundation', 'approved', 'organization', 'redistribute', 60, '2026-01-08 11:05:00');

-- หมวดหมู่พืชผล
INSERT INTO crop_categories (id, name_th, name_en, sort_order, default_shelf_days, parcel_allowed) VALUES
  (1, 'ผลไม้', 'Fruit', 1, 5, 1),
  (2, 'ผักใบ', 'Leafy vegetables', 2, 2, 0),
  (3, 'ผักผล', 'Fruit vegetables', 3, 5, 0);

-- แค็ตตาล็อกพืชผล
INSERT INTO crops (id, name_th, name_en, category_id, base_shelf_days, market_price_per_kg, status, created_at) VALUES
  (1, 'มะม่วง', 'Mango', 1, 5, 35.00, 'approved', '2026-01-01 00:00:00'),
  (2, 'ผักบุ้ง', 'Morning glory', 2, 2, 15.00, 'approved', '2026-01-01 00:00:00'),
  (3, 'มะเขือเทศ', 'Tomato', 3, 5, 20.00, 'approved', '2026-01-01 00:00:00');

-- แปลงเพาะปลูกของเกษตรกร
INSERT INTO plots (id, farmer_id, name, subdistrict_th, district_th, lat, lng, area_rai) VALUES
  (1, 1, 'แปลงหลังบ้านสมชาย', 'บางรัก', 'บางรัก', 13.7370, 100.5240, 3.5),
  (2, 2, 'สวนมาลีไร่ใหญ่', 'ในเมือง', 'เมืองขอนแก่น', 14.9800, 102.0980, 8.0);

-- ล็อตผลผลิตที่เก็บเกี่ยวแล้ว
INSERT INTO harvest_lots (id, plot_id, crop_id, weight_kg, grade, ripeness, allow_donation, start_price_per_kg, floor_price_per_kg, sale_mode, predicted_shelf_hours, expires_at, status, created_at) VALUES
  (1, 1, 1, 120.00, 'normal', 6, 1, 30.00, 9.00, 'sell_then_donate', 96, '2026-01-10 08:00:00', 'open', '2026-01-06 08:00:00'),
  (2, 2, 2, 40.00, 'substandard', 8, 0, 10.00, 3.00, 'sell', 48, '2026-01-09 09:00:00', 'partially_reserved', '2026-01-07 09:00:00');

-- รอบการขนส่งของคนขับ (สร้างก่อน orders เพราะ orders.batch_id อาจอ้างอิงถึง)
INSERT INTO batches (id, driver_id, status, planned_km, created_at) VALUES
  (1, 5, 'planned', 12.40, '2026-01-08 14:00:00');

-- คำสั่งซื้อ: ร้านค้าซื้อผักบุ้งบางส่วน
INSERT INTO orders (id, lot_id, quantity_kg, buyer_id, agreed_price_per_kg, is_donation, status, drop_otp, created_at) VALUES
  (1, 2, 15.00, 3, 10.00, 0, 'reserved', '4821', '2026-01-07 10:30:00');

-- คำสั่งซื้อ: มูลนิธิรับบริจาคมะม่วง
INSERT INTO orders (id, lot_id, quantity_kg, buyer_id, agreed_price_per_kg, is_donation, status, drop_otp, distribution_place, created_at) VALUES
  (2, 1, 50.00, 4, 0.00, 1, 'reserved', '9034', 'ศูนย์กระจายอาหารจตุจักร', '2026-01-08 13:00:00');

-- หลักฐานการนำผลผลิตที่รับบริจาคไปแจกจ่ายจริง
INSERT INTO donation_proofs (id, order_id, due_at, status, created_at) VALUES
  (1, 2, '2026-01-11 13:00:00', 'pending', '2026-01-08 13:05:00');

INSERT INTO route_stops (id, batch_id, seq, stop_type, lot_id, buyer_id, lat, lng, leg_km, status) VALUES
  (1, 1, 1, 'pickup', 1, NULL, 13.7370, 100.5240, 0.00, 'pending'),
  (2, 1, 2, 'drop', NULL, 4, 13.8200, 100.5600, 12.40, 'pending');

-- ร้านค้าและผู้ติดตาม
INSERT INTO shops (user_id, name, description, created_at) VALUES
  (3, 'ร้านผักสดหทัย', 'ผักผลไม้สดจากเกษตรกรโดยตรง', '2026-01-07 10:10:00');

INSERT INTO shop_follows (user_id, shop_id, created_at) VALUES
  (4, 3, '2026-01-08 12:00:00');

-- การแจ้งเตือนในแอป
INSERT INTO notifications (id, user_id, type, title_key, link, created_at) VALUES
  (1, 1, 'order_placed', 'notif.order_placed', '/orders/1', '2026-01-07 10:31:00');

-- ตั๋วคำร้องและข้อความสนทนา
INSERT INTO support_tickets (id, user_id, topic, status, reply_via, created_at) VALUES
  (1, 3, 'order_pickup', 'open', 'app', '2026-01-08 09:00:00');

INSERT INTO support_messages (id, ticket_id, sender_role, body, created_at) VALUES
  (1, 1, 'user', 'ยังไม่มีคนมารับผลผลิตตามเวลานัดครับ', '2026-01-08 09:00:00');
