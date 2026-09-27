import { isPriceOutlier, isPriceTooLowForCategory, priceOutlierRatio } from '../../src/domain/priceSanity';

describe('priceSanity', () => {
  it('flags prices outside 3× / 1/3 of baseline', () => {
    expect(isPriceOutlier(40, 10)).toBe(true);
    expect(isPriceOutlier(2, 10)).toBe(true);
    expect(isPriceOutlier(20, 10)).toBe(false);
    expect(isPriceOutlier(0, 10)).toBe(false);
    expect(isPriceOutlier(10, 0)).toBe(false);
    expect(priceOutlierRatio(30, 10)).toBe(3);
    expect(priceOutlierRatio(0, 10)).toBeNull();
    expect(priceOutlierRatio(10, -1)).toBeNull();
  });

  it('isPriceTooLowForCategory only flags prices below 1/3 of baseline, no upper bound (D024)', () => {
    expect(isPriceTooLowForCategory(2, 10)).toBe(true);
    expect(isPriceTooLowForCategory(4, 10)).toBe(false);
    expect(isPriceTooLowForCategory(999, 10)).toBe(false);
    expect(isPriceTooLowForCategory(0, 10)).toBe(false);
    expect(isPriceTooLowForCategory(10, 0)).toBe(false);
  });
});
