export type LotStatus =
  | 'open'
  | 'partially_reserved'
  | 'fully_reserved'
  | 'picked'
  | 'delivered'
  | 'expired'
  | 'cancelled';

const TRANSITIONS: ReadonlyArray<readonly [LotStatus, LotStatus]> = [
  ['open', 'partially_reserved'],
  ['open', 'fully_reserved'],
  ['partially_reserved', 'fully_reserved'],
  ['partially_reserved', 'open'],
  ['fully_reserved', 'partially_reserved'],
  ['fully_reserved', 'open'],
  ['partially_reserved', 'picked'],
  ['fully_reserved', 'picked'],
  ['picked', 'delivered'],
  ['partially_reserved', 'delivered'],
  ['fully_reserved', 'delivered'],
  ['open', 'expired'],
  ['partially_reserved', 'expired'],
  ['open', 'cancelled'],
  ['partially_reserved', 'cancelled'],
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
  if (from === to) {
    return;
  }
  const allowed = TRANSITIONS.some(([start, end]) => start === from && end === to);
  if (!allowed) {
    throw new InvalidLotTransitionError(from, to);
  }
}
