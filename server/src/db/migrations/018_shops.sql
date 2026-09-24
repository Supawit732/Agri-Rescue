-- PR B: seller shop profiles + follows (no FK / VIEW)
CREATE TABLE IF NOT EXISTS shops (
  user_id INT NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  avatar VARCHAR(1024) NULL,
  cover VARCHAR(1024) NULL,
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_follows (
  user_id INT NOT NULL,
  shop_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, shop_id),
  KEY idx_shop_follows_shop_id (shop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
