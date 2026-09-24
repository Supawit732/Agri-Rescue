-- Demo prep: soft-delete lots + delete audit log
ALTER TABLE harvest_lots
  ADD COLUMN deleted_at DATETIME NULL AFTER created_at;

CREATE TABLE IF NOT EXISTS lot_delete_logs (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  farmer_id INT NOT NULL,
  reason VARCHAR(255) NULL,
  snapshot_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lot_delete_logs_lot_id (lot_id),
  KEY idx_lot_delete_logs_farmer_id (farmer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
