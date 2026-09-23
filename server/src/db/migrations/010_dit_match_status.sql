-- Phase 6.1c: store matched product name + price fetch status for admin

ALTER TABLE crops
  ADD COLUMN dit_product_name VARCHAR(255) NULL AFTER dit_product_code,
  ADD COLUMN dit_price_status VARCHAR(255) NULL AFTER dit_match_source;
