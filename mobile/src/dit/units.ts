/**
 * Thai unit markers as returned by the DIT/MOC product catalog.
 * Kept here (not in UI catalogs) so screen files stay Thai-literal-free.
 */
export const DIT_KG_UNIT = 'กก.';
export const DIT_KG_UNIT_PREFIX = 'กก';

export function isDitKgUnit(unit: string | null | undefined): boolean {
  if (unit === null || unit === undefined) {
    return false;
  }
  if (unit === 'unknown') {
    return false;
  }
  return unit === DIT_KG_UNIT || unit.includes(DIT_KG_UNIT_PREFIX);
}
