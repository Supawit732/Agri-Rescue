/** Phase 6.5 mock payment — pure deadline calculation (no real gateway). */

const MIN_MINUTES = 15;
const MAX_MINUTES = 2 * 60;
const PCT_OF_HOURS_LEFT = 0.05;

/** clamp(5% of hours until lot expiry, 15 min, 2 h), in minutes. */
export function paymentDeadlineMinutes(hoursUntilExpiry: number): number {
  const raw = Math.max(0, hoursUntilExpiry) * 60 * PCT_OF_HOURS_LEFT;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, raw));
}

export function computePaymentDeadline(now: Date, hoursUntilExpiry: number): Date {
  const minutes = paymentDeadlineMinutes(hoursUntilExpiry);
  return new Date(now.getTime() + minutes * 60 * 1000);
}
