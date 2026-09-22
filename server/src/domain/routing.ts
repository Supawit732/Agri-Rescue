import { haversineKm, type LatLng } from './geo';

export interface RoutableStop extends LatLng {
  id: string;
  kind: 'pickup' | 'drop';
  buyerId: string;
}

export interface RouteSolver {
  solve(depot: LatLng, stops: readonly RoutableStop[]): RoutableStop[];
}

export function respectsPrecedence(route: readonly RoutableStop[]): boolean {
  const pickupCount = new Map<string, number>();
  for (const stop of route) {
    if (stop.kind === 'pickup') {
      pickupCount.set(stop.buyerId, (pickupCount.get(stop.buyerId) ?? 0) + 1);
    }
  }
  const seenPickups = new Map<string, number>();
  for (const stop of route) {
    if (stop.kind === 'pickup') {
      seenPickups.set(stop.buyerId, (seenPickups.get(stop.buyerId) ?? 0) + 1);
      continue;
    }
    const required = pickupCount.get(stop.buyerId) ?? 0;
    const seen = seenPickups.get(stop.buyerId) ?? 0;
    if (seen < required) {
      return false;
    }
  }
  return true;
}

export function routeDistanceKm(depot: LatLng, route: readonly RoutableStop[]): number {
  let total = 0;
  let current: LatLng = depot;
  for (const stop of route) {
    total += haversineKm(current, stop);
    current = stop;
  }
  return total;
}

function canVisit(stop: RoutableStop, remaining: readonly RoutableStop[]): boolean {
  if (stop.kind === 'pickup') {
    return true;
  }
  return !remaining.some((other) => other.kind === 'pickup' && other.buyerId === stop.buyerId);
}

export function pickNearest(current: LatLng, stops: readonly RoutableStop[]): RoutableStop {
  const first = stops[0];
  if (first === undefined) {
    throw new Error('No feasible stop');
  }
  let best = first;
  let bestDistance = haversineKm(current, first);
  for (const stop of stops.slice(1)) {
    const distance = haversineKm(current, stop);
    if (distance < bestDistance) {
      best = stop;
      bestDistance = distance;
    }
  }
  return best;
}

export function nearestNeighbor(depot: LatLng, stops: readonly RoutableStop[]): RoutableStop[] {
  const remaining = [...stops];
  const route: RoutableStop[] = [];
  let current: LatLng = depot;
  while (remaining.length > 0) {
    const feasible = remaining.filter((stop) => canVisit(stop, remaining));
    const next = pickNearest(current, feasible);
    route.push(next);
    const index = remaining.indexOf(next);
    remaining.splice(index, 1);
    current = next;
  }
  return route;
}

function reverseSegment(route: readonly RoutableStop[], start: number, end: number): RoutableStop[] {
  const next = [...route];
  const segment = next.slice(start, end + 1).reverse();
  next.splice(start, segment.length, ...segment);
  return next;
}

export function twoOpt(depot: LatLng, route: readonly RoutableStop[]): RoutableStop[] {
  let best = [...route];
  let improved = true;
  while (improved) {
    improved = false;
    for (let start = 0; start < best.length - 1; start += 1) {
      for (let end = start + 1; end < best.length; end += 1) {
        const candidate = reverseSegment(best, start, end);
        if (!respectsPrecedence(candidate)) {
          continue;
        }
        if (routeDistanceKm(depot, candidate) < routeDistanceKm(depot, best)) {
          best = candidate;
          improved = true;
          break;
        }
      }
      if (improved) {
        break;
      }
    }
  }
  return best;
}

export class PrecedenceRouteSolver implements RouteSolver {
  solve(depot: LatLng, stops: readonly RoutableStop[]): RoutableStop[] {
    return twoOpt(depot, nearestNeighbor(depot, stops));
  }
}

export const defaultRouteSolver: RouteSolver = new PrecedenceRouteSolver();
