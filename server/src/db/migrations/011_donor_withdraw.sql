-- Phase 6.1d follow-up: allow self-withdraw of open donor applications

ALTER TABLE org_review_logs
  MODIFY COLUMN action
    ENUM('approved', 'rejected', 'needs_more_info', 'checklist_saved', 'withdrawn') NOT NULL;
