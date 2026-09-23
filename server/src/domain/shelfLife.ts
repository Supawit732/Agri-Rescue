export function predictShelfHours(
  baseShelfDays: number,
  ripeness: number,
  tempC: number,
  humidity: number,
): number {
  const base = baseShelfDays * 24;
  const ripeFactor = 1 - ripeness * 0.18;
  const heatFactor = tempC > 30 ? Math.max(0.6, 1 - (tempC - 30) * 0.05) : 1;
  // High humidity speeds spoilage; apply after heat so daytime-avg RH > 85% shortens shelf by 10%.
  const humidityFactor = humidity > 85 ? 0.9 : 1;
  return Math.max(6, Math.round(base * ripeFactor * heatFactor * humidityFactor));
}
