import {
  lotStatusFromRemaining,
  remainingLotKg,
  validateOrderQuantity,
} from '../../src/domain/lotInventory';

describe('remainingLotKg / lotStatusFromRemaining', () => {
  it('computes remaining and maps status', () => {
    expect(remainingLotKg(10, 0)).toBe(10);
    expect(remainingLotKg(10, 4)).toBe(6);
    expect(remainingLotKg(10, 10)).toBe(0);
    expect(remainingLotKg(10, 10.0000001)).toBe(0);

    expect(lotStatusFromRemaining(10, 10)).toBe('open');
    expect(lotStatusFromRemaining(6, 10)).toBe('partially_reserved');
    expect(lotStatusFromRemaining(0, 10)).toBe('fully_reserved');
  });
});

describe('validateOrderQuantity', () => {
  const base = {
    remainingKg: 10,
    minOrderKg: 2,
    orderStepKg: 1,
    splitAllowed: true,
  };

  it('rejects below min order', () => {
    const result = validateOrderQuantity({ ...base, quantityKg: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('quantity_below_min');
      expect(result.message).toContain('ขั้นต่ำ');
    }
  });

  it('rejects non-step multiples', () => {
    const result = validateOrderQuantity({
      ...base,
      orderStepKg: 2,
      minOrderKg: 2,
      quantityKg: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('quantity_step');
      expect(result.message).toContain('พหุคูณ');
    }
  });

  it('requires whole remaining when split is not allowed', () => {
    const partial = validateOrderQuantity({
      ...base,
      splitAllowed: false,
      quantityKg: 5,
    });
    expect(partial.ok).toBe(false);
    if (!partial.ok) {
      expect(partial.error).toBe('quantity_whole_lot_only');
    }

    const full = validateOrderQuantity({
      ...base,
      splitAllowed: false,
      quantityKg: 10,
    });
    expect(full).toEqual({ ok: true });
  });

  it('allows remainder tail below min when taking all leftover', () => {
    const leftover = validateOrderQuantity({
      remainingKg: 1.5,
      minOrderKg: 2,
      orderStepKg: 1,
      splitAllowed: true,
      quantityKg: 1,
    });
    expect(leftover.ok).toBe(false);
    if (!leftover.ok) {
      expect(leftover.error).toBe('quantity_remainder_only');
    }

    const takeAll = validateOrderQuantity({
      remainingKg: 1.5,
      minOrderKg: 2,
      orderStepKg: 1,
      splitAllowed: true,
      quantityKg: 1.5,
    });
    expect(takeAll).toEqual({ ok: true });
  });

  it('accepts valid split quantities', () => {
    expect(validateOrderQuantity({ ...base, quantityKg: 2 })).toEqual({ ok: true });
    expect(validateOrderQuantity({ ...base, quantityKg: 10 })).toEqual({ ok: true });
  });
});
