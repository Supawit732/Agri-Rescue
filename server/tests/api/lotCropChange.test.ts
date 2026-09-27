import request from 'supertest';
import {
  bearer,
  insertCrop,
  insertLot,
  insertPlot,
  registerUser,
  testApp,
  pickAvailablePickupSlot,
} from '../helpers';

describe('lot edit — crop change', () => {
  const app = testApp();

  it('recomputes shelf life, reference price, and suggested prices when the crop changes', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const oldCropId = await insertCrop('พืชเดิม-cropchange', 5, 40);
    const newCropId = await insertCrop('พืชใหม่-cropchange', 8, 80);
    const plotId = await insertPlot(farmer.user.id, 13.68, 100.68);
    const lotId = await insertLot({
      plotId,
      cropId: oldCropId,
      weightKg: 10,
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const before = await request(app)
      .get('/api/lots/mine')
      .set(bearer(farmer.token));
    const beforeLot = before.body.lots.find((l: { id: number }) => l.id === lotId);
    expect(beforeLot.crop_id).toBe(oldCropId);

    const res = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(farmer.token))
      .send({ crop_id: newCropId });
    expect(res.status).toBe(200);
    expect(res.body.lot.crop_id).toBe(newCropId);
    // New crop's market price (80) is now the reference — suggested prices follow it, not the old 40.
    expect(res.body.lot.start_price_per_kg).toBe(80);
    expect(res.body.lot.floor_price_per_kg).toBe(24);
    expect(res.body.lot.price_per_kg).toBeGreaterThan(0);
  });

  it('lets the seller set explicit prices in the same request that changes the crop', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const oldCropId = await insertCrop('พืชเดิม-cropchange2', 5, 40);
    const newCropId = await insertCrop('พืชใหม่-cropchange2', 5, 80);
    const plotId = await insertPlot(farmer.user.id, 13.68, 100.68);
    const lotId = await insertLot({
      plotId,
      cropId: oldCropId,
      weightKg: 10,
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(farmer.token))
      .send({ crop_id: newCropId, start_price_per_kg: 70, floor_price_per_kg: 20 });
    expect(res.status).toBe(200);
    expect(res.body.lot.crop_id).toBe(newCropId);
    expect(res.body.lot.start_price_per_kg).toBe(70);
    expect(res.body.lot.floor_price_per_kg).toBe(20);
  });

  it('rejects a crop change once the lot has a non-cancelled order (409 + crop_id field error)', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const oldCropId = await insertCrop('พืชเดิม-cropchange3', 5, 40);
    const newCropId = await insertCrop('พืชใหม่-cropchange3', 5, 80);
    const plotId = await insertPlot(farmer.user.id, 13.68, 100.68);
    const lotId = await insertLot({
      plotId,
      cropId: oldCropId,
      weightKg: 10,
      splitAllowed: true,
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const booked = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: lotId, donation: false, quantity_kg: 2, ...pickAvailablePickupSlot() });
    expect(booked.status).toBe(201);

    const res = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(farmer.token))
      .send({ crop_id: newCropId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CROP_LOCKED');
    expect(res.body.error.fields?.crop_id).toBeDefined();

    // The crop itself must be unchanged.
    const after = await request(app)
      .get('/api/lots/mine')
      .set(bearer(farmer.token));
    const afterLot = after.body.lots.find((l: { id: number }) => l.id === lotId);
    expect(afterLot.crop_id).toBe(oldCropId);
  });

  it('recomputes shelf life alongside a simultaneous ripeness change, without double-applying it', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const oldCropId = await insertCrop('พืชเดิม-cropchange4', 5, 40);
    const newCropId = await insertCrop('พืชใหม่-cropchange4', 3, 40);
    const plotId = await insertPlot(farmer.user.id, 13.68, 100.68);
    const lotId = await insertLot({
      plotId,
      cropId: oldCropId,
      weightKg: 10,
      grade: 'normal',
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(farmer.token))
      .send({ crop_id: newCropId, ripeness: 3, ai_ripeness: 3, confirm_ripeness_photo: true });
    expect(res.status).toBe(200);
    expect(res.body.lot.crop_id).toBe(newCropId);
    expect(res.body.lot.ripeness).toBe(3);
    // expires_at must reflect the NEW crop's (shorter) shelf life, not be left untouched.
    const hoursLeft = (new Date(res.body.lot.expires_at).getTime() - Date.now()) / (60 * 60 * 1000);
    expect(hoursLeft).toBeLessThan(3 * 24);
  });
});
