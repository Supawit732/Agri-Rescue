-- Phase 6.2: lot photos for public market (no FK)
-- Numbered 015 because main already shipped 014_crop_name_en.

CREATE TABLE IF NOT EXISTS lot_photos (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  path VARCHAR(1024) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lot_photos_lot_id (lot_id)
);
