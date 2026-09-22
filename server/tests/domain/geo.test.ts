import { haversineKm } from '../../src/domain/geo';

describe('haversineKm', () => {
  it('is zero for the same point and symmetric', () => {
    const depot = { lat: 13.65, lng: 100.62 };
    const lot = { lat: 13.668, lng: 100.628 };
    expect(haversineKm(depot, depot)).toBe(0);
    expect(haversineKm(depot, lot)).toBeCloseTo(haversineKm(lot, depot), 6);
    expect(haversineKm(depot, lot)).toBeGreaterThan(0);
  });

  it('matches one degree of longitude at the equator', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
  });
});
