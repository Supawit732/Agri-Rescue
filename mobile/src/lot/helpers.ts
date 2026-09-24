import type { MarketLot, User } from '../api/types';

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
  labels?: { sell: string; donate: string; donateOk: string },
): { text: string; donate: boolean } | null {
  const sell = labels?.sell ?? 'ขาย';
  const donate = labels?.donate ?? 'บริจาค';
  const donateOk = labels?.donateOk ?? 'รับบริจาคได้';
  const available = availableAsOf(lot);
  if (available.includes('donate') && !available.includes('buy')) {
    return { text: donate, donate: true };
  }
  if (available.includes('donate') && available.includes('buy')) {
    return { text: donateOk, donate: true };
  }
  if (available.includes('buy')) {
    return { text: sell, donate: false };
  }
  return null;
}

export function donationEligibility(
  user: User | null,
  lot: MarketLot,
  quantityKg: number,
): { canDonate: boolean; badge: string | null; reason: string | null } {
  const available = availableAsOf(lot);
  if (!available.includes('donate')) {
    return { canDonate: false, badge: null, reason: null };
  }
  if (user === null) {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'ต้องเข้าสู่ระบบ' };
  }
  if (user.donation_suspended) {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'สิทธิ์รับบริจาคถูกระงับ' };
  }
  if (user.org_status === 'pending') {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'รอการอนุมัติองค์กร' };
  }
  if (user.org_status === 'needs_more_info') {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'ต้องส่งเอกสารเพิ่มก่อนขอรับบริจาค' };
  }
  if (user.org_status === 'rejected') {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'คำขอองค์กรถูกปฏิเสธ' };
  }
  if (user.donor_tier === null) {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'ยังไม่ได้ลงทะเบียนผู้รับบริจาค' };
  }
  if (lot.donation_audience === 'verified_org_only' && user.donor_tier !== 'verified_org') {
    return { canDonate: false, badge: 'บริจาคเฉพาะองค์กร', reason: 'ล็อตนี้เปิดรับเฉพาะองค์กรที่ยืนยันแล้ว' };
  }
  if (
    user.donation_remaining_kg !== null &&
    user.donation_remaining_kg !== undefined &&
    quantityKg > user.donation_remaining_kg
  ) {
    return {
      canDonate: false,
      badge: 'บริจาคเฉพาะองค์กร',
      reason: `เกินเพดานสัปดาห์นี้ (คงเหลือ ${user.donation_remaining_kg} กก.)`,
    };
  }
  return { canDonate: true, badge: 'รับบริจาคได้', reason: null };
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
