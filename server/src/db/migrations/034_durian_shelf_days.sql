-- Durian base_shelf_days was set too low (3 days). UC Davis Postharvest Research &
-- Extension Center notes mature-unripe durian ripens in ~4-6 days at ambient temperature
-- plus a short ripe window before spoiling: https://postharvest.ucdavis.edu/produce-facts-sheets/durian
UPDATE crops SET base_shelf_days = 7 WHERE name_th = 'ทุเรียน';
