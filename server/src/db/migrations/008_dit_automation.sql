-- Phase 6.1c follow-up: auto DIT match source + outlier price flags

ALTER TABLE crops
  ADD COLUMN dit_match_source ENUM('auto', 'manual') NULL AFTER dit_unit_to_kg;

ALTER TABLE crop_reference_prices
  ADD COLUMN rejected_as_outlier TINYINT(1) NOT NULL DEFAULT 0 AFTER fetched_at,
  ADD COLUMN outlier_baseline DECIMAL(12, 2) NULL AFTER rejected_as_outlier,
  ADD COLUMN outlier_ratio DECIMAL(12, 4) NULL AFTER outlier_baseline;
