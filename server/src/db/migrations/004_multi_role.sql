-- Phase 6.1: multi-role capabilities + buyer_profiles

ALTER TABLE users
  ADD COLUMN can_sell TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash,
  ADD COLUMN can_buy TINYINT(1) NOT NULL DEFAULT 0 AFTER can_sell,
  ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER can_buy,
  ADD COLUMN line_id VARCHAR(64) NULL AFTER is_admin;

UPDATE users SET can_sell = 1 WHERE role = 'farmer';
UPDATE users SET can_buy = 1 WHERE role = 'buyer';
UPDATE users SET is_admin = 1 WHERE role = 'coordinator';
UPDATE users SET can_buy = 1 WHERE role = 'driver';

CREATE TABLE IF NOT EXISTS buyer_profiles (
  user_id INT NOT NULL,
  buyer_type ENUM('vendor', 'shop', 'charity') NOT NULL,
  charity_approved TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY idx_buyer_profiles_type (buyer_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO buyer_profiles (user_id, buyer_type, charity_approved)
SELECT id, buyer_type, 1
FROM users
WHERE buyer_type IS NOT NULL;

ALTER TABLE users DROP COLUMN buyer_type;
