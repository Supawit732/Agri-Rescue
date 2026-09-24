import type {
  ApplicationKind,
  DonorTier,
  OrgStatus,
  OrgType,
  RecipientGroup,
  User,
} from './api/types';
import type { Messages } from './i18n/types';

export type DistributionModeLabel = 'self_use' | 'redistribute';

export const OPEN_ORG_STATUSES = new Set(['draft', 'pending', 'needs_more_info']);

/** Account-tab donor status line (tier / org application / suspended). */
export function donorStatusLabel(
  user: Pick<User, 'donation_suspended' | 'donor_tier' | 'org_status'>,
  t: Messages,
): string {
  if (user.donation_suspended) {
    return t.account.donorSuspended;
  }
  if (user.donor_tier === 'verified_org') {
    return t.account.donorVerifiedOrg;
  }
  if (user.donor_tier === 'trusted_volunteer') {
    return t.account.donorTrustedVolunteer;
  }
  if (user.donor_tier === 'volunteer') {
    return t.account.donorVolunteer;
  }
  if (user.org_status === 'pending') {
    return t.account.donorPending;
  }
  if (user.org_status === 'needs_more_info') {
    return t.account.donorNeedsInfo;
  }
  if (user.org_status === 'draft') {
    return t.account.donorDraft;
  }
  if (user.org_status === 'rejected') {
    return t.account.donorRejected;
  }
  return t.account.donorNone;
}

export function labelOrgStatus(value: string | null | undefined, t: Messages): string {
  if (value === null || value === undefined || value === '') {
    return t.common.dash;
  }
  return t.orgStatus[value as OrgStatus] ?? value;
}

export function labelApplicationKind(value: string | null | undefined, t: Messages): string {
  if (value === null || value === undefined || value === '') {
    return t.common.dash;
  }
  return t.applicationKind[value as ApplicationKind] ?? value;
}

export function labelOrgType(value: string | null | undefined, t: Messages): string {
  if (value === null || value === undefined || value === '') {
    return t.common.dash;
  }
  return t.orgType[value as OrgType] ?? value;
}

export function labelRecipientGroups(values: string[] | null | undefined, t: Messages): string {
  if (values === null || values === undefined || values.length === 0) {
    return t.common.dash;
  }
  return values.map((v) => t.recipientGroup[v as RecipientGroup] ?? v).join(', ');
}

export function labelDistributionMode(value: string | null | undefined, t: Messages): string {
  if (value === null || value === undefined || value === '') {
    return t.common.dash;
  }
  return t.distributionMode[value as DistributionModeLabel] ?? value;
}

export function labelDonorTier(value: string | null | undefined, t: Messages): string {
  if (value === null || value === undefined || value === '') {
    return t.common.dash;
  }
  return t.donorTier[value as DonorTier] ?? value;
}

export function labelReviewAction(value: string | null | undefined, t: Messages): string {
  if (value === null || value === undefined || value === '') {
    return t.common.dash;
  }
  return t.reviewAction[value as keyof Messages['reviewAction']] ?? value;
}

export function orgTypeOptions(t: Messages): { key: OrgType; label: string }[] {
  return (Object.entries(t.orgType) as [OrgType, string][]).map(([key, label]) => ({
    key,
    label,
  }));
}

export function recipientGroupOptions(t: Messages): { key: RecipientGroup; label: string }[] {
  return (Object.entries(t.recipientGroup) as [RecipientGroup, string][]).map(([key, label]) => ({
    key,
    label,
  }));
}
