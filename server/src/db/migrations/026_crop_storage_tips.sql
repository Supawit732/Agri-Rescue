-- 6.9: post-delivery storage advice (approx values seeded in code, sources in docs/crop-sources.md)
ALTER TABLE crops
  ADD COLUMN storage_tip_th VARCHAR(512) NULL,
  ADD COLUMN storage_tip_en VARCHAR(512) NULL,
  ADD COLUMN fridge_ok TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN fridge_extra_days INT NOT NULL DEFAULT 0;
