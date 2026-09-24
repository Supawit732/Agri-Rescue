import { describe, expect, it } from '@jest/globals';
import {
  EMAIL_DOMAINS,
  formatPhone,
  formatPhoneOnChange,
  isValidEmail,
  isValidThaiPhone,
  normalizeEmail,
  normalizePhone,
  splitEmail,
  suggestDomainFix,
  suggestDomains,
} from '../../../mobile/src/lib/phoneEmail';
import { isValidThaiPhone as serverIsValid } from '../../src/lib/normalizePhone';
import { normalizePhone as serverNormalize } from '../../src/lib/normalizePhone';

describe('phoneEmail helpers (mobile pure module)', () => {
  it('normalizePhone', () => {
    expect(normalizePhone('0800000011')).toBe('0800000011');
    expect(normalizePhone('080-000-0011')).toBe('0800000011');
    expect(normalizePhone('080 000 0011')).toBe('0800000011');
    expect(normalizePhone('+66800000011')).toBe('0800000011');
    expect(normalizePhone('66800000011')).toBe('0800000011');
    expect(normalizePhone('800000011')).toBe('0800000011');
  });

  it('isValidThaiPhone', () => {
    expect(isValidThaiPhone('0800000011')).toBe(true);
    expect(isValidThaiPhone('8000000011')).toBe(false);
    expect(isValidThaiPhone('080000001')).toBe(false);
    expect(isValidThaiPhone('08000000111')).toBe(false);
  });

  it('formatPhone', () => {
    expect(formatPhone('0800000011')).toBe('080-000-0011');
    expect(formatPhone('08')).toBe('08');
    expect(formatPhone('0800')).toBe('080-0');
    expect(formatPhone('0800000')).toBe('080-000-0');
  });

  it('formatPhoneOnChange auto dashes', () => {
    expect(formatPhoneOnChange('', '0')).toBe('0');
    expect(formatPhoneOnChange('0', '08')).toBe('08');
    expect(formatPhoneOnChange('08', '080')).toBe('080');
    expect(formatPhoneOnChange('080', '0800')).toBe('080-0');
    expect(formatPhoneOnChange('080-0', '080-00')).toBe('080-00');
    expect(formatPhoneOnChange('080-000', '080-0000')).toBe('080-000-0');
  });

  it('formatPhoneOnChange deletes across dash', () => {
    // Delete last digit of 080-000-0 → 080-000
    expect(formatPhoneOnChange('080-000-0', '080-000')).toBe('080-000');
    // Delete first dash only (same digits) → also drop digit before dash → 080-000-011
    expect(formatPhoneOnChange('080-000-0011', '080000-0011')).toBe('080-000-011');
    // Delete second dash → 080-0000011 → 080-000-011
    expect(formatPhoneOnChange('080-000-0011', '080-0000011')).toBe('080-000-011');
  });

  it('formatPhoneOnChange normalizes paste', () => {
    expect(formatPhoneOnChange('', '+66 80 000 0011')).toBe('080-000-0011');
    expect(formatPhoneOnChange('', '080 000 0011')).toBe('080-000-0011');
  });

  it('email helpers', () => {
    expect(normalizeEmail('  Foo@Gmail.COM ')).toBe('foo@gmail.com');
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(splitEmail('user@gmail.com')).toEqual({ local: 'user', domain: 'gmail.com' });
    expect(suggestDomains('gm')).toContain('gmail.com');
    expect(suggestDomains('gm')).not.toContain('yahoo.com');
    expect(suggestDomains('')).toEqual([...EMAIL_DOMAINS]);
    expect(suggestDomainFix('gmial.com')).toBe('gmail.com');
    expect(suggestDomainFix('hotmial.com')).toBe('hotmail.com');
    expect(suggestDomainFix('gmail.com')).toBeNull();
  });

  it('server normalize matches mobile for dashed phone', () => {
    expect(serverNormalize('080-000-0011')).toBe('0800000011');
    expect(serverIsValid(serverNormalize('080-000-0011'))).toBe(true);
    expect(serverNormalize('+66800000011')).toBe('0800000011');
  });
});
