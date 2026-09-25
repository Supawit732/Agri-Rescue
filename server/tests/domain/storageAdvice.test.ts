import {
  adviceAudience,
  buildStorageAdvice,
} from '../../src/domain/storageAdvice';

describe('storageAdvice', () => {
  const base = {
    buyerType: 'vendor',
    isDonation: false,
    fridgeOk: true,
    fridgeExtraDays: 3,
    expiresAt: new Date('2026-10-01T12:00:00.000Z'),
  };

  it('audience by buyer type / donation', () => {
    expect(adviceAudience({ buyerType: 'vendor', isDonation: false })).toBe('sell');
    expect(adviceAudience({ buyerType: 'shop', isDonation: false })).toBe('sell');
    expect(adviceAudience({ buyerType: 'charity', isDonation: false })).toBe('distribute');
    expect(adviceAudience({ buyerType: null, isDonation: true })).toBe('distribute');
    expect(adviceAudience({ buyerType: 'vendor', isDonation: true })).toBe('distribute');
    expect(adviceAudience({ buyerType: null, isDonation: false })).toBe('eat');
  });

  it('consume-by equals lot expiry; fridge extends expiry', () => {
    const advice = buildStorageAdvice({ ...base, now: new Date('2026-09-30T12:00:00.000Z') });
    expect(advice.consumeBy).toBe('2026-10-01T12:00:00.000Z');
    expect(advice.hoursLeft).toBe(24);
    expect(advice.fridgeUntil).toBe('2026-10-04T12:00:00.000Z');
    expect(advice.fridgeExtraDays).toBe(3);
    expect(advice.priceDropHint).toBe(false);
  });

  it('price drop hint under 12h for resellers only', () => {
    const soon = buildStorageAdvice({
      ...base,
      buyerType: 'vendor',
      now: new Date('2026-10-01T01:00:00.000Z'),
    });
    expect(soon.hoursLeft).toBe(11);
    expect(soon.priceDropHint).toBe(true);

    const eater = buildStorageAdvice({
      ...base,
      buyerType: null,
      now: new Date('2026-10-01T01:00:00.000Z'),
    });
    expect(eater.audience).toBe('eat');
    expect(eater.priceDropHint).toBe(false);
  });

  it('no fridge extension when fridge_ok is false', () => {
    const advice = buildStorageAdvice({
      ...base,
      fridgeOk: false,
      fridgeExtraDays: 5,
      now: new Date('2026-09-30T00:00:00.000Z'),
    });
    expect(advice.fridgeUntil).toBeNull();
    expect(advice.fridgeExtraDays).toBe(0);
  });

  it('passes through storage tips without generating text', () => {
    const advice = buildStorageAdvice({
      ...base,
      storageTipTh: 'เก็บไว้ในที่แห้ง',
      storageTipEn: 'Store in a dry place',
    });
    expect(advice.storageTipTh).toBe('เก็บไว้ในที่แห้ง');
    expect(advice.storageTipEn).toBe('Store in a dry place');
  });
});
