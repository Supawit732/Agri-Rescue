-- Location labels from reverse geocode (tambon/amphoe) for market/shop display
ALTER TABLE plots
  ADD COLUMN subdistrict_th VARCHAR(128) NULL AFTER name,
  ADD COLUMN district_th VARCHAR(128) NULL AFTER subdistrict_th;

ALTER TABLE users
  ADD COLUMN subdistrict_th VARCHAR(128) NULL AFTER lng,
  ADD COLUMN district_th VARCHAR(128) NULL AFTER subdistrict_th;
