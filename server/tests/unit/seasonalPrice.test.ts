import { fallbackReferencePrice, type SeasonFactor } from '../../src/domain/seasonalPrice';

// Factors for a hypothetical crop:
// peak month = 5 (factor 0.60 → cheap), off-season month = 12 (factor 1.40 → expensive)
const factors: SeasonFactor[] = [
  { month: 4, factor: 0.80 },
  { month: 5, factor: 0.60 },
  { month: 6, factor: 0.75 },
  { month: 11, factor: 1.30 },
  { month: 12, factor: 1.40 },
  { month: 1, factor: 1.35 },
];

const BASE = 100;

describe('fallbackReferencePrice', () => {
  it('peak month (factor < 1) returns price lower than base', () => {
    const { price, seasonal } = fallbackReferencePrice(BASE, factors, 5);
    expect(price).toBeLessThan(BASE);
    expect(price).toBeCloseTo(60, 0);
    expect(seasonal).toBe(true);
  });

  it('off-season month (factor > 1) returns price higher than base', () => {
    const { price, seasonal } = fallbackReferencePrice(BASE, factors, 12);
    expect(price).toBeGreaterThan(BASE);
    expect(price).toBeCloseTo(140, 0);
    expect(seasonal).toBe(true);
  });

  it('month with no stored factor returns base price (seasonal=false)', () => {
    const { price, seasonal } = fallbackReferencePrice(BASE, factors, 9);
    expect(price).toBe(BASE);
    expect(seasonal).toBe(false);
  });

  it('factor exactly 1.0 also returns base price (seasonal=false)', () => {
    const neutralFactors: SeasonFactor[] = [{ month: 7, factor: 1.0 }];
    const { price, seasonal } = fallbackReferencePrice(BASE, neutralFactors, 7);
    expect(price).toBe(BASE);
    expect(seasonal).toBe(false);
  });

  it('empty factors array returns base price (seasonal=false)', () => {
    const { price, seasonal } = fallbackReferencePrice(BASE, [], 5);
    expect(price).toBe(BASE);
    expect(seasonal).toBe(false);
  });
});
