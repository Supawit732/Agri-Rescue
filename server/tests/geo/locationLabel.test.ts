import { locationDisplayLabel, locationDisplayLabelFor } from '../../src/geo/locationLabel';

describe('locationDisplayLabel', () => {
  it('joins subdistrict and district when present', () => {
    expect(locationDisplayLabel('คลองเตย', 'คลองเตย', 'แปลงเก่า')).toBe('คลองเตย · คลองเตย');
  });

  it('uses only subdistrict when district missing', () => {
    expect(locationDisplayLabel('ปากน้ำ', null, 'แปลง')).toBe('ปากน้ำ');
  });

  it('falls back to plot name when labels missing', () => {
    expect(locationDisplayLabel(null, null, 'แปลงชุมชน')).toBe('แปลงชุมชน');
    expect(locationDisplayLabel('', '', ' แปลงชุมชน ')).toBe('แปลงชุมชน');
  });

  it('returns null when nothing available', () => {
    expect(locationDisplayLabel(null, undefined, null)).toBeNull();
    expect(locationDisplayLabel(null, null, '')).toBeNull();
  });
});

describe('locationDisplayLabelFor', () => {
  const labels = {
    subdistrict_th: 'คลองเตย',
    district_th: 'กรุงเทพ',
    subdistrict_en: 'Khlong Toei',
    district_en: 'Bangkok',
    fallback: 'Plot',
  };

  it('prefers English columns when locale=en', () => {
    expect(locationDisplayLabelFor('en', labels)).toBe('Khlong Toei · Bangkok');
  });

  it('uses Thai columns when locale=th', () => {
    expect(locationDisplayLabelFor('th', labels)).toBe('คลองเตย · กรุงเทพ');
  });

  it('falls back when English missing', () => {
    expect(
      locationDisplayLabelFor('en', {
        subdistrict_th: 'คลองเตย',
        district_th: 'กรุงเทพ',
        subdistrict_en: null,
        district_en: null,
        fallback: 'Plot',
      }),
    ).toBe('คลองเตย · กรุงเทพ');
  });
});
