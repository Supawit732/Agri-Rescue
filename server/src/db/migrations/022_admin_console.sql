-- Admin Console: segregation of duties + cleanup stuck individual apps + seed name
-- Do NOT edit prior migrations; apply to existing data.

-- 1) Admin accounts must not buy or sell
UPDATE users SET can_sell = 0, can_buy = 0 WHERE is_admin = 1;

-- 2) Demo admin account name
UPDATE users SET name = 'admin' WHERE phone = '0800000005';

-- 3) Stuck individual donor applications → approved volunteer (org queue stays org-only)
UPDATE buyer_profiles
SET org_status = 'approved',
    donor_tier = 'volunteer',
    application_kind = 'individual',
    draft_step = NULL,
    org_reject_reason = NULL,
    requested_fields_json = NULL
WHERE application_kind = 'individual'
  AND org_status IN ('pending', 'needs_more_info');
