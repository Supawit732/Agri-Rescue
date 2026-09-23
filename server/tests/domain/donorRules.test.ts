import {
  canBookDonationAudience,
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

  it('promotes and suspends at configured thresholds', () => {
    expect(shouldPromoteToTrusted(4)).toBe(false);
    expect(shouldPromoteToTrusted(5)).toBe(true);
    expect(shouldSuspend(2)).toBe(false);
    expect(shouldSuspend(3)).toBe(true);
  });
});
