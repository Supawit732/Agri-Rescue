-- Phase 6.1c: DIT reference prices, seller pricing, sale modes, crop features, lot edits

ALTER TABLE crops
  ADD COLUMN dit_product_code VARCHAR(32) NULL AFTER market_price_per_kg,
  ADD COLUMN dit_unit VARCHAR(64) NULL AFTER dit_product_code,
  ADD COLUMN dit_unit_to_kg DOUBLE NULL AFTER dit_unit,
  ADD COLUMN normal_features_th TEXT NULL AFTER dit_unit_to_kg,
  ADD COLUMN defect_examples_th TEXT NULL AFTER normal_features_th;

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
  PRIMARY KEY (id),
  UNIQUE KEY uq_crop_ref_price_day (crop_id, date, product_code),
  KEY idx_crop_ref_prices_crop_date (crop_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE harvest_lots
  ADD COLUMN start_price_per_kg DECIMAL(12, 2) NULL AFTER donation_audience,
  ADD COLUMN floor_price_per_kg DECIMAL(12, 2) NULL AFTER start_price_per_kg,
  ADD COLUMN sale_mode ENUM('sell', 'donate', 'sell_then_donate') NOT NULL DEFAULT 'sell' AFTER floor_price_per_kg,
  ADD COLUMN donation_opened TINYINT(1) NOT NULL DEFAULT 0 AFTER sale_mode,
  ADD COLUMN market_price_snapshot DECIMAL(12, 2) NULL AFTER donation_opened,
  ADD COLUMN market_price_is_estimate TINYINT(1) NOT NULL DEFAULT 1 AFTER market_price_snapshot,
  ADD COLUMN market_price_as_of DATE NULL AFTER market_price_is_estimate;

UPDATE harvest_lots
SET sale_mode = CASE WHEN allow_donation = 1 THEN 'sell_then_donate' ELSE 'sell' END,
    donation_opened = 0;

UPDATE harvest_lots h
JOIN crops c ON c.id = h.crop_id
SET h.market_price_snapshot = c.market_price_per_kg,
    h.market_price_is_estimate = 1,
    h.start_price_per_kg = ROUND(
      c.market_price_per_kg * CASE WHEN h.grade = 'substandard' THEN 0.7 ELSE 1 END,
      2
    ),
    h.floor_price_per_kg = ROUND(
      c.market_price_per_kg * CASE WHEN h.grade = 'substandard' THEN 0.7 ELSE 1 END * 0.3,
      2
    );

CREATE TABLE IF NOT EXISTS lot_edit_logs (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  editor_id INT NOT NULL,
  field_name VARCHAR(64) NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lot_edit_logs_lot (lot_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY idx_dit_suggestions_crop (crop_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
