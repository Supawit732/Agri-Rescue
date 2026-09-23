import { pickAutoDitMatch } from '../../src/domain/ditAutoMatch';
import { toDitCandidate } from '../../src/domain/ditSuggest';
import { isPriceOutlier } from '../../src/domain/priceSanity';

describe('ditAutoMatch', () => {
  const catalog = [
    toDitCandidate({
      product_id: 'W1',
      product_name: 'กล้วยน้ำว้า คละ (บาท/กก.)',
      sell_type: 'ขายส่ง',
      category_name: 'ผลไม้',
    }),
    toDitCandidate({
      product_id: 'P1',
      product_name: 'กล้วยน้ำว้า คัด (บาท/ผล)',
      sell_type: 'ขายปลีก',
      category_name: 'ผลไม้',
    }),
    toDitCandidate({
      product_id: 'Worg',
      product_name: 'กล้วยน้ำว้า อินทรีย์ ท็อปซูเปอร์มาร์เก็ต (บาท/กก.)',
      sell_type: 'ขายส่ง',
      category_name: 'อินทรีย์',
    }),
  ];

  it('auto-matches top ranked kg suggestion', () => {
    const pick = pickAutoDitMatch('กล้วยน้ำว้า', catalog);
    expect(pick?.product_id).toBe('W1');
  });

  it('does not auto-match when top suggestion is not kg', () => {
    const onlyFruit = [
      toDitCandidate({
        product_id: 'P9',
        product_name: 'ทุเรียนหมอนทอง (บาท/ผล)',
        sell_type: 'ขายส่ง',
        category_name: 'ผลไม้',
      }),
    ];
    expect(pickAutoDitMatch('ทุเรียนหมอนทอง', onlyFruit)).toBeNull();
  });

  it('does not auto-match organic/store-only catalogs', () => {
    expect(pickAutoDitMatch('กล้วยน้ำว้า', [catalog[2]!])).toBeNull();
  });
});

describe('priceSanity', () => {
  it('flags prices outside 3x / 1/3 of baseline', () => {
    expect(isPriceOutlier(40, 10)).toBe(true);
    expect(isPriceOutlier(2, 10)).toBe(true);
    expect(isPriceOutlier(20, 10)).toBe(false);
    expect(isPriceOutlier(10 / 3, 10)).toBe(false);
  });
});
