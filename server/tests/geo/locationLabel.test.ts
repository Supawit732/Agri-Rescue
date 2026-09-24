import { locationDisplayLabel } from '../../src/geo/locationLabel';

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
