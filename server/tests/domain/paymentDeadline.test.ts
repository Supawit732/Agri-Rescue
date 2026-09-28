import { computePaymentDeadline, paymentDeadlineMinutes } from '../../src/domain/paymentDeadline';

describe('paymentDeadlineMinutes', () => {
  it('clamps to 15 minutes when 5% of hours left is smaller', () => {
    expect(paymentDeadlineMinutes(1)).toBe(15); // 5% of 60min = 3min -> clamp to 15
    expect(paymentDeadlineMinutes(0)).toBe(15);
    expect(paymentDeadlineMinutes(-5)).toBe(15);
  });

  it('clamps to 2 hours when 5% of hours left is larger', () => {
    expect(paymentDeadlineMinutes(100)).toBe(120); // 5% of 6000min = 300min -> clamp to 120
  });

  it('returns 5% of hours left in minutes within the clamp range', () => {
    // 40 hours left -> 40*60*0.05 = 120min exactly at the upper clamp boundary
    expect(paymentDeadlineMinutes(40)).toBe(120);
    // 20 hours left -> 20*60*0.05 = 60min, inside the clamp range
    expect(paymentDeadlineMinutes(20)).toBe(60);
  });
});

describe('computePaymentDeadline', () => {
  it('adds the clamped minutes to now', () => {
    const now = new Date('2026-09-22T00:00:00.000Z');
    const deadline = computePaymentDeadline(now, 20);
    expect(deadline.toISOString()).toBe('2026-09-22T01:00:00.000Z');
  });

  it('never returns a deadline before 15 minutes from now', () => {
    const now = new Date('2026-09-22T00:00:00.000Z');
    const deadline = computePaymentDeadline(now, 0.1);
    expect(deadline.getTime() - now.getTime()).toBe(15 * 60 * 1000);
  });
});
