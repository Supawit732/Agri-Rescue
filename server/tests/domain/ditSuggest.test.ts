import {
  compareDitSuggestions,
  isExcludedDitProductName,
  normalizeMocProductName,
  parseUnitFromProductName,
  searchDitProducts,
  suggestDitProducts,
  toDitCandidate,
} from '../../src/domain/ditSuggest';

describe('ditSuggest', () => {
  it('parses unit from baht parentheses and trims newlines', () => {
    expect(parseUnitFromProductName('ผักชี คละ (บาท/กก.)\n')).toBe('กก.');
    expect(parseUnitFromProductName('ผักชี คละ (บาท/ขีด)')).toBe('ขีด');
    expect(parseUnitFromProductName('กล้วยน้ำว้า\n')).toBe('unknown');
    expect(parseUnitFromProductName('กล้วยหอมทอง ใหญ่ (14 ผล)')).toBe('unknown');
    expect(normalizeMocProductName('กล้วยน้ำว้า\n\n')).toBe('กล้วยน้ำว้า');
  });

  it('excludes organic and store/mall branded names', () => {
    expect(isExcludedDitProductName('กล้วยน้ำว้า อินทรีย์ ท็อปซูเปอร์มาร์เก็ต')).toBe(true);
    expect(isExcludedDitProductName('กล้วยหอมทอง อินทรีย์ ร้านเลมอนฟาร์ม')).toBe(true);
    expect(isExcludedDitProductName('กล้วยน้ำว้า')).toBe(false);
    expect(isExcludedDitProductName('กล้วยไข่ ใหญ่')).toBe(false);
  });

  it('ranks wholesale > retail, kg > other, คละ > คัด and returns top suggestions', () => {
    const products = [
      toDitCandidate({
        product_id: 'P1',
        product_name: 'กล้วยน้ำว้า คัด (บาท/ผล)',
        sell_type: 'ขายปลีก',
        category_name: 'ผลไม้',
      }),
      toDitCandidate({
        product_id: 'W2',
        product_name: 'กล้วยน้ำว้า คละ (บาท/กก.)',
        sell_type: 'ขายส่ง',
        category_name: 'ผลไม้',
      }),
      toDitCandidate({
        product_id: 'W3',
        product_name: 'กล้วยน้ำว้า คัด (บาท/กก.)',
        sell_type: 'ขายส่ง',
        category_name: 'ผลไม้',
      }),
      toDitCandidate({
        product_id: 'W4',
        product_name: 'กล้วยน้ำว้า อินทรีย์ ท็อปซูเปอร์มาร์เก็ต (บาท/กก.)',
        sell_type: 'ขายส่ง',
        category_name: 'ผัก-ผลไม้อินทรีย์',
      }),
      toDitCandidate({
        product_id: 'P5',
        product_name: 'กล้วยน้ำว้า (บาท/กก.)',
        sell_type: 'ขายปลีก',
        category_name: 'ผลไม้',
      }),
    ];
    const top = suggestDitProducts('กล้วยน้ำว้า', products, 3);
    expect(top.map((p) => p.product_id)).toEqual(['W2', 'W3', 'P5']);
    expect(top.every((p) => !p.product_name.includes('อินทรีย์'))).toBe(true);
    expect(compareDitSuggestions(products[1]!, products[2]!)).toBeLessThan(0);

    const found = searchDitProducts('หอมทอง', [
      toDitCandidate({
        product_id: 'W14008',
        product_name: 'กล้วยหอมทอง ใหญ่\n',
        sell_type: 'ขายส่ง',
        category_name: 'ผลไม้',
      }),
    ]);
    expect(found[0]?.product_id).toBe('W14008');
  });
});
