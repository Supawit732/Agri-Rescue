-- Phase 6.1e: split lots — partial booking by quantity_kg

ALTER TABLE harvest_lots
  ADD COLUMN split_allowed TINYINT(1) NOT NULL DEFAULT 1 AFTER weight_kg,
  ADD COLUMN min_order_kg DECIMAL(10, 2) NOT NULL DEFAULT 1 AFTER split_allowed,
  ADD COLUMN order_step_kg DECIMAL(10, 2) NOT NULL DEFAULT 1 AFTER min_order_kg;

ALTER TABLE harvest_lots
  MODIFY COLUMN status
    ENUM(
      'open',
      'reserved',
      'partially_reserved',
      'fully_reserved',
      'picked',
      'delivered',
      'expired',
      'cancelled'
    ) NOT NULL DEFAULT 'open';

UPDATE harvest_lots SET status = 'fully_reserved' WHERE status = 'reserved';

ALTER TABLE harvest_lots
  MODIFY COLUMN status
    ENUM(
      'open',
      'partially_reserved',
      'fully_reserved',
      'picked',
      'delivered',
      'expired',
      'cancelled'
    ) NOT NULL DEFAULT 'open';

ALTER TABLE orders
  ADD COLUMN quantity_kg DECIMAL(10, 2) NULL AFTER lot_id;

UPDATE orders o
JOIN harvest_lots h ON h.id = o.lot_id
SET o.quantity_kg = h.weight_kg
WHERE o.quantity_kg IS NULL;

ALTER TABLE orders
  MODIFY COLUMN quantity_kg DECIMAL(10, 2) NOT NULL;
