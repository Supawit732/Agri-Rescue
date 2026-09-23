-- Phase 6.1d: donor application drafts, terms acceptance, formal org/individual fields

ALTER TABLE buyer_profiles
  MODIFY COLUMN org_status
    ENUM('none', 'draft', 'pending', 'approved', 'rejected', 'needs_more_info')
    NOT NULL DEFAULT 'none',
  MODIFY COLUMN org_type
    ENUM('foundation', 'association', 'shelter', 'community_kitchen', 'community_enterprise', 'other')
    NULL,
  ADD COLUMN application_kind ENUM('individual', 'organization') NULL AFTER org_status,
  ADD COLUMN contact_email VARCHAR(255) NULL AFTER contact_phone,
  ADD COLUMN registered TINYINT(1) NULL AFTER org_type,
  ADD COLUMN registration_number VARCHAR(64) NULL AFTER registered,
  ADD COLUMN registered_address VARCHAR(512) NULL AFTER registration_number,
  ADD COLUMN recipient_groups_json TEXT NULL AFTER beneficiary_count,
  ADD COLUMN purpose_th VARCHAR(512) NULL AFTER recipient_groups_json,
  ADD COLUMN redistribute_place VARCHAR(512) NULL AFTER distribution_mode,
  ADD COLUMN redistribute_frequency VARCHAR(128) NULL AFTER redistribute_place,
  ADD COLUMN donor_terms_version VARCHAR(32) NULL AFTER org_reviewed_at,
  ADD COLUMN donor_terms_accepted_at DATETIME NULL AFTER donor_terms_version,
  ADD COLUMN requested_fields_json TEXT NULL AFTER org_reject_reason,
  ADD COLUMN draft_step INT NULL AFTER application_kind;

ALTER TABLE org_application_docs
  ADD COLUMN doc_category
    ENUM('registration_cert', 'community_cert', 'site_photo', 'other')
    NOT NULL DEFAULT 'other'
    AFTER mime;

ALTER TABLE org_review_logs
  MODIFY COLUMN action
    ENUM('approved', 'rejected', 'needs_more_info', 'checklist_saved') NOT NULL,
  ADD COLUMN checklist_json TEXT NULL AFTER reason,
  ADD COLUMN requested_fields_json TEXT NULL AFTER checklist_json;
