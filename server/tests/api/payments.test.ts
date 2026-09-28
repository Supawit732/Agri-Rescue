import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { createBatch } from '../../src/delivery/createBatch';
import { expireDuePayments } from '../../src/payments/paymentService';
import {
  bearer,
  insertCrop,
  insertLot,
  insertPlot,
  loginStaff,
  pickAvailablePickupSlot,
  registerUser,
  testApp,
} from '../helpers';

describe('mock payment (6.5, simplified)', () => {
  const app = testApp();

  async function bookNonDonationOrder(): Promise<{
    orderId: number;
    lotId: number;
    buyerToken: string;
    sellerToken: string;
  }> {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const cropId = await insertCrop();
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
      .send({ lot_id: lotId, donation: false, quantity_kg: 4, ...pickAvailablePickupSlot() });
    expect(booked.status).toBe(201);
    return {
      orderId: booked.body.order.id as number,
      lotId,
      buyerToken: buyer.token,
      sellerToken: farmer.token,
    };
  }

  it('creates a pending payment on a non-donation order and exposes it via GET', async () => {
    const { orderId, buyerToken, sellerToken } = await bookNonDonationOrder();

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT status, amount, deadline_at FROM payments WHERE order_id = ?',
      [orderId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('pending');
    expect(Number(rows[0]?.amount)).toBeGreaterThan(0);

    const asBuyer = await request(app).get(`/api/orders/${orderId}/payment`).set(bearer(buyerToken));
    expect(asBuyer.status).toBe(200);
    expect(asBuyer.body.payment).toMatchObject({ status: 'pending', provider: 'mock' });
    expect(asBuyer.body.payment.deadline_at).toBeTruthy();

    const asSeller = await request(app).get(`/api/orders/${orderId}/payment`).set(bearer(sellerToken));
    expect(asSeller.status).toBe(200);
    expect(asSeller.body.payment.status).toBe('pending');

    const stranger = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    const denied = await request(app)
      .get(`/api/orders/${orderId}/payment`)
      .set(bearer(stranger.token));
    expect(denied.status).toBe(403);
  });

  it('does not create a payment row for a donation order', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61);
    const lotId = await insertLot({
      plotId,
      cropId,
      allowDonation: true,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const charity = await registerUser(app, { role: 'buyer', buyer_type: 'charity' });
    const admin = await loginStaff(app, 'coordinator', 'อนุมัติสงเคราะห์');
    await request(app)
      .post(`/api/auth/admin/approve-charity/${charity.user.id}`)
      .set(bearer(admin.token));

    const booked = await request(app)
      .post('/api/orders')
      .set(bearer(charity.token))
      .send({
        lot_id: lotId,
        donation: true,
        quantity_kg: 10,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(booked.status).toBe(201);
    expect(booked.body.payment_deadline_at).toBeNull();
    const orderId = booked.body.order.id as number;

    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM payments WHERE order_id = ?', [
      orderId,
    ]);
    expect(rows).toHaveLength(0);

    const paymentRes = await request(app)
      .get(`/api/orders/${orderId}/payment`)
      .set(bearer(charity.token));
    expect(paymentRes.status).toBe(200);
    expect(paymentRes.body.payment).toBeNull();
  });

  it('lets the buyer simulate payment, and only once', async () => {
    const { orderId, buyerToken, sellerToken } = await bookNonDonationOrder();

    const deniedForSeller = await request(app)
      .post(`/api/orders/${orderId}/payment/simulate`)
      .set(bearer(sellerToken));
    expect(deniedForSeller.status).toBe(403);

    const ok = await request(app)
      .post(`/api/orders/${orderId}/payment/simulate`)
      .set(bearer(buyerToken));
    expect(ok.status).toBe(200);
    expect(ok.body.payment.status).toBe('paid');
    expect(ok.body.payment.paid_at).toBeTruthy();

    const again = await request(app)
      .post(`/api/orders/${orderId}/payment/simulate`)
      .set(bearer(buyerToken));
    expect(again.status).toBe(409);
  });

  describe('ALLOW_MOCK_PAYMENT gate', () => {
    const original = process.env.ALLOW_MOCK_PAYMENT;

    afterEach(() => {
      if (original === undefined) {
        delete process.env.ALLOW_MOCK_PAYMENT;
      } else {
        process.env.ALLOW_MOCK_PAYMENT = original;
      }
    });

    it('blocks simulate when unset or not the literal string "true"', async () => {
      delete process.env.ALLOW_MOCK_PAYMENT;
      const { orderId, buyerToken } = await bookNonDonationOrder();
      const blocked = await request(app)
        .post(`/api/orders/${orderId}/payment/simulate`)
        .set(bearer(buyerToken));
      expect(blocked.status).toBe(403);

      process.env.ALLOW_MOCK_PAYMENT = 'false';
      const stillBlocked = await request(app)
        .post(`/api/orders/${orderId}/payment/simulate`)
        .set(bearer(buyerToken));
      expect(stillBlocked.status).toBe(403);
    });

    it('allows simulate when set to "true"', async () => {
      process.env.ALLOW_MOCK_PAYMENT = 'true';
      const { orderId, buyerToken } = await bookNonDonationOrder();
      const ok = await request(app)
        .post(`/api/orders/${orderId}/payment/simulate`)
        .set(bearer(buyerToken));
      expect(ok.status).toBe(200);
      expect(ok.body.payment.status).toBe('paid');
    });
  });

  it('expires unpaid payments past the deadline, cancels the order, and restores lot stock', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const cropId = await insertCrop();
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
      .send({ lot_id: lotId, donation: false, quantity_kg: 4, ...pickAvailablePickupSlot() });
    expect(booked.status).toBe(201);
    const orderId = booked.body.order.id as number;

    // Force the deadline into the past instead of waiting on the real clamp window.
    await pool.query('UPDATE payments SET deadline_at = ? WHERE order_id = ?', [
      new Date(Date.now() - 1000),
      orderId,
    ]);

    const expiredCount = await expireDuePayments(new Date());
    expect(expiredCount).toBe(1);

    const [paymentRows] = await pool.query<RowDataPacket[]>(
      'SELECT status FROM payments WHERE order_id = ?',
      [orderId],
    );
    expect(paymentRows[0]?.status).toBe('expired');

    const [orderRows] = await pool.query<RowDataPacket[]>('SELECT status FROM orders WHERE id = ?', [
      orderId,
    ]);
    expect(orderRows[0]?.status).toBe('cancelled');

    const [lotRows] = await pool.query<RowDataPacket[]>(
      'SELECT status FROM harvest_lots WHERE id = ?',
      [lotId],
    );
    expect(lotRows[0]?.status).toBe('open');
  });

  it('excludes unpaid orders from batch creation but includes paid and donation orders', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyerPaid = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'shop',
      lat: 13.6,
      lng: 100.6,
    });
    const buyerUnpaid = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'shop',
      lat: 13.61,
      lng: 100.61,
    });
    const charity = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'charity',
      lat: 13.62,
      lng: 100.62,
    });
    const admin = await loginStaff(app, 'coordinator', 'อนุมัติสงเคราะห์');
    await request(app)
      .post(`/api/auth/admin/approve-charity/${charity.user.id}`)
      .set(bearer(admin.token));

    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61);
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const lotPaid = await insertLot({ plotId, cropId, expiresAt, weightKg: 10 });
    const paidBooking = await request(app)
      .post('/api/orders')
      .set(bearer(buyerPaid.token))
      .send({ lot_id: lotPaid, donation: false, quantity_kg: 4, ...pickAvailablePickupSlot(expiresAt) });
    expect(paidBooking.status).toBe(201);
    const paidOrderId = paidBooking.body.order.id as number;
    const simulate = await request(app)
      .post(`/api/orders/${paidOrderId}/payment/simulate`)
      .set(bearer(buyerPaid.token));
    expect(simulate.status).toBe(200);

    const lotUnpaid = await insertLot({ plotId, cropId, expiresAt, weightKg: 10 });
    const unpaidBooking = await request(app)
      .post('/api/orders')
      .set(bearer(buyerUnpaid.token))
      .send({
        lot_id: lotUnpaid,
        donation: false,
        quantity_kg: 4,
        ...pickAvailablePickupSlot(expiresAt),
      });
    expect(unpaidBooking.status).toBe(201);
    const unpaidOrderId = unpaidBooking.body.order.id as number;

    const lotDonation = await insertLot({ plotId, cropId, allowDonation: true, expiresAt });
    const donationBooking = await request(app)
      .post('/api/orders')
      .set(bearer(charity.token))
      .send({
        lot_id: lotDonation,
        donation: true,
        quantity_kg: 10,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(donationBooking.status).toBe(201);
    const donationOrderId = donationBooking.body.order.id as number;

    const driver = await loginStaff(app, 'driver', 'คนขับทดสอบ');
    const result = await createBatch(driver.user.id);

    const [orderRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, batch_id FROM orders WHERE id IN (?, ?, ?) ORDER BY id',
      [paidOrderId, unpaidOrderId, donationOrderId],
    );
    const byId = new Map(orderRows.map((row) => [Number(row.id), row.batch_id]));
    expect(byId.get(paidOrderId)).toBe(result.batch.id);
    expect(byId.get(donationOrderId)).toBe(result.batch.id);
    expect(byId.get(unpaidOrderId)).toBeNull();
  });
});
