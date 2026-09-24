import type { MarketLot, User } from '../api/types';
import type { Messages } from '../i18n/types';

export type AvailableAs = 'buy' | 'donate';

export function remainingOf(lot: Pick<MarketLot, 'remaining_kg' | 'weight_kg'>): number {
  return lot.remaining_kg ?? lot.weight_kg;
}

export function minOrderOf(lot: Pick<MarketLot, 'min_order_kg'>): number {
  return lot.min_order_kg ?? 1;
}

export function stepOf(lot: Pick<MarketLot, 'order_step_kg'>): number {
  return lot.order_step_kg ?? 1;
}

export function splitAllowedOf(lot: Pick<MarketLot, 'split_allowed'>): boolean {
  return lot.split_allowed !== false;
}

export function roundQty(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

export function defaultQuantity(lot: MarketLot): number {
  const remaining = remainingOf(lot);
  if (!splitAllowedOf(lot)) {
    return remaining;
  }
  const min = minOrderOf(lot);
  if (remaining + 1e-6 < min) {
    return remaining;
  }
  return Math.min(remaining, min);
}

/** Prefer server `available_as`; fall back from sale_mode while masking sell_then_donate plan. */
export function availableAsOf(lot: MarketLot): AvailableAs[] {
  if (lot.available_as !== undefined && lot.available_as.length > 0) {
    return lot.available_as;
  }
  const mode = lot.sale_mode;
  if (mode === 'donate') {
    return ['donate'];
  }
  if (mode === 'sell_then_donate' && lot.donation_opened) {
    return lot.price_per_kg !== null ? ['buy', 'donate'] : ['donate'];
  }
  if (mode === 'sell' || mode === 'sell_then_donate' || mode === undefined) {
    return lot.price_per_kg !== null ? ['buy'] : lot.allow_donation ? ['donate'] : [];
  }
  return [];
}

export function marketSaleBadge(
  lot: MarketLot,
  labels: { sell: string; donate: string; donateOk: string },
): { text: string; donate: boolean } | null {
  const available = availableAsOf(lot);
  if (available.includes('donate') && !available.includes('buy')) {
    return { text: labels.donate, donate: true };
  }
  if (available.includes('donate') && available.includes('buy')) {
    return { text: labels.donateOk, donate: true };
  }
  if (available.includes('buy')) {
    return { text: labels.sell, donate: false };
  }
  return null;
}

export type DonationEligibilityLabels = Pick<
  Messages['lot'],
  | 'orgOnlyBadge'
  | 'orgOnlyLogin'
  | 'orgOnlySuspended'
  | 'orgOnlyPending'
  | 'orgOnlyNeedsInfo'
  | 'orgOnlyRejected'
  | 'orgOnlyNotRegistered'
  | 'orgOnlyVerifiedRequired'
  | 'orgOnlyCap'
> & { donateOk: string };

export function donationEligibilityLabels(t: Messages): DonationEligibilityLabels {
  return {
    orgOnlyBadge: t.lot.orgOnlyBadge,
    orgOnlyLogin: t.lot.orgOnlyLogin,
    orgOnlySuspended: t.lot.orgOnlySuspended,
    orgOnlyPending: t.lot.orgOnlyPending,
    orgOnlyNeedsInfo: t.lot.orgOnlyNeedsInfo,
    orgOnlyRejected: t.lot.orgOnlyRejected,
    orgOnlyNotRegistered: t.lot.orgOnlyNotRegistered,
    orgOnlyVerifiedRequired: t.lot.orgOnlyVerifiedRequired,
    orgOnlyCap: t.lot.orgOnlyCap,
    donateOk: t.market.badgeDonateOk,
  };
}

export function donationEligibility(
  user: User | null,
  lot: MarketLot,
  quantityKg: number,
  labels: DonationEligibilityLabels,
): { canDonate: boolean; badge: string | null; reason: string | null } {
  const available = availableAsOf(lot);
  if (!available.includes('donate')) {
    return { canDonate: false, badge: null, reason: null };
  }
  if (user === null) {
    return { canDonate: false, badge: labels.orgOnlyBadge, reason: labels.orgOnlyLogin };
  }
  if (user.donation_suspended) {
    return { canDonate: false, badge: labels.orgOnlyBadge, reason: labels.orgOnlySuspended };
  }
  if (user.org_status === 'pending') {
    return { canDonate: false, badge: labels.orgOnlyBadge, reason: labels.orgOnlyPending };
  }
  if (user.org_status === 'needs_more_info') {
    return { canDonate: false, badge: labels.orgOnlyBadge, reason: labels.orgOnlyNeedsInfo };
  }
  if (user.org_status === 'rejected') {
    return { canDonate: false, badge: labels.orgOnlyBadge, reason: labels.orgOnlyRejected };
  }
  if (user.donor_tier === null) {
    return { canDonate: false, badge: labels.orgOnlyBadge, reason: labels.orgOnlyNotRegistered };
  }
  if (lot.donation_audience === 'verified_org_only' && user.donor_tier !== 'verified_org') {
    return { canDonate: false, badge: labels.orgOnlyBadge, reason: labels.orgOnlyVerifiedRequired };
  }
  if (
    user.donation_remaining_kg !== null &&
    user.donation_remaining_kg !== undefined &&
    quantityKg > user.donation_remaining_kg
  ) {
    return {
      canDonate: false,
      badge: labels.orgOnlyBadge,
      reason: labels.orgOnlyCap,
    };
  }
  return { canDonate: true, badge: labels.donateOk, reason: null };
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Prefer server location_label (ตำบล/อำเภอ) then plot_name. */
export function lotLocationLabel(
  lot: Pick<MarketLot, 'location_label' | 'subdistrict_th' | 'district_th' | 'plot_name'>,
  fallback: string,
): string {
  if (lot.location_label != null && lot.location_label !== '') {
    return lot.location_label;
  }
  const parts = [lot.subdistrict_th, lot.district_th].filter(
    (p): p is string => p != null && p !== '',
  );
  if (parts.length > 0) {
    return parts.join(' · ');
  }
  if (lot.plot_name != null && lot.plot_name !== '') {
    return lot.plot_name;
  }
  return fallback;
}
