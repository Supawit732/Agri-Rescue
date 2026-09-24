-- English location labels for EN mode (D036)
ALTER TABLE plots
  ADD COLUMN subdistrict_en VARCHAR(128) NULL AFTER district_th,
  ADD COLUMN district_en VARCHAR(128) NULL AFTER subdistrict_en;

ALTER TABLE users
  ADD COLUMN subdistrict_en VARCHAR(128) NULL AFTER district_th,
  ADD COLUMN district_en VARCHAR(128) NULL AFTER subdistrict_en;
