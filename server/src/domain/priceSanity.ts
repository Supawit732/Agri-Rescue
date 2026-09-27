/** True when newPrice is >3× or <1/3 of baseline (both must be positive). */
export function isPriceOutlier(newPrice: number, baseline: number): boolean {
  if (!(newPrice > 0) || !(baseline > 0)) {
    return false;
  }
  const ratio = newPrice / baseline;
  return ratio > 3 || ratio < 1 / 3;
}

/**
 * True when newPrice is <1/3 of baseline (both must be positive).
 * No upper bound — sellers may propose a crop above the category median (D024).
 */
export function isPriceTooLowForCategory(newPrice: number, baseline: number): boolean {
  if (!(newPrice > 0) || !(baseline > 0)) {
    return false;
  }
  return newPrice / baseline < 1 / 3;
}

export function priceOutlierRatio(newPrice: number, baseline: number): number | null {
  if (!(newPrice > 0) || !(baseline > 0)) {
    return null;
  }
  return newPrice / baseline;
}
