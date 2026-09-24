-- 6.4 slim: pickup appointment window on each order
ALTER TABLE orders
  ADD COLUMN pickup_slot_start DATETIME NULL,
  ADD COLUMN pickup_slot_end DATETIME NULL,
  ADD KEY idx_orders_pickup_slot_start (pickup_slot_start);
