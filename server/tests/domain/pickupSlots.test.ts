import {
  listPickupSlots,
  MIN_HOURS_BEFORE_EXPIRY,
  naiveHomeAndBackKm,
  orderRouteRespectingSlots,
  parsePickupDateParam,
  respectsPickupSlotOrder,
  routeWithReturnKm,
  validatePickupSlot,
} from '../../src/domain/pickupSlots';

describe('pickupSlots', () => {
  const now = new Date('2026-10-01T03:00:00.000Z'); // 10:00 Bangkok
  const expires = new Date('2026-10-04T12:00:00.000Z');

  it('lists today and tomorrow windows with availability gates', () => {
    const slots = listPickupSlots(expires, now);
    expect(slots).toHaveLength(8);
    expect(slots.filter((s) => s.day === 'today')).toHaveLength(4);
    // 08-10 today ended by 10:00 BKK
    const today0810 = slots.find((s) => s.key === 'today-08-10');
    expect(today0810?.available).toBe(false);
    expect(today0810?.reason_code).toBe('past');
    const today1012 = slots.find((s) => s.key === 'today-10-12');
    expect(today1012?.available).toBe(false); // start == now → started
    expect(today1012?.reason_code).toBe('started');
    const today1315 = slots.find((s) => s.key === 'today-13-15');
    expect(today1315?.available).toBe(true);
    const tomorrow = slots.filter((s) => s.day === 'tomorrow');
    expect(tomorrow.every((s) => s.available)).toBe(true);
  });

  it('disables slots that end too close to lot expiry', () => {
    const soonExpires = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    const slots = listPickupSlots(soonExpires, now);
    const tooClose = slots.filter((s) => s.reason_code === 'too_close_to_expiry');
    expect(tooClose.length).toBeGreaterThan(0);
    const firstAvailable = slots.find((s) => s.available);
    if (firstAvailable !== undefined) {
      expect(
        new Date(firstAvailable.end_at).getTime() + MIN_HOURS_BEFORE_EXPIRY * 3600_000,
      ).toBeLessThanOrEqual(soonExpires.getTime());
    }
  });

  it('validates matching window, start in future, and expiry gap', () => {
    const goodStart = new Date('2026-10-02T06:00:00.000Z'); // 13:00 BKK tomorrow relative to now? Oct 2 06:00 UTC = 13:00 BKK
    const goodEnd = new Date('2026-10-02T08:00:00.000Z'); // 15:00 BKK
    expect(validatePickupSlot({ slotStart: goodStart, slotEnd: goodEnd, expiresAt: expires, now }).ok).toBe(true);

    const badWindow = validatePickupSlot({
      slotStart: new Date('2026-10-02T06:30:00.000Z'),
      slotEnd: new Date('2026-10-02T08:30:00.000Z'),
      expiresAt: expires,
      now,
    });
    expect(badWindow.ok).toBe(false);
    expect(badWindow.code).toBe('PICKUP_SLOT_INVALID');

    const pastStart = validatePickupSlot({
      slotStart: new Date('2026-10-01T01:00:00.000Z'),
      slotEnd: new Date('2026-10-01T03:00:00.000Z'),
      expiresAt: expires,
      now,
    });
    expect(pastStart.ok).toBe(false);

    const tooClose = validatePickupSlot({
      slotStart: new Date('2026-10-03T08:00:00.000Z'),
      slotEnd: new Date('2026-10-03T10:00:00.000Z'),
      expiresAt: new Date('2026-10-03T11:00:00.000Z'),
      now,
    });
    expect(tooClose.ok).toBe(false);
    expect(tooClose.code).toBe('PICKUP_SLOT_TOO_CLOSE');
  });

  it('parses Bangkok calendar day params', () => {
    const day = parsePickupDateParam('2026-10-01');
    // 2026-10-01 00:00 BKK = 2026-09-30 17:00 UTC
    expect(day.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(() => parsePickupDateParam('nope')).toThrow();
  });

  it('falls back to appointment order when distance order would violate slots', () => {
    const depot = { lat: 13.65, lng: 100.62 };
    const early = {
      id: 'early',
      lat: 13.8,
      lng: 100.8,
      slotStart: new Date('2026-10-01T01:00:00.000Z'),
    };
    const late = {
      id: 'late',
      lat: 13.66,
      lng: 100.63,
      slotStart: new Date('2026-10-01T06:00:00.000Z'),
    };
    expect(respectsPickupSlotOrder([early, late])).toBe(true);
    expect(respectsPickupSlotOrder([late, early])).toBe(false);

    const distanceIds = () => ['late', 'early']; // nearer first
    const byDistance = orderRouteRespectingSlots(depot, [early, late], distanceIds);
    expect(byDistance.orderedBy).toBe('pickup_slot');
    expect(byDistance.route.map((s) => s.id)).toEqual(['early', 'late']);

    const alreadyOk = orderRouteRespectingSlots(depot, [early, late], () => ['early', 'late']);
    expect(alreadyOk.orderedBy).toBe('distance');
  });

  it('computes multi-stop return path vs home-and-back', () => {
    const depot = { lat: 13.65, lng: 100.62 };
    const stops = [
      { lat: 13.66, lng: 100.63 },
      { lat: 13.7, lng: 100.7 },
    ];
    const routeKm = routeWithReturnKm(depot, stops);
    const naiveKm = naiveHomeAndBackKm(depot, stops);
    expect(routeKm).toBeGreaterThan(0);
    expect(naiveKm).toBeGreaterThan(routeKm);
    expect(routeWithReturnKm(depot, [])).toBe(0);
  });
});
