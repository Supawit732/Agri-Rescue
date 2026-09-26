-- 6.3: extend crop_categories with category-level defaults; add crop status/created_by/parcel_allowed
ALTER TABLE crop_categories
  ADD COLUMN default_shelf_days INT NOT NULL DEFAULT 5,
  ADD COLUMN parcel_allowed TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN default_normal_features_th VARCHAR(512) NULL,
  ADD COLUMN default_defect_examples_th VARCHAR(512) NULL;

UPDATE crop_categories SET default_shelf_days = 5, parcel_allowed = 1,
  default_normal_features_th = 'สีเปลือกสม่ำเสมอตามพันธุ์ ผิวไม่มีรอยยุบหรือน้ำไหล ขั้วติดแน่น',
  default_defect_examples_th = 'รอยช้ำยุบ แผลแตก รา จุดดำยุบลึก กลิ่นหมักหรือเน่า'
  WHERE id = 1;

UPDATE crop_categories SET default_shelf_days = 2, parcel_allowed = 0,
  default_normal_features_th = 'ใบเขียวสดเต่งตึง ลำต้นกรอบไม่เหลือง',
  default_defect_examples_th = 'ใบเหลืองไหม้ เน่าเละ รา ลำต้นเละ กลิ่นเหม็น'
  WHERE id = 2;

UPDATE crop_categories SET default_shelf_days = 5, parcel_allowed = 0,
  default_normal_features_th = 'ผิวตึงสม่ำเสมอ ไม่มีรอยยุบหรือน้ำไหล ขั้วสดหรือสีเหลืองอ่อน',
  default_defect_examples_th = 'รอยช้ำนิ่ม แผลแตก รา จุดดำยุบ เน่าที่ขั้ว'
  WHERE id = 3;

UPDATE crop_categories SET default_shelf_days = 4, parcel_allowed = 0,
  default_normal_features_th = 'ใบหรือต้นสดเขียว กลิ่นหอมเฉพาะตัว',
  default_defect_examples_th = 'เหลืองเหี่ยว เน่าเละ รา กลิ่นเหม็น'
  WHERE id = 4;

UPDATE crop_categories SET default_shelf_days = 14, parcel_allowed = 1,
  default_normal_features_th = 'ผิวแน่น ไม่มีรอยยุบหรือขึ้นราชัดเจน',
  default_defect_examples_th = 'รอยช้ำยุบ ราขาว เนื้อเละ กลิ่นเปรี้ยวผิดปกติ'
  WHERE id = 5;

ALTER TABLE crops
  ADD COLUMN parcel_allowed TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN status ENUM('approved', 'pending') NOT NULL DEFAULT 'approved',
  ADD COLUMN created_by INT NULL,
  ADD KEY idx_crops_status (status),
  ADD KEY idx_crops_created_by (created_by);

-- Set parcel_allowed from category for existing crops
UPDATE crops SET parcel_allowed = 1 WHERE category_id IN (1, 5);
