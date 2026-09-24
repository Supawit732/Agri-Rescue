import { describe, expect, it } from '@jest/globals';
import { isValidThaiPhone, normalizePhone } from '../../src/lib/normalizePhone';

describe('server normalizePhone', () => {
  it('accepts plain digits', () => {
    expect(normalizePhone('0800000011')).toBe('0800000011');
    expect(isValidThaiPhone(normalizePhone('0800000011'))).toBe(true);
  });

  it('accepts dashed phone', () => {
    expect(normalizePhone('080-000-0011')).toBe('0800000011');
    expect(isValidThaiPhone(normalizePhone('080-000-0011'))).toBe(true);
  });

  it('accepts +66 paste', () => {
    expect(normalizePhone('+66800000011')).toBe('0800000011');
  });

  it('rejects invalid after normalize', () => {
    expect(isValidThaiPhone(normalizePhone('12345'))).toBe(false);
    expect(isValidThaiPhone(normalizePhone('080000001'))).toBe(false);
  });
});
