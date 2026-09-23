export type DonorTier = 'volunteer' | 'trusted_volunteer' | 'verified_org';
export type DonationAudience = 'verified_org_only' | 'all_donors';

/** Config for Phase 6.1b — mirrored in docs/DECISIONS.md D019 */
export const DONOR_CONFIG = {
  volunteerWeeklyKg: 10,
  trustedVolunteerWeeklyKg: 30,
  verifiedOrgKgPerBeneficiary: 0.5,
  trustedPromotePasses: 5,
  suspendFailCount: 3,
  suspendWindowDays: 60,
  proofDeadlineHours: 48,
  orgDocMaxBytes: 5 * 1024 * 1024,
  orgDocMaxFiles: 3,
  orgDocAllowedMimes: ['application/pdf', 'image/jpeg', 'image/png'] as const,
} as const;

export function weeklyCapKg(tier: DonorTier, beneficiaryCount: number | null): number {
  if (tier === 'volunteer') {
    return DONOR_CONFIG.volunteerWeeklyKg;
  }
  if (tier === 'trusted_volunteer') {
    return DONOR_CONFIG.trustedVolunteerWeeklyKg;
  }
  const count = beneficiaryCount ?? 0;
  return Math.max(0, count * DONOR_CONFIG.verifiedOrgKgPerBeneficiary);
}

export function canBookDonationAudience(tier: DonorTier, audience: DonationAudience): boolean {
  if (audience === 'all_donors') {
    return true;
  }
  return tier === 'verified_org';
}

export function remainingWeeklyKg(capKg: number, usedKg: number): number {
  return Math.max(0, round1(capKg - usedKg));
}

export function shouldPromoteToTrusted(passCount: number): boolean {
  return passCount >= DONOR_CONFIG.trustedPromotePasses;
}

export function shouldSuspend(failCountInWindow: number): boolean {
  return failCountInWindow >= DONOR_CONFIG.suspendFailCount;
}

export function proofDueAt(deliveredAt: Date): Date {
  return new Date(deliveredAt.getTime() + DONOR_CONFIG.proofDeadlineHours * 60 * 60 * 1000);
}

/** Bangkok calendar week start (Monday 00:00 ICT) as UTC Date */
export function weekStartBangkok(now = new Date()): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const weekday = parts.weekday; // Mon, Tue, ...
  const weekdayIndex: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = weekdayIndex[weekday ?? 'Mon'] ?? 0;
  // Approximate: build UTC instant for Bangkok midnight of (day - offset)
  const bangkokMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0) - 7 * 60 * 60 * 1000;
  return new Date(bangkokMidnightAsUtc - offset * 24 * 60 * 60 * 1000);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
