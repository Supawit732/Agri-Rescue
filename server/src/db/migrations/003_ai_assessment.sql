ALTER TABLE quality_assessments
  ADD COLUMN ai_ripeness TINYINT NULL,
  ADD COLUMN ai_confidence DECIMAL(4, 3) NULL,
  ADD COLUMN ai_model VARCHAR(128) NULL;
