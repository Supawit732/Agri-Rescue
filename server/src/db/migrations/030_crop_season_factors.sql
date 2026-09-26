-- Seasonal price adjustment factors per crop per month.
-- Source: OAE (สำนักงานเศรษฐกิจการเกษตร) production calendar.
-- factor > 1 = peak season price premium, factor < 1 = off-season discount.
-- Only months with factor ≠ 1.0 are stored; missing months default to 1.0.

CREATE TABLE IF NOT EXISTS crop_season_factors (
  id          INT          NOT NULL AUTO_INCREMENT,
  crop_id     INT          NOT NULL,
  month       TINYINT      NOT NULL COMMENT '1=Jan … 12=Dec',
  factor      DECIMAL(4,3) NOT NULL DEFAULT 1.000,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crop_month (crop_id, month)
);

-- มะม่วง (Mango): peak Mar–Jun, low Aug–Nov  (OAE ปฏิทินผลผลิตภาคกลาง)
INSERT INTO crop_season_factors (crop_id, month, factor)
SELECT id, m, f FROM crops
  JOIN (
    SELECT 2 AS m, 1.1 AS f UNION ALL
    SELECT 3, 1.3 UNION ALL
    SELECT 4, 1.4 UNION ALL
    SELECT 5, 1.3 UNION ALL
    SELECT 6, 1.1 UNION ALL
    SELECT 8, 0.8 UNION ALL
    SELECT 9, 0.7 UNION ALL
    SELECT 10, 0.7 UNION ALL
    SELECT 11, 0.8
  ) AS v
WHERE crops.name_th = 'มะม่วง'
ON DUPLICATE KEY UPDATE factor = VALUES(factor);

-- ทุเรียน (Durian): peak Apr–Jun, off-season Nov–Feb  (OAE ภาคตะวันออก)
INSERT INTO crop_season_factors (crop_id, month, factor)
SELECT id, m, f FROM crops
  JOIN (
    SELECT 3 AS m, 1.2 AS f UNION ALL
    SELECT 4, 1.4 UNION ALL
    SELECT 5, 1.5 UNION ALL
    SELECT 6, 1.3 UNION ALL
    SELECT 7, 1.1 UNION ALL
    SELECT 11, 0.7 UNION ALL
    SELECT 12, 0.7 UNION ALL
    SELECT 1, 0.7 UNION ALL
    SELECT 2, 0.7
  ) AS v
WHERE crops.name_th = 'ทุเรียน'
ON DUPLICATE KEY UPDATE factor = VALUES(factor);

-- ลำไย (Longan): peak Jul–Sep, off-season Dec–Mar  (OAE ภาคเหนือ)
INSERT INTO crop_season_factors (crop_id, month, factor)
SELECT id, m, f FROM crops
  JOIN (
    SELECT 6 AS m, 1.1 AS f UNION ALL
    SELECT 7, 1.4 UNION ALL
    SELECT 8, 1.5 UNION ALL
    SELECT 9, 1.4 UNION ALL
    SELECT 10, 1.1 UNION ALL
    SELECT 12, 0.6 UNION ALL
    SELECT 1, 0.6 UNION ALL
    SELECT 2, 0.6 UNION ALL
    SELECT 3, 0.7
  ) AS v
WHERE crops.name_th = 'ลำไย'
ON DUPLICATE KEY UPDATE factor = VALUES(factor);

-- เงาะ (Rambutan): peak May–Aug, off-season Jan–Mar  (OAE ภาคตะวันออก)
INSERT INTO crop_season_factors (crop_id, month, factor)
SELECT id, m, f FROM crops
  JOIN (
    SELECT 4 AS m, 1.1 AS f UNION ALL
    SELECT 5, 1.3 UNION ALL
    SELECT 6, 1.4 UNION ALL
    SELECT 7, 1.3 UNION ALL
    SELECT 8, 1.1 UNION ALL
    SELECT 1, 0.7 UNION ALL
    SELECT 2, 0.7 UNION ALL
    SELECT 3, 0.7
  ) AS v
WHERE crops.name_th = 'เงาะ'
ON DUPLICATE KEY UPDATE factor = VALUES(factor);

-- ส้มโอ (Pomelo): peak Aug–Dec, off-season Mar–Jun  (OAE ภาคกลาง)
INSERT INTO crop_season_factors (crop_id, month, factor)
SELECT id, m, f FROM crops
  JOIN (
    SELECT 8 AS m, 1.2 AS f UNION ALL
    SELECT 9, 1.3 UNION ALL
    SELECT 10, 1.4 UNION ALL
    SELECT 11, 1.3 UNION ALL
    SELECT 12, 1.2 UNION ALL
    SELECT 3, 0.8 UNION ALL
    SELECT 4, 0.7 UNION ALL
    SELECT 5, 0.7 UNION ALL
    SELECT 6, 0.8
  ) AS v
WHERE crops.name_th = 'ส้มโอ'
ON DUPLICATE KEY UPDATE factor = VALUES(factor);

-- น้อยหน่า (Custard apple): peak Jul–Oct, low Jan–Apr  (OAE ภาคกลาง)
INSERT INTO crop_season_factors (crop_id, month, factor)
SELECT id, m, f FROM crops
  JOIN (
    SELECT 7 AS m, 1.2 AS f UNION ALL
    SELECT 8, 1.3 UNION ALL
    SELECT 9, 1.3 UNION ALL
    SELECT 10, 1.2 UNION ALL
    SELECT 1, 0.7 UNION ALL
    SELECT 2, 0.7 UNION ALL
    SELECT 3, 0.8 UNION ALL
    SELECT 4, 0.8
  ) AS v
WHERE crops.name_th = 'น้อยหน่า'
ON DUPLICATE KEY UPDATE factor = VALUES(factor);
