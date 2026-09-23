-- Phase 6.1b follow-up: org review statuses, history logs, higher doc cap

ALTER TABLE buyer_profiles
  MODIFY COLUMN org_status ENUM('none', 'pending', 'approved', 'rejected', 'needs_more_info')
    NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS org_review_logs (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  admin_id INT NOT NULL,
  action ENUM('approved', 'rejected', 'needs_more_info') NOT NULL,
  reason VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_org_review_logs_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
