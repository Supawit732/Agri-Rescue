export interface SeasonFactor {
  month: number; // 1-12
  factor: number; // e.g. 1.4 = +40% in peak season
}

/**
 * Apply seasonal factor to a base price.
 * Returns the base price unchanged when no factor is found for the month.
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
