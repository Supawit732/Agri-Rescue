import { haversineKm, type LatLng } from './geo';

/** Asia/Bangkok is UTC+7 year-round (no DST). */
export const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Slot must end at least this many hours before lot expires_at. */
export const MIN_HOURS_BEFORE_EXPIRY = 2;

export interface PickupSlotWindow {
  key: string;
  startHour: number;
  endHour: number;
}

export const PICKUP_SLOT_WINDOWS: readonly PickupSlotWindow[] = [
  { key: '08-10', startHour: 8, endHour: 10 },
  { key: '10-12', startHour: 10, endHour: 12 },
  { key: '13-15', startHour: 13, endHour: 15 },
  { key: '15-17', startHour: 15, endHour: 17 },
];

export type PickupSlotReasonCode = 'ok' | 'started' | 'past' | 'too_close_to_expiry';

export interface PickupSlotOption {
  key: string;
  day: 'today' | 'tomorrow';
  start_at: string;
  end_at: string;
  available: boolean;
  reason_code: PickupSlotReasonCode;
}

export interface PickupSlotValidation {
  ok: boolean;
  code?: 'PICKUP_SLOT_REQUIRED' | 'PICKUP_SLOT_INVALID' | 'PICKUP_SLOT_TOO_CLOSE';
  message?: string;
}

function bangkokDayStart(now: Date, dayOffset: 0 | 1): Date {
  const shifted = new Date(now.getTime() + BKK_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return new Date(shifted.getTime() - BKK_OFFSET_MS);
}

function slotAt(dayStart: Date, window: PickupSlotWindow): { start: Date; end: Date } {
  const start = new Date(dayStart.getTime() + window.startHour * 60 * 60 * 1000);
  const end = new Date(dayStart.getTime() + window.endHour * 60 * 60 * 1000);
  return { start, end };
}

/** Two days of slots: today + tomorrow (Bangkok calendar), gated by lot expiry and clock. */
export function listPickupSlots(expiresAt: Date, now: Date = new Date()): PickupSlotOption[] {
  const options: PickupSlotOption[] = [];
  const days: Array<{ offset: 0 | 1; label: 'today' | 'tomorrow' }> = [
    { offset: 0, label: 'today' },
    { offset: 1, label: 'tomorrow' },
  ];
  for (const day of days) {
    const dayStart = bangkokDayStart(now, day.offset);
    for (const window of PICKUP_SLOT_WINDOWS) {
      const { start, end } = slotAt(dayStart, window);
      let available = true;
      let reason_code: PickupSlotReasonCode = 'ok';
      if (end.getTime() + MIN_HOURS_BEFORE_EXPIRY * 60 * 60 * 1000 > expiresAt.getTime()) {
        available = false;
        reason_code = 'too_close_to_expiry';
      } else if (start.getTime() <= now.getTime()) {
        available = false;
        reason_code = start.getTime() <= now.getTime() && end.getTime() > now.getTime()
          ? 'started'
          : 'past';
      }
      options.push({
        key: `${day.label}-${window.key}`,
        day: day.label,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        available,
        reason_code,
      });
    }
  }
  return options;
}

function matchesWindow(start: Date, end: Date): boolean {
  const bkk = new Date(start.getTime() + BKK_OFFSET_MS);
  const hour = bkk.getUTCHours();
  const minute = bkk.getUTCMinutes();
  const startMinutes = hour * 60 + minute;
  const endBkk = new Date(end.getTime() + BKK_OFFSET_MS);
  const endMinutes = endBkk.getUTCHours() * 60 + endBkk.getUTCMinutes();
  return PICKUP_SLOT_WINDOWS.some(
    (w) =>
      startMinutes === w.startHour * 60 &&
      endMinutes === w.endHour * 60 &&
      // same Bangkok calendar day for start/end
      bkk.toISOString().slice(0, 10) === endBkk.toISOString().slice(0, 10),
  );
}

export function validatePickupSlot(input: {
  slotStart: Date;
  slotEnd: Date;
  expiresAt: Date;
  now?: Date;
}): PickupSlotValidation {
  const now = input.now ?? new Date();
  if (!(input.slotEnd.getTime() > input.slotStart.getTime())) {
    return {
      ok: false,
      code: 'PICKUP_SLOT_INVALID',
      message: 'ช่วงเวลารับของไม่ถูกต้อง',
    };
  }
  if (!matchesWindow(input.slotStart, input.slotEnd)) {
    return {
      ok: false,
      code: 'PICKUP_SLOT_INVALID',
      message: 'กรุณาเลือกช่วงเวลารับของที่ระบบกำหนด',
    };
  }
  if (input.slotStart.getTime() <= now.getTime()) {
    return {
      ok: false,
      code: 'PICKUP_SLOT_INVALID',
      message: 'ช่วงเวลานี้เริ่มแล้ว กรุณาเลือกช่วงถัดไป',
    };
  }
  if (
    input.slotEnd.getTime() + MIN_HOURS_BEFORE_EXPIRY * 60 * 60 * 1000 >
    input.expiresAt.getTime()
  ) {
    return {
      ok: false,
      code: 'PICKUP_SLOT_TOO_CLOSE',
      message: `ช่วงรับของต้องจบก่อนล็อตหมดอายุอย่างน้อย ${String(MIN_HOURS_BEFORE_EXPIRY)} ชม.`,
    };
  }
  return { ok: true };
}

export function parsePickupDateParam(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error('Invalid date');
  }
  const [, y, m, d] = match;
  // Interpret as Bangkok calendar day → UTC midnight of that BKK day
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)) - BKK_OFFSET_MS);
}

