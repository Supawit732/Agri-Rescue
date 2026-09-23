import {
  suggestDitProducts,
  type DitProductCandidate,
} from './ditSuggest';

/**
 * Auto-match: take ranked #1 suggestion only if unit is กก.
 * (Ranking already requires crop name substring and excludes organic/stores.)
 */
export function pickAutoDitMatch(
  cropNameTh: string,
  products: DitProductCandidate[],
): DitProductCandidate | null {
  const top = suggestDitProducts(cropNameTh, products, 1)[0];
  if (top === undefined) {
    return null;
  }
  if (top.unit !== 'กก.') {
    return null;
  }
  return top;
}
