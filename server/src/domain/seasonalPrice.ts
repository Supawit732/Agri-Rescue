export interface SeasonFactor {
  month: number; // 1-12
  /**
   * Multiplier applied to the base price.
   * Peak harvest season = high supply = prices DROP → factor < 1 (e.g. 0.6–0.8).
   * Off-season = low supply = prices RISE → factor > 1 (e.g. 1.2–1.5).
   * Normal months are not stored; a missing entry defaults to 1.0.
   */
  factor: number;
}

/**
 * Apply seasonal factor to a base price.
 * Returns the base price unchanged (seasonal=false) when no factor is stored for the month.
 */
export function fallbackReferencePrice(
  basePrice: number,
  factors: SeasonFactor[],
  month: number,
): { price: number; seasonal: boolean } {
  const entry = factors.find((f) => f.month === month);
  if (entry === undefined || entry.factor === 1) {
    return { price: basePrice, seasonal: false };
  }
  return { price: Math.round(basePrice * entry.factor * 10) / 10, seasonal: true };
}
