export type ProduceGrade = 'normal' | 'substandard';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function urgentPricePerKg(input: {
  marketPricePerKg: number;
  baseShelfHours: number;
  hoursLeft: number;
  grade: ProduceGrade;
}): number {
  const freshness = input.baseShelfHours <= 0 ? 0 : clamp(input.hoursLeft / input.baseShelfHours, 0, 1);
  const gradeFactor = input.grade === 'substandard' ? 0.7 : 1;
  return Math.max(5, Math.round(input.marketPricePerKg * (0.3 + 0.7 * freshness) * gradeFactor));
}
