import { assertLotTransition, InvalidLotTransitionError, type LotStatus } from '../../src/domain/lotStateMachine';

const STATUSES: LotStatus[] = ['open', 'reserved', 'picked', 'delivered', 'expired', 'cancelled'];
const ALLOWED: ReadonlyArray<readonly [LotStatus, LotStatus]> = [
  ['open', 'reserved'],
  ['reserved', 'picked'],
  ['picked', 'delivered'],
  ['open', 'expired'],
  ['reserved', 'open'],
];

describe('assertLotTransition', () => {
  it('accepts only the transitions in the plan', () => {
    for (const [from, to] of ALLOWED) {
      expect(() => assertLotTransition(from, to)).not.toThrow();
    }
  });

  it('throws for every transition that is not in the plan', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
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
