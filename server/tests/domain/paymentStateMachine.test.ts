import {
  assertPaymentTransition,
  InvalidPaymentTransitionError,
  type PaymentStatus,
} from '../../src/domain/paymentStateMachine';

const STATUSES: PaymentStatus[] = ['pending', 'paid', 'expired', 'refunded'];

const ALLOWED: ReadonlyArray<readonly [PaymentStatus, PaymentStatus]> = [
  ['pending', 'paid'],
  ['pending', 'expired'],
];

describe('assertPaymentTransition', () => {
  it('accepts only the transitions in the plan', () => {
    for (const [from, to] of ALLOWED) {
      expect(() => assertPaymentTransition(from, to)).not.toThrow();
    }
  });

  it('allows same-status no-ops', () => {
    for (const status of STATUSES) {
      expect(() => assertPaymentTransition(status, status)).not.toThrow();
    }
  });

  it('throws for every transition that is not in the plan', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to) {
          continue;
        }
        const allowed = ALLOWED.some(([start, end]) => start === from && end === to);
        if (allowed) {
          continue;
        }
        expect(() => assertPaymentTransition(from, to)).toThrow(InvalidPaymentTransitionError);
        expect(() => assertPaymentTransition(from, to)).toThrow(
          `Invalid payment transition: ${from} -> ${to}`,
        );
      }
    }
  });
});
