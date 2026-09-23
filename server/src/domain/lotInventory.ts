/** Phase 6.1e — remaining weight and order quantity rules (pure). */

const EPS = 1e-6;

function toGrams(kg: number): number {
  return Math.round(kg * 1000);
}

export function remainingLotKg(weightKg: number, reservedKgSum: number): number {
  const left = weightKg - reservedKgSum;
  return left > EPS ? roundKg(left) : 0;
}

export function roundKg(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

export type QuantityValidationError =
  | 'quantity_required'
  | 'quantity_exceeds_remaining'
  | 'quantity_below_min'
  | 'quantity_step'
  | 'quantity_whole_lot_only'
  | 'quantity_remainder_only';

export function validateOrderQuantity(input: {
  quantityKg: number;
  remainingKg: number;
  minOrderKg: number;
  orderStepKg: number;
  splitAllowed: boolean;
}):
  | { ok: true }
  | { ok: false; error: QuantityValidationError; message: string } {
  const qty = input.quantityKg;
  const remaining = input.remainingKg;
  if (!(qty > 0) || !Number.isFinite(qty)) {
    return { ok: false, error: 'quantity_required', message: 'กรุณาระบุจำนวนกิโลกรัม' };
  }
  if (remaining <= EPS) {
    return { ok: false, error: 'quantity_exceeds_remaining', message: 'ล็อตนี้ไม่มีน้ำหนักคงเหลือ' };
  }
  if (qty - remaining > EPS) {
    return {
      ok: false,
      error: 'quantity_exceeds_remaining',
      message: `จองได้ไม่เกิน ${remaining} กก.`,
    };
  }
  if (!input.splitAllowed) {
    if (Math.abs(qty - remaining) > EPS) {
      return {
        ok: false,
        error: 'quantity_whole_lot_only',
        message: 'ล็อตนี้ขายยกล็อตเท่านั้น ต้องจองเต็มจำนวนคงเหลือ',
      };
    }
    return { ok: true };
  }
  const isRemainderTail = remaining + EPS < input.minOrderKg;
  if (isRemainderTail) {
    if (Math.abs(qty - remaining) > EPS) {
      return {
        ok: false,
        error: 'quantity_remainder_only',
        message: `เหลือเศษ ${remaining} กก. — ต้องจองทั้งเศษ`,
      };
    }
    return { ok: true };
  }
  if (qty + EPS < input.minOrderKg) {
    return {
      ok: false,
      error: 'quantity_below_min',
      message: `ขั้นต่ำต่อคำสั่งซื้อ ${input.minOrderKg} กก.`,
    };
  }
  const stepG = toGrams(input.orderStepKg);
  if (stepG <= 0) {
    return { ok: false, error: 'quantity_step', message: 'ขั้นการจองไม่ถูกต้อง' };
  }
  const qtyG = toGrams(qty);
  if (qtyG % stepG !== 0) {
    return {
      ok: false,
      error: 'quantity_step',
      message: `จำนวนต้องเป็นพหุคูณของ ${input.orderStepKg} กก.`,
    };
  }
  return { ok: true };
}

export type BookableLotStatus = 'open' | 'partially_reserved' | 'fully_reserved';

export function lotStatusFromRemaining(remainingKg: number, weightKg: number): BookableLotStatus {
  if (remainingKg <= EPS) {
    return 'fully_reserved';
  }
  if (remainingKg + EPS >= weightKg) {
    return 'open';
  }
  return 'partially_reserved';
}

export function isBookableLotStatus(status: string): boolean {
  return status === 'open' || status === 'partially_reserved';
}

/** Weight may shrink but not below already-reserved (non-cancelled) quantity. */
export function validateLotWeightPatch(input: {
  nextWeightKg: number;
  reservedKgSum: number;
}): { ok: true } | { ok: false; message: string } {
  if (!(input.nextWeightKg > 0)) {
    return { ok: false, message: 'น้ำหนักต้องมากกว่า 0' };
  }
  if (input.nextWeightKg + EPS < input.reservedKgSum) {
    return {
      ok: false,
      message: `ลดน้ำหนักต่ำกว่ายอดจองไม่ได้ (จองแล้ว ${input.reservedKgSum} กก.)`,
    };
  }
  return { ok: true };
}
