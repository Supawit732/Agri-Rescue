-- Add created_at to crops for admin inbox ordering
ALTER TABLE crops
  ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