/** True when non-decreasing by appointment start (safe under time-first rule). */
export function respectsPickupSlotOrder(
  route: ReadonlyArray<{ slotStart: Date | string }>,
): boolean {
  const times = route.map((s) =>
    typeof s.slotStart === 'string' ? new Date(s.slotStart).getTime() : s.slotStart.getTime(),
  );
  for (let i = 1; i < times.length; i += 1) {
    const prev = times[i - 1] as number;
    const curr = times[i] as number;
    if (curr < prev) {
      return false;
    }
  }
  return true;
}

export interface RouteStopLike extends LatLng {
  id: string;
  slotStart: Date | string;
}

export interface OrderedRoute<T extends RouteStopLike> {
  route: T[];
  orderedBy: 'distance' | 'pickup_slot';
}

/**
 * Prefer NN+2-opt when it already visits in non-decreasing slot order;
 * otherwise fall back to appointment time order so buyers are not late.
 * `orderIds` returns stop ids in distance-optimal sequence (e.g. from RouteSolver).
 */
export function orderRouteRespectingSlots<T extends RouteStopLike>(
  depot: LatLng,
  stops: readonly T[],
  orderIds: (depot: LatLng, stops: readonly T[]) => string[],
): OrderedRoute<T> {
  const byId = new Map(stops.map((s) => [s.id, s] as const));
  const idOrder = orderIds(depot, stops);
  const distanceRoute: T[] = [];
  for (const id of idOrder) {
    const stop = byId.get(id);
    if (stop !== undefined) {
      distanceRoute.push(stop);
    }
  }
  if (distanceRoute.length === stops.length && respectsPickupSlotOrder(distanceRoute)) {
    return { route: distanceRoute, orderedBy: 'distance' };
  }
  const timeRoute = [...stops].sort((a, b) => {
    const at = typeof a.slotStart === 'string' ? new Date(a.slotStart).getTime() : a.slotStart.getTime();
    const bt = typeof b.slotStart === 'string' ? new Date(b.slotStart).getTime() : b.slotStart.getTime();
    if (at !== bt) {
      return at - bt;
    }
    return haversineKm(depot, a) - haversineKm(depot, b);
  });
  return { route: timeRoute, orderedBy: 'pickup_slot' };
}

/** Sum of per-stop round trips home: 2 × Σ depot↔stop. */
export function naiveHomeAndBackKm(depot: LatLng, stops: readonly LatLng[]): number {
  return stops.reduce((sum, stop) => sum + 2 * haversineKm(depot, stop), 0);
}

/** Multi-stop path including return home. */
export function routeWithReturnKm(depot: LatLng, route: readonly LatLng[]): number {
  if (route.length === 0) {
    return 0;
  }
  let total = 0;
  let current: LatLng = depot;
  for (const stop of route) {
    total += haversineKm(current, stop);
    current = stop;
  }
  total += haversineKm(current, depot);
  return total;
}
