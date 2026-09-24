import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { bearer, insertCrop, insertLot, insertPlot, loginStaff, registerUser, testApp } from '../helpers';

describe('orders', () => {
  const app = testApp();

  async function openLot(allowDonation: boolean): Promise<{ lotId: number; farmerId: number }> {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61);
    const lotId = await insertLot({
      plotId,
      cropId,
      allowDonation,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    return { lotId, farmerId: farmer.user.id };
  }

  it('lets only one of two concurrent bookings succeed', async () => {
    const { lotId } = await openLot(true);
    const first = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const second = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    const [left, right] = await Promise.all([
      request(app)
        .post('/api/orders')
        .set(bearer(first.token))
        .send({ lot_id: lotId, donation: false, quantity_kg: 10 }),
      request(app)
        .post('/api/orders')
        .set(bearer(second.token))
        .send({ lot_id: lotId, donation: false, quantity_kg: 10 }),
    ]);
    const statuses = [left.status, right.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    const winner = left.status === 201 ? left : right;
    const loser = left.status === 409 ? left : right;
    expect(loser.body.error.code).toBe('LOT_NOT_OPEN');
    expect(winner.body.order.drop_otp).toMatch(/^\d{4}$/);
    expect(JSON.stringify(loser.body)).not.toContain('drop_otp');

    const winnerToken = left.status === 201 ? first.token : second.token;
    const listed = await request(app).get('/api/orders/mine').set(bearer(winnerToken));
    expect(listed.status).toBe(200);
    expect(listed.body.orders[0].drop_otp).toBe(winner.body.order.drop_otp);
    expect(listed.body.orders[0].crop_name_th).toBe('มะม่วง');

    const cancelled = await request(app).delete(`/api/orders/${winner.body.order.id}`).set(bearer(winnerToken));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toEqual({ status: 'cancelled', lot_status: 'open' });
    const [rows] = await pool.query<RowDataPacket[]>('SELECT status FROM harvest_lots WHERE id = ?', [lotId]);
    expect(rows[0]?.status).toBe('open');
  });

  it('lets buyer and lot owner fetch enriched order detail with plot coords', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'shop',
      lat: 13.67,
      lng: 100.62,
    });
    const stranger = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    const cropId = await insertCrop('ทุเรียน', 5, 40);
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61, 'แปลงทุเรียน');
    const lotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const booked = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: lotId, donation: false, quantity_kg: 4 });
    expect(booked.status).toBe(201);
    const orderId = booked.body.order.id as number;

    const asBuyer = await request(app).get(`/api/orders/${orderId}`).set(bearer(buyer.token));
    expect(asBuyer.status).toBe(200);
    expect(asBuyer.body.order).toMatchObject({
      id: orderId,
      lot_id: lotId,
      crop_name_th: 'ทุเรียน',
      quantity_kg: 4,
      is_donation: false,
      status: 'reserved',
      plot_name: 'แปลงทุเรียน',
      drop_otp: booked.body.order.drop_otp,
    });
    expect(asBuyer.body.order.total).toBe(
      Math.round(4 * Number(asBuyer.body.order.agreed_price_per_kg) * 100) / 100,
    );
    expect(asBuyer.body.order.lat).toBeCloseTo(13.66, 5);
    expect(asBuyer.body.order.lng).toBeCloseTo(100.61, 5);
    expect(asBuyer.body.order.distance_km).toBeGreaterThan(0);
    expect(asBuyer.body.order.expires_at).toBeTruthy();
    expect(asBuyer.body.order.sale_mode).toBeUndefined();

    const asSeller = await request(app).get(`/api/orders/${orderId}`).set(bearer(farmer.token));
    expect(asSeller.status).toBe(200);
    expect(asSeller.body.order.drop_otp).toBe(booked.body.order.drop_otp);
    expect(asSeller.body.order.lat).toBeCloseTo(13.66, 5);

    const denied = await request(app).get(`/api/orders/${orderId}`).set(bearer(stranger.token));
    expect(denied.status).toBe(403);
  });

  it('rejects donation from a non-charity buyer and from a closed lot', async () => {
    const vendorLot = await openLot(true);
    const vendor = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    const denied = await request(app)
      .post('/api/orders')
      .set(bearer(vendor.token))
      .send({
        lot_id: vendorLot.lotId,
        donation: true,
        quantity_kg: 10,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    const closed = await openLot(false);
    const charity = await registerUser(app, { role: 'buyer', buyer_type: 'charity' });
    const pending = await request(app)
      .post('/api/orders')
      .set(bearer(charity.token))
      .send({
        lot_id: vendorLot.lotId,
        donation: true,
        quantity_kg: 10,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(pending.status).toBe(403);

    const admin = await loginStaff(app, 'coordinator', 'อนุมัติสงเคราะห์');
    await request(app)
      .post(`/api/auth/admin/approve-charity/${charity.user.id}`)
      .set(bearer(admin.token));

    const blocked = await request(app)
      .post('/api/orders')
      .set(bearer(charity.token))
      .send({
        lot_id: closed.lotId,
        donation: true,
        quantity_kg: 10,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toBe('ล็อตนี้ไม่เปิดรับบริจาค');

    const [rows] = await pool.query<RowDataPacket[]>('SELECT status FROM harvest_lots WHERE id IN (?, ?)', [
      vendorLot.lotId,
      closed.lotId,
    ]);
    expect(rows.map((row) => row.status)).toEqual(['open', 'open']);
  });

  it('lets the seller confirm delivery with OTP and creates impact', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const cropId = await insertCrop('มะเขือเทศ', 6, 30);
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61);
    const lotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      weightKg: 10,
    });
    const booked = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: lotId, donation: false, quantity_kg: 10 });
    expect(booked.status).toBe(201);
    const orderId = booked.body.order.id as number;
    const otp = booked.body.order.drop_otp as string;

    const wrong = await request(app)
      .post(`/api/orders/${orderId}/seller-confirm`)
      .set(bearer(farmer.token))
      .send({ otp: '0000', weight_kg: 10 });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('OTP_MISMATCH');

    const ok = await request(app)
      .post(`/api/orders/${orderId}/seller-confirm`)
      .set(bearer(farmer.token))
      .send({ otp, weight_kg: 9.5 });
    expect(ok.status).toBe(200);
    expect(ok.body.order.status).toBe('delivered');
    expect(ok.body.order.weight_kg).toBe(9.5);
    expect(ok.body.lot_status).toBe('delivered');

    const [impact] = await pool.query<RowDataPacket[]>(
      'SELECT kg_saved, co2e_kg FROM impact_logs WHERE order_id = ?',
      [orderId],
    );
    expect(Number(impact[0]?.kg_saved)).toBe(9.5);
    expect(Number(impact[0]?.co2e_kg)).toBeCloseTo(9.5 * 2.5, 5);
  });
});
