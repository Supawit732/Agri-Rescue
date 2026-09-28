export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'refunded';

const TRANSITIONS: ReadonlyArray<readonly [PaymentStatus, PaymentStatus]> = [
  ['pending', 'paid'],
  ['pending', 'expired'],
];

export class InvalidPaymentTransitionError extends Error {
  readonly from: PaymentStatus;
  readonly to: PaymentStatus;

  constructor(from: PaymentStatus, to: PaymentStatus) {
    super(`Invalid payment transition: ${from} -> ${to}`);
    this.name = 'InvalidPaymentTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (from === to) {
    return;
  }
  const allowed = TRANSITIONS.some(([start, end]) => start === from && end === to);
  if (!allowed) {
    throw new InvalidPaymentTransitionError(from, to);
  }
}
