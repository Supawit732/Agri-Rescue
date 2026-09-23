-- Phase 6.1b: donor verification tiers, org docs, donation audience, proofs

ALTER TABLE buyer_profiles
  ADD COLUMN donor_tier ENUM('volunteer', 'trusted_volunteer', 'verified_org') NULL AFTER charity_approved,
  ADD COLUMN beneficiary_count INT NULL AFTER donor_tier,
  ADD COLUMN distribution_mode ENUM('self_use', 'redistribute') NULL AFTER beneficiary_count,
  ADD COLUMN donation_suspended TINYINT(1) NOT NULL DEFAULT 0 AFTER distribution_mode,
  ADD COLUMN trusted_proof_count INT NOT NULL DEFAULT 0 AFTER donation_suspended,
  ADD COLUMN org_name VARCHAR(255) NULL AFTER trusted_proof_count,
  ADD COLUMN org_type ENUM('foundation', 'association', 'shelter', 'community_kitchen', 'other') NULL AFTER org_name,
  ADD COLUMN contact_name VARCHAR(255) NULL AFTER org_type,
  ADD COLUMN contact_title VARCHAR(128) NULL AFTER contact_name,
  ADD COLUMN contact_phone VARCHAR(32) NULL AFTER contact_title,
  ADD COLUMN org_lat DOUBLE NULL AFTER contact_phone,
  ADD COLUMN org_lng DOUBLE NULL AFTER org_lat,
  ADD COLUMN org_status ENUM('none', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'none' AFTER org_lng,
  ADD COLUMN org_reject_reason VARCHAR(512) NULL AFTER org_status,
  ADD COLUMN org_reviewed_at DATETIME NULL AFTER org_reject_reason;

UPDATE buyer_profiles
SET donor_tier = 'verified_org',
    org_status = 'approved',
    distribution_mode = 'redistribute',
    beneficiary_count = COALESCE(beneficiary_count, 40),
    org_name = COALESCE(org_name, 'องค์กรจากบัญชีสงเคราะห์เดิม'),
    org_type = COALESCE(org_type, 'shelter'),
    org_reviewed_at = UTC_TIMESTAMP()
WHERE buyer_type = 'charity' AND charity_approved = 1;

UPDATE buyer_profiles
SET org_status = 'pending',
    donor_tier = NULL
WHERE buyer_type = 'charity' AND charity_approved = 0;

CREATE TABLE IF NOT EXISTS org_application_docs (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime VARCHAR(64) NOT NULL,
  size_bytes INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_org_docs_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE harvest_lots
  ADD COLUMN donation_audience ENUM('verified_org_only', 'all_donors') NOT NULL DEFAULT 'verified_org_only'
    AFTER allow_donation;

ALTER TABLE orders
  ADD COLUMN distribution_place VARCHAR(512) NULL AFTER drop_otp,
  ADD COLUMN distribution_at DATETIME NULL AFTER distribution_place;

CREATE TABLE IF NOT EXISTS donation_proofs (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  due_at DATETIME NOT NULL,
  submitted_at DATETIME NULL,
  stored_name VARCHAR(255) NULL,
  subject_match TINYINT(1) NULL,
  status ENUM('pending', 'passed', 'failed', 'missed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_donation_proofs_order (order_id),
  KEY idx_donation_proofs_due (status, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donation_infractions (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  order_id INT NULL,
  reason ENUM('missed_deadline', 'subject_mismatch') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_infractions_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
