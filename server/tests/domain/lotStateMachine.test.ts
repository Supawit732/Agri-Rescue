import { assertLotTransition, InvalidLotTransitionError, type LotStatus } from '../../src/domain/lotStateMachine';

const STATUSES: LotStatus[] = [
  'open',
  'partially_reserved',
  'fully_reserved',
  'picked',
  'delivered',
  'expired',
  'cancelled',
];

const ALLOWED: ReadonlyArray<readonly [LotStatus, LotStatus]> = [
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

describe('assertLotTransition', () => {
  it('accepts only the transitions in the plan', () => {
    for (const [from, to] of ALLOWED) {
      expect(() => assertLotTransition(from, to)).not.toThrow();
    }
  });

  it('allows same-status no-ops', () => {
    for (const status of STATUSES) {
      expect(() => assertLotTransition(status, status)).not.toThrow();
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
        expect(() => assertLotTransition(from, to)).toThrow(InvalidLotTransitionError);
        expect(() => assertLotTransition(from, to)).toThrow(`Invalid lot transition: ${from} -> ${to}`);
      }
    }
  });
});
