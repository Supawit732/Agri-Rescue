import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { bearer, insertCrop, insertLot, insertPlot, loginStaff, registerUser, testApp, pickAvailablePickupSlot } from '../helpers';

describe('lot split 6.1e', () => {
  const app = testApp();

  async function setupLot(opts: {
    weightKg?: number;
    splitAllowed?: boolean;
    minOrderKg?: number;
    orderStepKg?: number;
    saleMode?: 'sell' | 'donate' | 'sell_then_donate';
    allowDonation?: boolean;
  } = {}): Promise<{ lotId: number; farmerToken: string; farmerId: number; weightKg: number }> {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61);
    const weightKg = opts.weightKg ?? 10;
    const lotId = await insertLot({
      plotId,
      cropId,
      weightKg,
      splitAllowed: opts.splitAllowed,
      minOrderKg: opts.minOrderKg,
      orderStepKg: opts.orderStepKg,
      saleMode: opts.saleMode,
      allowDonation: opts.allowDonation,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    return { lotId, farmerToken: farmer.token, farmerId: farmer.user.id, weightKg };
  }

  it('lets only one of two concurrent full bookings succeed with 409', async () => {
    const { lotId, weightKg } = await setupLot({ weightKg: 10, splitAllowed: true });
    const first = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const second = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    const [left, right] = await Promise.all([
      request(app)
        .post('/api/orders')
        .set(bearer(first.token))
        .send({ lot_id: lotId, donation: false, quantity_kg: weightKg, ...pickAvailablePickupSlot() }),
      request(app)
        .post('/api/orders')
        .set(bearer(second.token))
        .send({ lot_id: lotId, donation: false, quantity_kg: weightKg, ...pickAvailablePickupSlot() }),
    ]);
    const statuses = [left.status, right.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    const loser = left.status === 409 ? left : right;
    expect(loser.body.error.code).toBe('LOT_NOT_OPEN');
    const [rows] = await pool.query<RowDataPacket[]>('SELECT status FROM harvest_lots WHERE id = ?', [lotId]);
    expect(rows[0]?.status).toBe('fully_reserved');
  });

  it('enforces min, step, whole-lot, and remainder-tail rules', async () => {
    const minLot = await setupLot({ weightKg: 10, minOrderKg: 3, orderStepKg: 1 });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const belowMin = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: minLot.lotId, donation: false, quantity_kg: 2, ...pickAvailablePickupSlot() });
    expect(belowMin.status).toBe(400);
    expect(belowMin.body.error.fields?.quantity_kg ?? belowMin.body.error.message).toBeTruthy();

    const stepLot = await setupLot({ weightKg: 10, minOrderKg: 2, orderStepKg: 2 });
    const badStep = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: stepLot.lotId, donation: false, quantity_kg: 3, ...pickAvailablePickupSlot() });
    expect(badStep.status).toBe(400);
    expect(String(badStep.body.error.message)).toContain('พหุคูณ');

    const whole = await setupLot({ weightKg: 8, splitAllowed: false });
    const partial = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: whole.lotId, donation: false, quantity_kg: 4, ...pickAvailablePickupSlot() });
    expect(partial.status).toBe(400);
    expect(String(partial.body.error.message)).toContain('ยกล็อต');

    const okWhole = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: whole.lotId, donation: false, quantity_kg: 8, ...pickAvailablePickupSlot() });
    expect(okWhole.status).toBe(201);

    const rem = await setupLot({ weightKg: 5, minOrderKg: 2, orderStepKg: 1 });
    const firstPart = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: rem.lotId, donation: false, quantity_kg: 4, ...pickAvailablePickupSlot() });
    expect(firstPart.status).toBe(201);
    expect(firstPart.body.lot_status).toBe('partially_reserved');
    expect(firstPart.body.remaining_kg).toBe(1);

    const badTail = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: rem.lotId, donation: false, quantity_kg: 0.5, ...pickAvailablePickupSlot() });
    expect(badTail.status).toBe(400);

    const other = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', name: 'เศษท้าย' });
    const takeTail = await request(app)
      .post('/api/orders')
      .set(bearer(other.token))
      .send({ lot_id: rem.lotId, donation: false, quantity_kg: 1, ...pickAvailablePickupSlot() });
    expect(takeTail.status).toBe(201);
    expect(takeTail.body.lot_status).toBe('fully_reserved');
    expect(takeTail.body.remaining_kg).toBe(0);
  });

  it('restores remaining when a partial booking is cancelled', async () => {
    const { lotId } = await setupLot({ weightKg: 10 });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const booked = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: lotId, donation: false, quantity_kg: 4, ...pickAvailablePickupSlot() });
    expect(booked.status).toBe(201);
    expect(booked.body.lot_status).toBe('partially_reserved');
    expect(booked.body.remaining_kg).toBe(6);

    const cancelled = await request(app)
      .delete(`/api/orders/${booked.body.order.id}`)
      .set(bearer(buyer.token));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.lot_status).toBe('open');

    const [rows] = await pool.query<RowDataPacket[]>('SELECT status FROM harvest_lots WHERE id = ?', [lotId]);
    expect(rows[0]?.status).toBe('open');
  });

  it('rejects patching weight below already-reserved quantity with 400', async () => {
    const { lotId, farmerToken } = await setupLot({ weightKg: 20 });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const booked = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: lotId, donation: false, quantity_kg: 8, ...pickAvailablePickupSlot() });
    expect(booked.status).toBe(201);

    const tooLow = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(farmerToken))
      .send({ weight_kg: 5 });
    expect(tooLow.status).toBe(400);
    expect(String(tooLow.body.error.message)).toContain('จอง');
  });

  it('sell_then_donate books only remaining weight for donation quantity', async () => {
    const { lotId } = await setupLot({
      weightKg: 10,
      saleMode: 'sell_then_donate',
    });
    const shop = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const paid = await request(app)
      .post('/api/orders')
      .set(bearer(shop.token))
      .send({ lot_id: lotId, donation: false, quantity_kg: 6, ...pickAvailablePickupSlot() });
    expect(paid.status).toBe(201);
    expect(paid.body.remaining_kg).toBe(4);

    await pool.query(
      `UPDATE harvest_lots SET donation_opened = 1, allow_donation = 1 WHERE id = ?`,
      [lotId],
    );

    const charity = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'charity',
      name: 'องค์กรรับเศษ',
    });
    const admin = await loginStaff(app, 'coordinator', 'อนุมัติเศษ');
    await request(app)
      .post(`/api/auth/admin/approve-charity/${charity.user.id}`)
      .set(bearer(admin.token));

    const overDonate = await request(app)
      .post('/api/orders')
      .set(bearer(charity.token))
      .send({
        lot_id: lotId,
        donation: true,
        quantity_kg: 5,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(overDonate.status).toBe(400);

    const donate = await request(app)
      .post('/api/orders')
      .set(bearer(charity.token))
      .send({
        lot_id: lotId,
        donation: true,
        quantity_kg: 4,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(donate.status).toBe(201);
    expect(donate.body.order.quantity_kg).toBe(4);
    expect(donate.body.order.is_donation).toBe(true);
    expect(donate.body.remaining_kg).toBe(0);
    expect(donate.body.lot_status).toBe('fully_reserved');
  });
});
