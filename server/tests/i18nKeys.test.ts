import th from '../../mobile/src/i18n/th';
import en from '../../mobile/src/i18n/en';

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') {
    return [prefix];
  }
  if (Array.isArray(obj)) {
    return [prefix];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    collectKeys(value, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('i18n catalogs', () => {
  it('th and en have the same key tree', () => {
    const thKeys = new Set(collectKeys(th));
    const enKeys = new Set(collectKeys(en));
    const onlyTh = [...thKeys].filter((k) => !enKeys.has(k)).sort();
    const onlyEn = [...enKeys].filter((k) => !thKeys.has(k)).sort();
    expect({ onlyTh, onlyEn }).toEqual({ onlyTh: [], onlyEn: [] });
  });
});
