-- 6.5 mock payment (simplified, sandbox-only — no real payment gateway)
CREATE TABLE IF NOT EXISTS payments (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'paid', 'expired', 'refunded') NOT NULL DEFAULT 'pending',
  provider VARCHAR(32) NOT NULL DEFAULT 'mock',
  provider_ref VARCHAR(255) NULL,
  deadline_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_order_id (order_id),
  KEY idx_payments_status_deadline (status, deadline_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
