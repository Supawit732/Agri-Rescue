import { urgentPricePerKg } from '../../src/domain/pricing';
import { crops, phase2Samples } from '../../src/db/seedData';

describe('urgentPricePerKg', () => {
  it('matches the normal-grade phase2 sample', () => {
    const sample = phase2Samples[0];
    const crop = crops.find((item) => item.key === sample.cropKey);
    expect(crop).toBeDefined();
    expect(
      urgentPricePerKg({
        marketPricePerKg: crop?.marketPricePerKg ?? 0,
        baseShelfHours: (crop?.baseShelfDays ?? 0) * 24,
        hoursLeft: sample.shelfHours,
        grade: 'normal',
      }),
    ).toBe(sample.priceNormal);
  });

  it('clamps freshness and applies the substandard factor and minimum price', () => {
    expect(
      urgentPricePerKg({
        marketPricePerKg: 40,
        baseShelfHours: 120,
        hoursLeft: 1000,
        grade: 'normal',
      }),
    ).toBe(40);
    expect(
      urgentPricePerKg({
        marketPricePerKg: 40,
        baseShelfHours: 120,
        hoursLeft: -5,
        grade: 'normal',
      }),
    ).toBe(12);
    expect(
      urgentPricePerKg({
        marketPricePerKg: 40,
        baseShelfHours: 120,
        hoursLeft: 61,
        grade: 'substandard',
      }),
    ).toBe(18);
    expect(
      urgentPricePerKg({
        marketPricePerKg: 1,
        baseShelfHours: 0,
        hoursLeft: 10,
        grade: 'substandard',
      }),
    ).toBe(5);
  });
});
