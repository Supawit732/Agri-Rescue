-- Phase 6.2: lot photos for public market (no FK)

CREATE TABLE lot_photos (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  path VARCHAR(1024) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lot_photos_lot_id (lot_id)
);
