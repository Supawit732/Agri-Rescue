import type { ProduceGrade } from './pricing';

/** Config for Phase 6.1c — mirrored in docs/DECISIONS.md D020 */
export const PRICING_CONFIG = {
  substandardStartFactor: 0.7,
  suggestedFloorOfStart: 0.3,
  minFloorOfMarket: 0.2,
  /** Above this freshness, price stays at `start`; below it, linear down to `floor`. See D048. */
  holdFullPriceUntilFreshness: 0.5,
  referenceMaxAgeDays: 30,
  sellThenDonateHours: 12,
  medianRadiusKm: 15,
  medianMinLots: 3,
  kgUnitTokens: ['บาท/กก', 'บาท/กก.', 'บาท/กิโลกรัม', 'บาทต่อกก', 'บาทต่อกิโลกรัม'] as const,
  mocProductsUrl: 'https://dataapi.moc.go.th/gis-products',
  mocPricesUrl: 'https://dataapi.moc.go.th/gis-product-prices',
  mocFetchTimeoutMs: 15_000,
  mocFetchRetries: 1,
  mocPriceConcurrency: 4,
  priceOutlierMaxRatio: 3,
} as const;

export function isKgUnit(unit: string | null | undefined): boolean {
  if (unit === null || unit === undefined) {
    return false;
  }
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, '');
  return PRICING_CONFIG.kgUnitTokens.some((token) => normalized === token.toLowerCase().replace(/\s+/g, ''));
}

/** "บาท/หวี" → "หวี", "บาท/กก." → "กก.", bare "หวี" → "หวี" */
export function unitBaseLabel(unit: string | null | undefined): string {
  if (unit === null || unit === undefined) {
    return '';
  }
  const trimmed = unit.trim();
  if (trimmed === '') {
    return '';
  }
  const slash = trimmed.indexOf('/');
  if (slash >= 0) {
    return trimmed.slice(slash + 1).trim() || trimmed;
  }
  return trimmed;
}

/** Midpoint of DIT price_min / price_max for one day. */
export function ditMidpoint(priceMin: number, priceMax: number): number {
  return round2((priceMin + priceMax) / 2);
}

/**
 * Convert DIT unit price to baht/kg.
 * Returns null when unit is not kg and admin has not set dit_unit_to_kg (never guess).
 */
export function toBahtPerKg(input: {
  unitPrice: number;
  unit: string | null | undefined;
  ditUnitToKg: number | null | undefined;
}): number | null {
  if (isKgUnit(input.unit)) {
    return round2(input.unitPrice);
  }
  if (input.ditUnitToKg === null || input.ditUnitToKg === undefined || !(input.ditUnitToKg > 0)) {
    return null;
  }
  return round2(input.unitPrice * input.ditUnitToKg);
}

export function suggestedStartPrice(marketPricePerKg: number, grade: ProduceGrade): number {
  const factor = grade === 'substandard' ? PRICING_CONFIG.substandardStartFactor : 1;
  return round2(marketPricePerKg * factor);
}

export function suggestedFloorPrice(startPricePerKg: number): number {
  return round2(startPricePerKg * PRICING_CONFIG.suggestedFloorOfStart);
}

export function minAllowedFloor(marketPricePerKg: number): number {
  return round2(marketPricePerKg * PRICING_CONFIG.minFloorOfMarket);
}

export type PriceBoundsError = 'floor_below_min' | 'floor_above_start' | 'suggest_donate';

export function validateSellerPrices(input: {
  marketPricePerKg: number;
  startPricePerKg: number;
  floorPricePerKg: number;
}): { ok: true } | { ok: false; error: PriceBoundsError; message: string } {
  const market = input.marketPricePerKg;
  const start = input.startPricePerKg;
  const floor = input.floorPricePerKg;
  const minFloor = minAllowedFloor(market);
  if (floor + 1e-9 < minFloor) {
    return {
      ok: false,
      error: 'suggest_donate',
      message: `ราคาต่ำสุดต่ำกว่า ${PRICING_CONFIG.minFloorOfMarket * 100}% ของราคาตลาด — แนะนำโหมดบริจาค`,
    };
  }
  if (floor > start + 1e-9) {
    return { ok: false, error: 'floor_above_start', message: 'ราคาต่ำสุดต้องไม่เกินราคาเริ่ม' };
  }
  return { ok: true };
}

