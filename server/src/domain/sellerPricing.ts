import type { ProduceGrade } from './pricing';

/** Config for Phase 6.1c — mirrored in docs/DECISIONS.md D020 */
export const PRICING_CONFIG = {
  substandardStartFactor: 0.7,
  suggestedFloorOfStart: 0.3,
  minFloorOfMarket: 0.2,
  freshnessBase: 0.3,
  freshnessSpan: 0.7,
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

export type PriceBoundsError =
  | 'start_above_market'
  | 'floor_below_min'
  | 'floor_above_start'
  | 'suggest_donate';

export function validateSellerPrices(input: {
  marketPricePerKg: number;
  startPricePerKg: number;
  floorPricePerKg: number;
}): { ok: true } | { ok: false; error: PriceBoundsError; message: string } {
  const market = input.marketPricePerKg;
  const start = input.startPricePerKg;
  const floor = input.floorPricePerKg;
  if (start > market + 1e-9) {
    return { ok: false, error: 'start_above_market', message: 'ราคาเริ่มต้องไม่เกินราคาตลาดวันนั้น' };
  }
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
 * price = max(floor, round(start × (0.3 + 0.7 × freshness)))
 */
export function lotPricePerKg(input: {
  startPricePerKg: number;
  floorPricePerKg: number;
  baseShelfHours: number;
  hoursLeft: number;
}): number {
  const freshness =
    input.baseShelfHours <= 0 ? 0 : clamp(input.hoursLeft / input.baseShelfHours, 0, 1);
  const raw = Math.round(
    input.startPricePerKg * (PRICING_CONFIG.freshnessBase + PRICING_CONFIG.freshnessSpan * freshness),
  );
  return Math.max(Math.round(input.floorPricePerKg), raw);
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Re-export ProduceGrade usage without circular import issues — use string union locally if needed
export type { ProduceGrade };
