-- PR C: support tickets + messages (no FK / VIEW)
CREATE TABLE IF NOT EXISTS support_tickets (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  topic ENUM(
    'order_pickup',
    'item_mismatch',
    'account_login',
    'donation',
    'other'
  ) NOT NULL,
  topic_label VARCHAR(255) NULL,
  order_id INT NULL,
  status ENUM('open', 'in_progress', 'closed') NOT NULL DEFAULT 'open',
  reply_via ENUM('app', 'phone') NOT NULL DEFAULT 'app',
  has_new_reply TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_support_tickets_user_id (user_id),
  KEY idx_support_tickets_status (status),
  KEY idx_support_tickets_order_id (order_id),
  KEY idx_support_tickets_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_messages (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  sender_role ENUM('user', 'admin') NOT NULL,
  body VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_support_messages_ticket_id (ticket_id),
  KEY idx_support_messages_created (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_attachments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  message_id INT NULL,
  stored_name VARCHAR(512) NOT NULL,
  original_name VARCHAR(255) NULL,
  mime VARCHAR(128) NOT NULL,
  size_bytes INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_support_attachments_ticket_id (ticket_id),
  KEY idx_support_attachments_message_id (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
