import {
  defaultRouteSolver,
  nearestNeighbor,
  pickNearest,
  respectsPrecedence,
  routeDistanceKm,
  twoOpt,
  type RoutableStop,
} from '../../src/domain/routing';
import type { LatLng } from '../../src/domain/geo';

const depot: LatLng = { lat: 13.65, lng: 100.62 };

function stop(
  id: string,
  kind: RoutableStop['kind'],
  buyerId: string,
  lat: number,
  lng: number,
): RoutableStop {
  return { id, kind, buyerId, lat, lng };
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = copy[index];
    const other = copy[swap];
    if (current === undefined || other === undefined) {
      continue;
    }
    copy[index] = other;
    copy[swap] = current;
  }
  return copy;
}

describe('routing', () => {
  it('visits a farther pickup before a closer drop for the same buyer', () => {
    const stops = [
      stop('drop-a', 'drop', 'a', 13.651, 100.621),
      stop('pickup-a', 'pickup', 'a', 13.8, 100.8),
    ];
    const route = nearestNeighbor(depot, stops);
    expect(route.map((item) => item.id)).toEqual(['pickup-a', 'drop-a']);
    expect(respectsPrecedence(route)).toBe(true);
  });

  it('keeps the earlier stop when distances are equal', () => {
    const here = { lat: 13.65, lng: 100.62 };
    const chosen = pickNearest(depot, [stop('first', 'pickup', 'a', here.lat, here.lng), stop('second', 'pickup', 'b', here.lat, here.lng)]);
    expect(chosen.id).toBe('first');
  });

  it('throws when there is no feasible stop', () => {
    expect(() => pickNearest(depot, [])).toThrow('No feasible stop');
  });

  it('does not let 2-opt increase the nearest-neighbor distance', () => {
    const stops = [
      stop('a-pickup', 'pickup', 'a', 0, 5),
      stop('b-pickup', 'pickup', 'b', 0, 1),
      stop('b-drop', 'drop', 'b', 0, 2),
      stop('a-drop', 'drop', 'a', 0, 4),
    ];
    const nn = [stops[0], stops[1], stops[2], stops[3]].filter((item): item is RoutableStop => item !== undefined);
    const improved = twoOpt({ lat: 0, lng: 0 }, nn);
    expect(routeDistanceKm({ lat: 0, lng: 0 }, improved)).toBeLessThan(routeDistanceKm({ lat: 0, lng: 0 }, nn));
    expect(respectsPrecedence(improved)).toBe(true);
    expect(respectsPrecedence([stops[2], stops[1], stops[0], stops[3]].filter((item): item is RoutableStop => item !== undefined))).toBe(false);
  });

  it('allows a drop that has no pickup in the route', () => {
    expect(respectsPrecedence([stop('drop-only', 'drop', 'a', 13.66, 100.63)])).toBe(true);
  });

  it('returns an empty route for no stops', () => {
    expect(defaultRouteSolver.solve(depot, [])).toEqual([]);
    expect(routeDistanceKm(depot, [])).toBe(0);
    expect(nearestNeighbor(depot, [stop('only', 'pickup', 'a', 13.7, 100.7)])).toHaveLength(1);
  });

  it('keeps precedence in 100 seeded random cases and never worsens 2-opt', () => {
    const random = mulberry32(20260922);
    for (let scenario = 0; scenario < 100; scenario += 1) {
      const buyerCount = 1 + Math.floor(random() * 4);
      const stops: RoutableStop[] = [];
      for (let buyer = 0; buyer < buyerCount; buyer += 1) {
        const buyerId = `buyer-${scenario}-${buyer}`;
        const pickupCount = 1 + Math.floor(random() * 3);
        for (let pickup = 0; pickup < pickupCount; pickup += 1) {
          stops.push(stop(`${buyerId}-p${pickup}`, 'pickup', buyerId, 13 + random() * 0.3, 100.4 + random() * 0.4));
        }
        stops.push(stop(`${buyerId}-drop`, 'drop', buyerId, 13 + random() * 0.3, 100.4 + random() * 0.4));
      }
      const input = shuffle(stops, random);
      const nn = nearestNeighbor(depot, input);
      const solved = twoOpt(depot, nn);
      expect(solved).toHaveLength(input.length);
      expect(respectsPrecedence(nn)).toBe(true);
      expect(respectsPrecedence(solved)).toBe(true);
      expect(routeDistanceKm(depot, solved)).toBeLessThanOrEqual(routeDistanceKm(depot, nn) + 1e-9);
      expect(defaultRouteSolver.solve(depot, input).map((item) => item.id)).toEqual(solved.map((item) => item.id));
    }
  });
});
