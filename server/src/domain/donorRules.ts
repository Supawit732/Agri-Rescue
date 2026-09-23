export type DonorTier = 'volunteer' | 'trusted_volunteer' | 'verified_org';
export type DonationAudience = 'verified_org_only' | 'all_donors';
export type OrgStatus = 'none' | 'draft' | 'pending' | 'approved' | 'rejected' | 'needs_more_info';

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
  orgDocMaxFiles: 10,
  orgDocAllowedMimes: ['application/pdf', 'image/jpeg', 'image/png'] as const,
} as const;

export const ORG_REVIEW_QUICK_REASONS = [
  'ขอหนังสือรับรองฉบับล่าสุด',
  'เอกสารไม่ชัด',
  'ชื่อองค์กรไม่ตรงกับเอกสาร',
] as const;

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

/** Active donation tier — draft/pending/rejected/needs_more_info orgs have no donate rights. */
export function activeDonorTier(input: {
  donor_tier: DonorTier | null;
  org_status: OrgStatus | string | null | undefined;
}): DonorTier | null {
  const status = input.org_status ?? 'none';
  if (
    status === 'draft' ||
    status === 'pending' ||
    status === 'rejected' ||
    status === 'needs_more_info'
  ) {
    return null;
  }
  if (input.donor_tier === 'verified_org' && status !== 'approved') {
    return null;
  }
  return input.donor_tier;
}

export function canBookDonationAudience(tier: DonorTier, audience: DonationAudience): boolean {
  if (audience === 'all_donors') {
    return tier === 'verified_org' || tier === 'volunteer' || tier === 'trusted_volunteer';
  }
  return tier === 'verified_org';
}

export type DonationBlockReason =
  | 'lot_closed'
  | 'not_registered'
  | 'pending_org'
  | 'draft_org'
  | 'needs_more_info'
  | 'rejected_org'
  | 'suspended'
  | 'audience'
  | 'over_cap';

export function donationBlockMessage(reason: DonationBlockReason, remainingKg?: number, capKg?: number): string {
  switch (reason) {
    case 'lot_closed':
      return 'ล็อตนี้ไม่เปิดรับบริจาค';
    case 'not_registered':
      return 'ต้องเป็นผู้รับบริจาคที่ลงทะเบียนแล้ว';
    case 'pending_org':
      return 'รอการอนุมัติองค์กร';
    case 'draft_org':
      return 'กรุณากรอกคำขอรับบริจาคให้ครบก่อน';
    case 'needs_more_info':
      return 'ต้องส่งเอกสารเพิ่มก่อนขอรับบริจาค';
    case 'rejected_org':
      return 'คำขอองค์กรถูกปฏิเสธ กรุณาสมัครใหม่';
    case 'suspended':
      return 'สิทธิ์รับบริจาคถูกระงับ กรุณาติดต่อผู้ดูแล';
    case 'audience':
      return 'ล็อตนี้เปิดรับเฉพาะองค์กรที่ยืนยันแล้ว';
    case 'over_cap':
      return `เกินเพดานสัปดาห์นี้ คงเหลือ ${remainingKg ?? 0} กก. จากเพดาน ${capKg ?? 0} กก.`;
  }
}

export function evaluateDonationRequest(input: {
  allowDonation: boolean;
  audience: DonationAudience;
  lotWeightKg: number;
  usedKg: number;
  donor_tier: DonorTier | null;
  org_status: OrgStatus | string | null | undefined;
  donation_suspended: boolean | number;
  beneficiary_count: number | null;
}): { ok: true; tier: DonorTier; capKg: number; remainingKg: number } | { ok: false; reason: DonationBlockReason; message: string } {
  if (!input.allowDonation) {
    return { ok: false, reason: 'lot_closed', message: donationBlockMessage('lot_closed') };
  }
  if (Number(input.donation_suspended) === 1) {
    return { ok: false, reason: 'suspended', message: donationBlockMessage('suspended') };
  }
  const orgStatus = (input.org_status ?? 'none') as OrgStatus;
  if (orgStatus === 'draft') {
    return { ok: false, reason: 'draft_org', message: donationBlockMessage('draft_org') };
  }
  if (orgStatus === 'pending') {
    return { ok: false, reason: 'pending_org', message: donationBlockMessage('pending_org') };
  }
  if (orgStatus === 'needs_more_info') {
    return { ok: false, reason: 'needs_more_info', message: donationBlockMessage('needs_more_info') };
  }
  if (orgStatus === 'rejected') {
    return { ok: false, reason: 'rejected_org', message: donationBlockMessage('rejected_org') };
  }
  const tier = activeDonorTier({ donor_tier: input.donor_tier, org_status: orgStatus });
  if (tier === null) {
    return { ok: false, reason: 'not_registered', message: donationBlockMessage('not_registered') };
  }
  if (!canBookDonationAudience(tier, input.audience)) {
    return { ok: false, reason: 'audience', message: donationBlockMessage('audience') };
  }
  const capKg = weeklyCapKg(tier, input.beneficiary_count);
  const remainingKg = remainingWeeklyKg(capKg, input.usedKg);
  if (input.lotWeightKg > remainingKg) {
    return {
      ok: false,
      reason: 'over_cap',
      message: donationBlockMessage('over_cap', remainingKg, capKg),
    };
  }
  return { ok: true, tier, capKg, remainingKg };
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
