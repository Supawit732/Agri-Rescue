import {
  availableAs,
  buildMocPriceUrl,
  ditMidpoint,
  isKgUnit,
  lotAcceptsDonation,
  lotPricePerKg,
  minAllowedFloor,
  priceComparison,
  priceForecastRows,
  suggestedFloorPrice,
  suggestedStartPrice,
  toBahtPerKg,
  unitBaseLabel,
  validateSellerPrices,
} from '../../src/domain/sellerPricing';

describe('sellerPricing', () => {
  it('detects kg units and converts only with explicit factor', () => {
    expect(isKgUnit('บาท/กก.')).toBe(true);
    expect(isKgUnit('บาท/หวี')).toBe(false);
    expect(isKgUnit(null)).toBe(false);
    expect(isKgUnit(undefined)).toBe(false);
    expect(unitBaseLabel('บาท/หวี')).toBe('หวี');
    expect(unitBaseLabel('บาท/กก.')).toBe('กก.');
    expect(unitBaseLabel(null)).toBe('');
    expect(unitBaseLabel(undefined)).toBe('');
    expect(unitBaseLabel('   ')).toBe('');
    expect(unitBaseLabel('หวี')).toBe('หวี');
    expect(unitBaseLabel('บาท/')).toBe('บาท/');
    expect(toBahtPerKg({ unitPrice: 40, unit: 'บาท/กก.', ditUnitToKg: null })).toBe(40);
    expect(toBahtPerKg({ unitPrice: 65, unit: 'บาท/หวี', ditUnitToKg: null })).toBeNull();
    expect(toBahtPerKg({ unitPrice: 65, unit: 'บาท/หวี', ditUnitToKg: 0.5 })).toBe(32.5);
    expect(ditMidpoint(30, 40)).toBe(35);
  });

  it('suggests and validates seller start/floor bounds', () => {
    expect(suggestedStartPrice(40, 'normal')).toBe(40);
    expect(suggestedStartPrice(40, 'substandard')).toBe(28);
    expect(suggestedFloorPrice(40)).toBe(12);
    expect(minAllowedFloor(40)).toBe(8);
    expect(validateSellerPrices({ marketPricePerKg: 40, startPricePerKg: 40, floorPricePerKg: 12 }).ok).toBe(true);
    // Start price above reference market price is allowed (D024 — seller price transparency).
    expect(validateSellerPrices({ marketPricePerKg: 40, startPricePerKg: 41, floorPricePerKg: 12 }).ok).toBe(true);
    const low = validateSellerPrices({ marketPricePerKg: 40, startPricePerKg: 40, floorPricePerKg: 5 });
    expect(low.ok).toBe(false);
    if (!low.ok) {
      expect(low.error).toBe('suggest_donate');
    }
    expect(validateSellerPrices({ marketPricePerKg: 40, startPricePerKg: 20, floorPricePerKg: 25 }).ok).toBe(false);
  });

  it('computes the price comparison badge tone against the reference market price', () => {
    expect(priceComparison(null, 40)).toBeNull();
    expect(priceComparison(40, null)).toBeNull();
    expect(priceComparison(40, 0)).toBeNull();
    expect(priceComparison(35, 40)).toEqual({ tone: 'cheaper', percentDiff: 13 });
    expect(priceComparison(38, 40)).toEqual({ tone: 'cheaper', percentDiff: 5 });
    expect(priceComparison(40, 40)).toEqual({ tone: 'near', percentDiff: 0 });
    expect(priceComparison(42, 40)).toEqual({ tone: 'near', percentDiff: -5 });
    expect(priceComparison(45, 40)).toEqual({ tone: 'higher', percentDiff: -12 });
  });

  it('holds full price above freshness 0.5, then linear down to floor', () => {
    // baseShelfHours 100 so hoursLeft == freshness × 100, for round fractions.
    const priceAt = (freshness: number): number =>
      lotPricePerKg({
        startPricePerKg: 40,
        floorPricePerKg: 12,
        baseShelfHours: 100,
        hoursLeft: freshness * 100,
      });
    expect(priceAt(1)).toBe(40);
    expect(priceAt(0.75)).toBe(40);
    expect(priceAt(0.5)).toBe(40);
    expect(priceAt(0.25)).toBe(26);
    expect(priceAt(0.1)).toBe(18);
    expect(priceAt(0)).toBe(12);

    expect(
      lotPricePerKg({
        startPricePerKg: 28,
        floorPricePerKg: 8.4,
        baseShelfHours: 120,
        hoursLeft: 61,
      }),
    ).toBe(28);

    const rows = priceForecastRows({
      startPricePerKg: 40,
      floorPricePerKg: 12,
      baseShelfHours: 120,
      hoursLeftNow: 48,
    });
    expect(rows.map((r) => r.hours)).toEqual([6, 12, 24]);
    expect(rows.every((r) => typeof r.price_per_kg === 'number')).toBe(true);
  });

  it('gates donation by sale mode', () => {
    expect(lotAcceptsDonation('donate', 0)).toBe(true);
    expect(lotAcceptsDonation('sell', 1)).toBe(false);
    expect(lotAcceptsDonation('sell_then_donate', 0)).toBe(false);
    expect(lotAcceptsDonation('sell_then_donate', 1)).toBe(true);
  });

  it('maps sale mode to buyer-facing availableAs without leaking sell_then_donate', () => {
    expect(availableAs('donate', 0)).toEqual(['donate']);
    expect(availableAs('sell', 0)).toEqual(['buy']);
    expect(availableAs('sell', 1)).toEqual(['buy']);
    expect(availableAs('sell_then_donate', 0)).toEqual(['buy']);
    expect(availableAs('sell_then_donate', false)).toEqual(['buy']);
    expect(availableAs('sell_then_donate', 1)).toEqual(['buy', 'donate']);
    expect(availableAs('sell_then_donate', true)).toEqual(['buy', 'donate']);
    expect(JSON.stringify(availableAs('sell_then_donate', 0))).not.toContain('sell_then_donate');
  });

  it('builds moc price url', () => {
    expect(buildMocPriceUrl('W14009', '2024-01-01', '2024-01-31')).toContain('gis-product-prices');
    expect(buildMocPriceUrl('W14009', '2024-01-01', '2024-01-31')).toContain('product_id=W14009');
  });
});
