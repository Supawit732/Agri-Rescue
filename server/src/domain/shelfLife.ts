export function predictShelfHours(baseShelfDays: number, ripeness: number, tempC: number): number {
  const base = baseShelfDays * 24;
  const ripeFactor = 1 - ripeness * 0.18;
  const heatFactor = tempC > 30 ? Math.max(0.6, 1 - (tempC - 30) * 0.05) : 1;
  return Math.max(6, Math.round(base * ripeFactor * heatFactor));
}
