-- Migration 031: Remove seasonal factor rows inserted by migration 030.
-- Migration 030 inserted factors via INSERT...SELECT FROM crops, but crops
-- are populated by seed (not migrate), so a fresh install gets empty data.
-- Additionally, migration 030 had the direction inverted (peak month got
-- factor > 1; correct direction is factor < 1 for peak = high supply = cheaper).
-- Corrected factors are inserted by seed.ts (idempotent, ON DUPLICATE KEY UPDATE).
DELETE FROM crop_season_factors;
