export type ProduceGrade = 'normal' | 'substandard';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Legacy helper kept for phase2Samples compatibility during migration.
 * Prefer lotPricePerKg (seller start/floor) for live lots.
 * Equivalent to start = market × gradeFactor, floor = 30% of start.
 */
export function urgentPricePerKg(input: {
  marketPricePerKg: number;
  baseShelfHours: number;
  hoursLeft: number;
  grade: ProduceGrade;
}): number {
  const gradeFactor = input.grade === 'substandard' ? 0.7 : 1;
  const start = input.marketPricePerKg * gradeFactor;
  const floor = start * 0.3;
  const freshness = input.baseShelfHours <= 0 ? 0 : clamp(input.hoursLeft / input.baseShelfHours, 0, 1);
  const raw = Math.round(start * (0.3 + 0.7 * freshness));
  // Keep historic floor of 5 baht for tiny market prices in old tests
  return Math.max(5, Math.max(Math.round(floor), raw));
}
