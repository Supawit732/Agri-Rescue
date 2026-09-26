export const OTP_MAX_ATTEMPTS = 5;

/** Returns true when the order has exhausted its OTP attempts and must be unlocked by admin. */
export function isOtpLocked(attempts: number): boolean {
  return attempts >= OTP_MAX_ATTEMPTS;
}