/**
 * Lot price from seller start/floor and remaining freshness.
 *
 * freshness >= holdFullPriceUntilFreshness (0.5) → price = start
 * freshness <  holdFullPriceUntilFreshness       → price = floor + (start - floor) × (freshness / 0.5)
 *
 * A straight line from start to floor, and a √freshness curve, both start dropping the price
 * immediately, well before the produce is actually near expiry. Holding the full `start` price
 * for the first half of the shelf life protects the seller during that window, then a steady
 * linear drop over the second half gives buyers a clear, predictable incentive to act before
 * expiry (see D048 — an f^0.3 curve was considered but rejected for dropping too late to give
 * buyers enough of a nudge). `floor` remains a hard minimum regardless of the curve shape.
 */
export function lotPricePerKg(input: {
  startPricePerKg: number;
  floorPricePerKg: number;
  baseShelfHours: number;
  hoursLeft: number;
}): number {
  const freshness =
    input.baseShelfHours <= 0 ? 0 : clamp(input.hoursLeft / input.baseShelfHours, 0, 1);
  const threshold = PRICING_CONFIG.holdFullPriceUntilFreshness;
  const raw =
    freshness >= threshold
      ? input.startPricePerKg
      : input.floorPricePerKg +
        (input.startPricePerKg - input.floorPricePerKg) * (freshness / threshold);
  return Math.max(Math.round(input.floorPricePerKg), Math.round(raw));
}

/** Forecast table for 6 / 12 / 24 hours from now. */
export function priceForecastRows(input: {
  startPricePerKg: number;
  floorPricePerKg: number;
  baseShelfHours: number;
  hoursLeftNow: number;
  horizonsHours?: number[];
}): { hours: number; price_per_kg: number }[] {
  const horizons = input.horizonsHours ?? [6, 12, 24];
  return horizons.map((hours) => ({
    hours,
    price_per_kg: lotPricePerKg({
      startPricePerKg: input.startPricePerKg,
      floorPricePerKg: input.floorPricePerKg,
      baseShelfHours: input.baseShelfHours,
      hoursLeft: input.hoursLeftNow - hours,
    }),
  }));
}

export function buildMocPriceUrl(productId: string, fromDate: string, toDate: string): string {
  const params = new URLSearchParams({
    product_id: productId,
    from_date: fromDate,
    to_date: toDate,
  });
  return `${PRICING_CONFIG.mocPricesUrl}?${params.toString()}`;
}

/** Whether a lot currently accepts donation bookings. */
export function lotAcceptsDonation(saleMode: string, donationOpened: boolean | number): boolean {
  if (saleMode === 'donate') {
    return true;
  }
  if (saleMode === 'sell_then_donate') {
    return Number(donationOpened) === 1;
  }
  return false;
}

/** Buyer-facing booking options — never exposes raw sell_then_donate. */
export type AvailableAs = 'buy' | 'donate';

export function availableAs(saleMode: string, donationOpened: boolean | number): AvailableAs[] {
  if (saleMode === 'donate') {
    return ['donate'];
  }
  if (saleMode === 'sell_then_donate' && (donationOpened === true || donationOpened === 1)) {
    return ['buy', 'donate'];
  }
  if (saleMode === 'sell_then_donate') {
    return ['buy'];
  }
  return ['buy']; // sell default
}

/** Transparency badge tone for current price vs reference market price (D024). */
export type PriceComparisonTone = 'cheaper' | 'near' | 'higher';

export interface PriceComparison {
  tone: PriceComparisonTone;
  /** (marketPricePerKg - pricePerKg) / marketPricePerKg × 100, rounded. Positive = cheaper. */
  percentDiff: number;
}

const PRICE_COMPARISON_THRESHOLD_PERCENT = 5;

/**
 * Compares current lot price to the reference market price.
 * Returns null when there is no price to compare (donate-only lots, or no market reference).
 */
export function priceComparison(
  pricePerKg: number | null,
  marketPricePerKg: number | null,
): PriceComparison | null {
  if (pricePerKg === null || marketPricePerKg === null || marketPricePerKg <= 0) {
    return null;
  }
  const percentDiff = Math.round(((marketPricePerKg - pricePerKg) / marketPricePerKg) * 100);
  if (percentDiff >= PRICE_COMPARISON_THRESHOLD_PERCENT) {
    return { tone: 'cheaper', percentDiff };
  }
  if (percentDiff < -PRICE_COMPARISON_THRESHOLD_PERCENT) {
    return { tone: 'higher', percentDiff };
  }
  return { tone: 'near', percentDiff };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Re-export ProduceGrade usage without circular import issues — use string union locally if needed
export type { ProduceGrade };
