-- PR B: in-app notifications (title_key + params for i18n)
CREATE TABLE IF NOT EXISTS notifications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(64) NOT NULL,
  title_key VARCHAR(64) NOT NULL,
  params_json JSON NULL,
  link VARCHAR(512) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_user_id (user_id),
  KEY idx_notifications_user_unread (user_id, read_at),
  KEY idx_notifications_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
