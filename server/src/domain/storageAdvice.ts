/**
 * 6.9 — post-receipt storage advice (pure, no AI text).
 * All day counts are approximate; sources documented in docs/crop-sources.md.
 */

export type AdviceAudience = 'eat' | 'sell' | 'distribute';

export interface StorageAdviceInput {
  /** Buyer role when the order was created (vendor/shop vs charity etc.). */
  buyerType: string | null;
  isDonation: boolean;
  fridgeOk: boolean;
  fridgeExtraDays: number;
  expiresAt: Date | string;
  now?: Date;
  storageTipTh?: string | null;
  storageTipEn?: string | null;
}

export interface StorageAdvice {
  audience: AdviceAudience;
  consumeBy: string;
  hoursLeft: number;
  fridgeUntil: string | null;
  fridgeExtraDays: number;
  priceDropHint: boolean;
  storageTipTh: string | null;
  storageTipEn: string | null;
}

export function adviceAudience(input: {
  buyerType: string | null;
  isDonation: boolean;
}): AdviceAudience {
  if (input.isDonation || input.buyerType === 'charity') {
    return 'distribute';
  }
  if (input.buyerType === 'vendor' || input.buyerType === 'shop') {
    return 'sell';
  }
  return 'eat';
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Consume-by is the lot expiry. Fridge may extend by fridge_extra_days past expiry
 * while still sealed/cold (approx — see docs/crop-sources.md).
 * priceDropHint: reseller with < 12h remaining.
 */
export function buildStorageAdvice(input: StorageAdviceInput): StorageAdvice {
  const now = input.now ?? new Date();
  const expires = toDate(input.expiresAt);
  const expiresMs = expires.getTime();
  const hoursLeft = (expiresMs - now.getTime()) / (60 * 60 * 1000);
  const fridgeUntil =
    input.fridgeOk && input.fridgeExtraDays > 0
      ? new Date(expiresMs + input.fridgeExtraDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const audience = adviceAudience({
    buyerType: input.buyerType,
    isDonation: input.isDonation,
  });
  const reseller = audience === 'sell';
  return {
    audience,
    consumeBy: expires.toISOString(),
    hoursLeft: Math.round(hoursLeft * 10) / 10,
    fridgeUntil,
    fridgeExtraDays: input.fridgeOk ? input.fridgeExtraDays : 0,
    priceDropHint: reseller && hoursLeft < 12,
    storageTipTh: input.storageTipTh ?? null,
    storageTipEn: input.storageTipEn ?? null,
  };
}
