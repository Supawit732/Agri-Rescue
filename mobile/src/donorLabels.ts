import type {
  ApplicationKind,
  DonorTier,
  OrgStatus,
  OrgType,
  RecipientGroup,
} from './api/types';

export type DistributionModeLabel = 'self_use' | 'redistribute';

export const ORG_STATUS_TH: Record<OrgStatus, string> = {
  none: 'ยังไม่มีคำขอ',
  draft: 'ร่าง',
  pending: 'รอตรวจ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ถูกปฏิเสธ',
  needs_more_info: 'ขอข้อมูลเพิ่ม',
};

export const APPLICATION_KIND_TH: Record<ApplicationKind, string> = {
  individual: 'บุคคล (จิตอาสา)',
  organization: 'องค์กร',
};

export const ORG_TYPE_TH: Record<OrgType, string> = {
  foundation: 'มูลนิธิ',
  association: 'สมาคม',
  shelter: 'สถานสงเคราะห์',
  community_kitchen: 'โรงครัวชุมชน',
  community_enterprise: 'วิสาหกิจชุมชน',
  other: 'อื่น ๆ',
};

export const RECIPIENT_GROUP_TH: Record<RecipientGroup, string> = {
  elderly: 'ผู้สูงอายุ',
  children: 'เด็ก',
  community: 'ชุมชน',
  temple: 'วัด',
  other: 'อื่น ๆ',
};

export const DISTRIBUTION_MODE_TH: Record<DistributionModeLabel, string> = {
  self_use: 'ใช้เอง',
  redistribute: 'แจกจ่ายต่อ',
};

export const DONOR_TIER_TH: Record<DonorTier, string> = {
  volunteer: 'จิตอาสา',
  trusted_volunteer: 'จิตอาสาที่เชื่อถือ',
  verified_org: 'องค์กรที่ยืนยันแล้ว',
};

export const REVIEW_ACTION_TH: Record<string, string> = {
  approved: 'อนุมัติ',
  rejected: 'ปฏิเสธ',
  needs_more_info: 'ขอข้อมูลเพิ่ม',
  checklist_saved: 'บันทึก checklist',
  withdrawn: 'ถอนคำขอ',
};

export function labelOrgStatus(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return ORG_STATUS_TH[value as OrgStatus] ?? value;
}

export function labelApplicationKind(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return APPLICATION_KIND_TH[value as ApplicationKind] ?? value;
}

export function labelOrgType(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return ORG_TYPE_TH[value as OrgType] ?? value;
}

export function labelRecipientGroups(values: string[] | null | undefined): string {
  if (values === null || values === undefined || values.length === 0) {
    return '—';
  }
  return values.map((v) => RECIPIENT_GROUP_TH[v as RecipientGroup] ?? v).join(', ');
}

export function labelDistributionMode(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return DISTRIBUTION_MODE_TH[value as DistributionModeLabel] ?? value;
}

export function labelDonorTier(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return DONOR_TIER_TH[value as DonorTier] ?? value;
}

export function labelReviewAction(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return REVIEW_ACTION_TH[value] ?? value;
}

export const OPEN_ORG_STATUSES = new Set(['draft', 'pending', 'needs_more_info']);
