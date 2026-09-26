import { isOtpLocked, OTP_MAX_ATTEMPTS } from '../../src/domain/otpLock';

describe('otpLock', () => {
  it('is not locked below the limit', () => {
    expect(isOtpLocked(0)).toBe(false);
    expect(isOtpLocked(OTP_MAX_ATTEMPTS - 1)).toBe(false);
  });

  it('is locked at exactly the limit', () => {
    expect(isOtpLocked(OTP_MAX_ATTEMPTS)).toBe(true);
  });

  it('is locked above the limit', () => {
    expect(isOtpLocked(OTP_MAX_ATTEMPTS + 1)).toBe(true);
  });
});
