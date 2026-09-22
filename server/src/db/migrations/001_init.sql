CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('farmer', 'buyer', 'driver', 'coordinator') NOT NULL,
  buyer_type ENUM('vendor', 'shop', 'charity') NULL,
  lat DOUBLE NULL,
  lng DOUBLE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crops (
  id INT NOT NULL AUTO_INCREMENT,
  name_th VARCHAR(255) NOT NULL,
  base_shelf_days INT NOT NULL,
  market_price_per_kg DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plots (
  id INT NOT NULL AUTO_INCREMENT,
  farmer_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  area_rai DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_plots_farmer_id (farmer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS harvest_lots (
  id INT NOT NULL AUTO_INCREMENT,
  plot_id INT NOT NULL,
  crop_id INT NOT NULL,
  weight_kg DECIMAL(10, 2) NOT NULL,
  grade ENUM('normal', 'substandard') NOT NULL,
  ripeness TINYINT NOT NULL,
  photo_url VARCHAR(1024) NULL,
  allow_donation TINYINT(1) NOT NULL DEFAULT 0,
  predicted_shelf_hours INT NOT NULL,
  expires_at DATETIME NOT NULL,
  status ENUM('open', 'reserved', 'picked', 'delivered', 'expired', 'cancelled') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_harvest_lots_plot_id (plot_id),
  KEY idx_harvest_lots_crop_id (crop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quality_assessments (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  method ENUM('rule', 'model') NOT NULL,
  ripeness TINYINT NOT NULL,
  temp_c DECIMAL(5, 2) NOT NULL,
  humidity DECIMAL(5, 2) NOT NULL,
  predicted_shelf_hours INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quality_assessments_lot_id (lot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS batches (
  id INT NOT NULL AUTO_INCREMENT,
  driver_id INT NULL,
  status ENUM('planned', 'in_progress', 'completed') NOT NULL,
  planned_km DECIMAL(10, 2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_batches_driver_id (driver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id INT NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  buyer_id INT NOT NULL,
  agreed_price_per_kg DECIMAL(10, 2) NOT NULL,
  is_donation TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('reserved', 'picked', 'delivered', 'cancelled') NOT NULL,
  batch_id INT NULL,
  drop_otp CHAR(4) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_orders_lot_id (lot_id),
  KEY idx_orders_buyer_id (buyer_id),
  KEY idx_orders_batch_id (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_stops (
  id INT NOT NULL AUTO_INCREMENT,
  batch_id INT NOT NULL,
  seq INT NOT NULL,
  stop_type ENUM('pickup', 'drop') NOT NULL,
  lot_id INT NULL,
  buyer_id INT NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  leg_km DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'done') NOT NULL DEFAULT 'pending',
  confirmed_weight_kg DECIMAL(10, 2) NULL,
  proof_photo_url VARCHAR(1024) NULL,
  weight_flag TINYINT(1) NOT NULL DEFAULT 0,
  confirmed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_route_stops_batch_id (batch_id),
  KEY idx_route_stops_lot_id (lot_id),
  KEY idx_route_stops_buyer_id (buyer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS impact_logs (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  kg_saved DECIMAL(10, 2) NOT NULL,
  co2e_kg DECIMAL(10, 2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_impact_logs_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
