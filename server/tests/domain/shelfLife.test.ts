import { predictShelfHours } from '../../src/domain/shelfLife';
import { crops, phase2Samples } from '../../src/db/seedData';

describe('predictShelfHours', () => {
  it('matches phase2Samples at 34°C', () => {
    expect(phase2Samples).toEqual([
      { cropKey: 'mango', ripeness: 2, tempC: 34, shelfHours: 61, priceNormal: 26 },
      { cropKey: 'mango', ripeness: 3, tempC: 34, shelfHours: 44 },
    ]);

    for (const sample of phase2Samples) {
      const crop = crops.find((item) => item.key === sample.cropKey);
      expect(crop).toBeDefined();
      expect(predictShelfHours(crop?.baseShelfDays ?? 0, sample.ripeness, sample.tempC)).toBe(sample.shelfHours);
    }
  });

  it('does not apply heat below or at 30°C and floors the factor at 0.6', () => {
    expect(predictShelfHours(5, 0, 30)).toBe(120);
    expect(predictShelfHours(5, 0, 20)).toBe(120);
    expect(predictShelfHours(5, 0, 40)).toBe(72);
  });

  it('never returns fewer than 6 hours', () => {
    expect(predictShelfHours(0.1, 4, 40)).toBe(6);
  });
});
