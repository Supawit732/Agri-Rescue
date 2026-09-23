import { diagnoseDitMatch, pickAutoDitMatch } from '../../src/domain/ditAutoMatch';
import { resolveDitUnit, toDitCandidate } from '../../src/domain/ditSuggest';
import { isPriceOutlier } from '../../src/domain/priceSanity';

describe('ditAutoMatch v2', () => {
  const catalog = [
    toDitCandidate({
      product_id: 'W1',
      product_name: 'กล้วยน้ำว้า คละ (บาท/กก.)',
      sell_type: 'ขายส่ง',
      category_name: 'ผลไม้',
    }),
    toDitCandidate({
      product_id: 'P1',
      product_name: 'กล้วยน้ำว้า (บาท/กก.)',
      sell_type: 'ขายปลีก',
      category_name: 'ผลไม้',
    }),
    toDitCandidate({
      product_id: 'Wcashew',
      product_name: 'กล้วยน้ำว้า แห้ง (บาท/กก.)',
      sell_type: 'ขายส่ง',
      category_name: 'ผลไม้',
    }),
    toDitCandidate({
      product_id: 'Wveg',
      product_name: 'กล้วยน้ำว้า (บาท/กก.)',
      sell_type: 'ขายส่ง',
      category_name: 'ผักสด',
    }),
    toDitCandidate({
      product_id: 'Wfruit',
      product_name: 'กล้วยน้ำว้า (บาท/ผล)',
      sell_type: 'ขายส่ง',
      category_name: 'ผลไม้',
    }),
  ];

  it('prefers wholesale kg in matching category and diagnoses rejects', () => {
    const pick = pickAutoDitMatch('กล้วยน้ำว้า', catalog);
    expect(pick?.product_id).toBe('W1');
    const rows = diagnoseDitMatch('กล้วยน้ำว้า', catalog);
    expect(rows.find((r) => r.product_id === 'Wcashew')?.reason).toBe('excluded_processed');
    expect(rows.find((r) => r.product_id === 'Wveg')?.reason).toBe('category_mismatch');
    expect(rows.find((r) => r.product_id === 'Wfruit')?.reason).toBe('unit_not_kg');
    expect(rows.find((r) => r.product_id === 'W1')?.decision).toBe('selected');
  });

  it('allows unknown name unit and selects wholesale pending price unit', () => {
    const liveStyle = [
      toDitCandidate({
        product_id: 'W14009',
        product_name: 'กล้วยน้ำว้า',
        sell_type: 'ขายส่ง',
        category_name: 'ผลไม้',
      }),
      toDitCandidate({
        product_id: 'P14007',
        product_name: 'กล้วยน้ำว้า',
        sell_type: 'ขายปลีก',
        category_name: 'ผลไม้',
      }),
    ];
    expect(liveStyle[0]?.unit).toBe('unknown');
    const pick = pickAutoDitMatch('กล้วยน้ำว้า', liveStyle);
    expect(pick?.product_id).toBe('W14009');
    expect(diagnoseDitMatch('กล้วยน้ำว้า', liveStyle).find((r) => r.product_id === 'W14009')?.reason).toBe(
      'selected_wholesale_unit_pending',
    );
  });

  it('maps มะนาว to ผักสด category', () => {
    const lime = [
      toDitCandidate({
        product_id: 'W13025',
        product_name: 'มะนาว เบอร์ 1-2',
        sell_type: 'ขายส่ง',
        category_name: 'ผักสด',
      }),
      toDitCandidate({
        product_id: 'Wwrong',
        product_name: 'มะนาว เบอร์ 1-2',
        sell_type: 'ขายส่ง',
        category_name: 'ผลไม้',
      }),
    ];
    expect(pickAutoDitMatch('มะนาว', lime)?.product_id).toBe('W13025');
    expect(diagnoseDitMatch('มะนาว', lime).find((r) => r.product_id === 'Wwrong')?.reason).toBe(
      'category_mismatch',
    );
  });

  it('falls back to retail kg when no wholesale kg', () => {
    const retailOnly = [
      toDitCandidate({
        product_id: 'P9',
        product_name: 'มะเขือเทศ (บาท/กก.)',
        sell_type: 'ขายปลีก',
        category_name: 'ผักสด',
      }),
    ];
    expect(pickAutoDitMatch('มะเขือเทศ', retailOnly)?.product_id).toBe('P9');
  });

  it('resolves unit from price response over name parentheses', () => {
    expect(resolveDitUnit({ priceUnit: 'บาท/หวี', nameUnit: 'กก.' })).toBe('บาท/หวี');
    expect(resolveDitUnit({ priceUnit: null, nameUnit: 'กก.' })).toBe('บาท/กก.');
  });
});

describe('priceSanity', () => {
  it('flags prices outside 3x / 1/3 of baseline', () => {
    expect(isPriceOutlier(40, 10)).toBe(true);
    expect(isPriceOutlier(2, 10)).toBe(true);
    expect(isPriceOutlier(20, 10)).toBe(false);
  });
});
