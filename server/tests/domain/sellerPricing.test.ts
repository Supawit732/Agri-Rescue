import {
  buildMocPriceUrl,
  ditMidpoint,
  isKgUnit,
  lotAcceptsDonation,
  lotPricePerKg,
  minAllowedFloor,
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
    expect(unitBaseLabel('บาท/หวี')).toBe('หวี');
    expect(unitBaseLabel('บาท/กก.')).toBe('กก.');
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
    expect(validateSellerPrices({ marketPricePerKg: 40, startPricePerKg: 41, floorPricePerKg: 12 }).ok).toBe(false);
    const low = validateSellerPrices({ marketPricePerKg: 40, startPricePerKg: 40, floorPricePerKg: 5 });
    expect(low.ok).toBe(false);
    if (!low.ok) {
      expect(low.error).toBe('suggest_donate');
    }
    expect(validateSellerPrices({ marketPricePerKg: 40, startPricePerKg: 20, floorPricePerKg: 25 }).ok).toBe(false);
  });

  it('computes lot price and forecast from start/floor + freshness', () => {
    expect(
      lotPricePerKg({
        startPricePerKg: 40,
        floorPricePerKg: 12,
        baseShelfHours: 120,
        hoursLeft: 61,
      }),
    ).toBe(26);
    expect(
      lotPricePerKg({
        startPricePerKg: 28,
        floorPricePerKg: 8.4,
        baseShelfHours: 120,
        hoursLeft: 61,
      }),
    ).toBe(18);
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

  it('builds moc price url', () => {
    expect(buildMocPriceUrl('W14009', '2024-01-01', '2024-01-31')).toContain('gis-product-prices');
    expect(buildMocPriceUrl('W14009', '2024-01-01', '2024-01-31')).toContain('product_id=W14009');
  });
});
