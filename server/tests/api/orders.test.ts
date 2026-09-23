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
      request(app).post('/api/orders').set(bearer(first.token)).send({ lot_id: lotId, donation: false }),
      request(app).post('/api/orders').set(bearer(second.token)).send({ lot_id: lotId, donation: false }),
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

    const cancelled = await request(app).delete(`/api/orders/${winner.body.order.id}`).set(bearer(winnerToken));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toEqual({ status: 'cancelled', lot_status: 'open' });
    const [rows] = await pool.query<RowDataPacket[]>('SELECT status FROM harvest_lots WHERE id = ?', [lotId]);
    expect(rows[0]?.status).toBe('open');
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
});
