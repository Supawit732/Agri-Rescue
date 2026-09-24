-- PR A: lightweight crop categories for market chips/filters (full 6.3 catalog comes later)
CREATE TABLE IF NOT EXISTS crop_categories (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name_th VARCHAR(64) NOT NULL,
  name_en VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

ALTER TABLE crops
  ADD COLUMN category_id INT NULL AFTER name_en,
  ADD KEY idx_crops_category_id (category_id);

INSERT INTO crop_categories (id, name_th, name_en, sort_order) VALUES
  (1, 'ผลไม้', 'Fruit', 1),
  (2, 'ผักใบ', 'Leafy vegetables', 2),
  (3, 'ผักผล', 'Fruit vegetables', 3),
  (4, 'สมุนไพร', 'Herbs', 4),
  (5, 'หัว/ราก', 'Roots & tubers', 5)
ON DUPLICATE KEY UPDATE name_th = VALUES(name_th), name_en = VALUES(name_en), sort_order = VALUES(sort_order);

UPDATE crops SET category_id = 1 WHERE name_th IN ('มะม่วง', 'กล้วยน้ำว้า', 'มะนาว') AND category_id IS NULL;
UPDATE crops SET category_id = 2 WHERE name_th = 'ผักบุ้ง' AND category_id IS NULL;
UPDATE crops SET category_id = 3 WHERE name_th = 'มะเขือเทศ' AND category_id IS NULL;
