-- Bilingual crop names: English label for API / UI (D025)
ALTER TABLE crops
  ADD COLUMN name_en VARCHAR(255) NULL AFTER name_th;

UPDATE crops SET name_en = 'Mango' WHERE name_th = 'มะม่วง' AND (name_en IS NULL OR name_en = '');
UPDATE crops SET name_en = 'Namwa banana' WHERE name_th = 'กล้วยน้ำว้า' AND (name_en IS NULL OR name_en = '');
UPDATE crops SET name_en = 'Tomato' WHERE name_th = 'มะเขือเทศ' AND (name_en IS NULL OR name_en = '');
UPDATE crops SET name_en = 'Morning glory' WHERE name_th = 'ผักบุ้ง' AND (name_en IS NULL OR name_en = '');
UPDATE crops SET name_en = 'Lime' WHERE name_th = 'มะนาว' AND (name_en IS NULL OR name_en = '');
