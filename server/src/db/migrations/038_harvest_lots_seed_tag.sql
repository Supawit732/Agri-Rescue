-- Dedicated tracking column for rows created by `npm run seed:demo`, so seed:demo no longer
-- needs to borrow harvest_lots.photo_url (its old 'seed:demo' marker) and demo lots can carry
-- a real crop photo in photo_url like every other lot.
ALTER TABLE harvest_lots
  ADD COLUMN seed_tag VARCHAR(32) NULL,
  ADD KEY idx_harvest_lots_seed_tag (seed_tag);
