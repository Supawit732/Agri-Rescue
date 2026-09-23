import {
  activeDonorTier,
  canBookDonationAudience,
  evaluateDonationRequest,
  remainingWeeklyKg,
  shouldPromoteToTrusted,
  shouldSuspend,
  weeklyCapKg,
} from '../../src/domain/donorRules';

describe('donorRules', () => {
  it('computes weekly caps per tier', () => {
    expect(weeklyCapKg('volunteer', null)).toBe(10);
    expect(weeklyCapKg('trusted_volunteer', null)).toBe(30);
    expect(weeklyCapKg('verified_org', 40)).toBe(20);
    expect(remainingWeeklyKg(10, 4)).toBe(6);
  });

  it('gates donation audience by tier', () => {
    expect(canBookDonationAudience('volunteer', 'all_donors')).toBe(true);
    expect(canBookDonationAudience('volunteer', 'verified_org_only')).toBe(false);
    expect(canBookDonationAudience('trusted_volunteer', 'verified_org_only')).toBe(false);
    expect(canBookDonationAudience('verified_org', 'verified_org_only')).toBe(true);
  });

  it('treats pending org as ineligible even if tier was set', () => {
    expect(activeDonorTier({ donor_tier: 'verified_org', org_status: 'pending' })).toBeNull();
    expect(activeDonorTier({ donor_tier: 'volunteer', org_status: 'needs_more_info' })).toBeNull();
    expect(activeDonorTier({ donor_tier: 'volunteer', org_status: 'draft' })).toBeNull();
    expect(activeDonorTier({ donor_tier: 'verified_org', org_status: 'approved' })).toBe('verified_org');
  });

  it('blocks draft org in evaluateDonationRequest', () => {
    const draft = evaluateDonationRequest({
      allowDonation: true,
      audience: 'all_donors',
      lotWeightKg: 1,
      usedKg: 0,
      donor_tier: null,
      org_status: 'draft',
      donation_suspended: false,
      beneficiary_count: null,
    });
    expect(draft.ok).toBe(false);
    if (!draft.ok) {
      expect(draft.reason).toBe('draft_org');
    }
  });

  it('blocks pending org and over-cap in evaluateDonationRequest', () => {
    expect(
      evaluateDonationRequest({
        allowDonation: true,
        audience: 'verified_org_only',
        lotWeightKg: 5,
        usedKg: 0,
        donor_tier: null,
        org_status: 'pending',
        donation_suspended: false,
        beneficiary_count: 40,
      }).ok,
    ).toBe(false);

    expect(
      evaluateDonationRequest({
        allowDonation: false,
        audience: 'all_donors',
        lotWeightKg: 1,
        usedKg: 0,
        donor_tier: 'volunteer',
        org_status: 'none',
        donation_suspended: false,
        beneficiary_count: null,
      }).ok,
    ).toBe(false);

    expect(
      evaluateDonationRequest({
        allowDonation: true,
        audience: 'all_donors',
        lotWeightKg: 1,
        usedKg: 0,
        donor_tier: 'volunteer',
        org_status: 'none',
        donation_suspended: 1,
        beneficiary_count: null,
      }).ok,
    ).toBe(false);

    expect(
      evaluateDonationRequest({
        allowDonation: true,
        audience: 'all_donors',
        lotWeightKg: 1,
        usedKg: 0,
        donor_tier: null,
        org_status: 'needs_more_info',
        donation_suspended: false,
        beneficiary_count: null,
      }).ok,
    ).toBe(false);

    expect(
      evaluateDonationRequest({
        allowDonation: true,
        audience: 'all_donors',
        lotWeightKg: 1,
        usedKg: 0,
        donor_tier: null,
        org_status: 'rejected',
        donation_suspended: false,
        beneficiary_count: null,
      }).ok,
    ).toBe(false);

    expect(
      evaluateDonationRequest({
        allowDonation: true,
        audience: 'all_donors',
        lotWeightKg: 1,
        usedKg: 0,
        donor_tier: null,
        org_status: 'none',
        donation_suspended: false,
        beneficiary_count: null,
      }).ok,
    ).toBe(false);

    expect(
      evaluateDonationRequest({
        allowDonation: true,
        audience: 'verified_org_only',
        lotWeightKg: 5,
        usedKg: 0,
        donor_tier: 'verified_org',
        org_status: 'approved',
        donation_suspended: false,
        beneficiary_count: 40,
      }).ok,
    ).toBe(true);

    expect(canBookDonationAudience('trusted_volunteer', 'all_donors')).toBe(true);
    expect(canBookDonationAudience('verified_org', 'all_donors')).toBe(true);
    expect(activeDonorTier({ donor_tier: 'verified_org', org_status: 'none' })).toBeNull();
    expect(activeDonorTier({ donor_tier: null, org_status: undefined })).toBeNull();

    const over = evaluateDonationRequest({
      allowDonation: true,
      audience: 'all_donors',
      lotWeightKg: 8,
      usedKg: 5,
      donor_tier: 'volunteer',
      org_status: 'none',
      donation_suspended: false,
      beneficiary_count: null,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.reason).toBe('over_cap');
      expect(over.message).toContain('เพดาน');
    }
  });

  it('promotes and suspends at configured thresholds', () => {
    expect(shouldPromoteToTrusted(4)).toBe(false);
    expect(shouldPromoteToTrusted(5)).toBe(true);
    expect(shouldSuspend(2)).toBe(false);
    expect(shouldSuspend(3)).toBe(true);
  });
});
