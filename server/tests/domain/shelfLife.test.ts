import { predictShelfHours } from '../../src/domain/shelfLife';
import { crops, phase2Samples } from '../../src/db/seedData';

describe('predictShelfHours', () => {
  it('matches phase2Samples for daytime-average temp and humidity', () => {
    expect(phase2Samples).toEqual([
      { cropKey: 'mango', ripeness: 2, tempC: 34, humidity: 78, shelfHours: 61, priceNormal: 26 },
      { cropKey: 'mango', ripeness: 3, tempC: 34, humidity: 78, shelfHours: 44 },
      { cropKey: 'mango', ripeness: 2, tempC: 34, humidity: 90, shelfHours: 55 },
    ]);

    for (const sample of phase2Samples) {
      const crop = crops.find((item) => item.key === sample.cropKey);
      expect(crop).toBeDefined();
      expect(
        predictShelfHours(crop?.baseShelfDays ?? 0, sample.ripeness, sample.tempC, sample.humidity),
      ).toBe(sample.shelfHours);
    }
  });

  it('does not apply heat below or at 30°C and floors the factor at 0.6', () => {
    expect(predictShelfHours(5, 0, 30, 70)).toBe(120);
    expect(predictShelfHours(5, 0, 20, 70)).toBe(120);
    expect(predictShelfHours(5, 0, 40, 70)).toBe(72);
  });

  it('shortens shelf-life by 10% only when humidity is above 85%', () => {
    expect(predictShelfHours(5, 2, 34, 85)).toBe(61);
    expect(predictShelfHours(5, 2, 34, 85.1)).toBe(55);
    expect(predictShelfHours(5, 2, 34, 90)).toBe(55);
  });

  it('never returns fewer than 6 hours', () => {
    expect(predictShelfHours(0.1, 4, 40, 95)).toBe(6);
  });
});
