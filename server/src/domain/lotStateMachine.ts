export type LotStatus = 'open' | 'reserved' | 'picked' | 'delivered' | 'expired' | 'cancelled';

const TRANSITIONS: ReadonlyArray<readonly [LotStatus, LotStatus]> = [
  ['open', 'reserved'],
  ['reserved', 'picked'],
  ['picked', 'delivered'],
  ['open', 'expired'],
  ['reserved', 'open'],
];

export class InvalidLotTransitionError extends Error {
  readonly from: LotStatus;
  readonly to: LotStatus;

  constructor(from: LotStatus, to: LotStatus) {
    super(`Invalid lot transition: ${from} -> ${to}`);
    this.name = 'InvalidLotTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function assertLotTransition(from: LotStatus, to: LotStatus): void {
  const allowed = TRANSITIONS.some(([start, end]) => start === from && end === to);
  if (!allowed) {
    throw new InvalidLotTransitionError(from, to);
  }
}
