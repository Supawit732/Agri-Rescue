import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { CO2E_PER_KG } from '../../src/db/seedData';
import { round2 } from '../../src/delivery/depot';
import { respectsPrecedence, type RoutableStop } from '../../src/domain/routing';
import {
  bearer,
  insertCrop,
  insertLot,
  insertPlot,
  loginStaff,
  registerUser,
  testApp,
} from '../helpers';

interface StopBody {
  id: number;
  seq: number;
  stop_type: 'pickup' | 'drop';
  lot_id: number | null;
  buyer_id: number | null;
  status: string;
  weight_flag: boolean;
  otp_attempts: number;
  locked: boolean;
}

describe('batches and delivery', () => {
  const app = testApp();

  it('rejects an empty round and a driver id that is not a driver', async () => {
    const coordinator = await loginStaff(app, 'coordinator', 'ผู้ประสานว่าง');
    const farmer = await registerUser(app, { role: 'farmer', name: 'ไม่ใช่คนขับ' });
    const missingDriver = await request(app)
      .post('/api/batches')
      .set(bearer(coordinator.token))
      .send({ driver_id: farmer.user.id });
    expect(missingDriver.status).toBe(422);
    expect(missingDriver.body.error.message).toBe('ต้องระบุคนขับที่เป็นผู้ใช้บทบาทคนขับ');

    const driver = await loginStaff(app, 'driver', 'คนขับว่าง');
    const empty = await request(app)
      .post('/api/batches')
      .set(bearer(coordinator.token))
      .send({ driver_id: driver.user.id });
    expect(empty.status).toBe(422);
    expect(empty.body.error.message).toBe('ไม่มีคำสั่งซื้อที่รอจัดรอบ');
  });

  it('lists drivers for a coordinator but not for a driver', async () => {
    const coordinator = await loginStaff(app, 'coordinator', 'ผู้ประสานเลือกคนขับ');
    const driver = await loginStaff(app, 'driver', 'คนขับให้เลือก');
    const listed = await request(app).get('/api/batches/drivers').set(bearer(coordinator.token));
    expect(listed.status).toBe(200);
    const drivers = listed.body.drivers as { id: number; name: string; phone: string }[];
    expect(drivers.some((entry) => entry.id === driver.user.id)).toBe(true);
    expect(drivers.every((entry) => typeof entry.phone === 'string')).toBe(true);

    const forbidden = await request(app).get('/api/batches/drivers').set(bearer(driver.token));
    expect(forbidden.status).toBe(403);
  });

  it('delivers a paid order and a donation after an OTP lock', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'เกษตรกรส่งของ' });
    const cropId = await insertCrop();
    const later = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const paidPlot = await insertPlot(farmer.user.id, 13.7, 100.7, 'แปลงขาย');
    const giftPlot = await insertPlot(farmer.user.id, 13.68, 100.65, 'แปลงบริจาค');
    const paidLot = await insertLot({ plotId: paidPlot, cropId, expiresAt: later, weightKg: 80 });
    const giftLot = await insertLot({
      plotId: giftPlot,
      cropId,
      expiresAt: later,
      weightKg: 40,
      allowDonation: true,
    });
    const shop = await registerUser(app, { role: 'buyer', buyer_type: 'shop', name: 'ร้าน', lat: 13.651, lng: 100.621 });
    const charity = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'charity',
      name: 'สถานสงเคราะห์',
      lat: 13.8,
      lng: 100.8,
    });
    const paidOrder = await request(app)
      .post('/api/orders')
      .set(bearer(shop.token))
      .send({ lot_id: paidLot, donation: false });
    const giftOrder = await request(app)
      .post('/api/orders')
      .set(bearer(charity.token))
      .send({ lot_id: giftLot, donation: true });
    expect(paidOrder.status).toBe(201);
    expect(giftOrder.status).toBe(201);
    expect(giftOrder.body.order.agreed_price_per_kg).toBe(0);

    const coordinator = await loginStaff(app, 'coordinator', 'ผู้ประสานรอบ');
    const driver = await loginStaff(app, 'driver', 'คนขับรอบ');
    const otherDriver = await loginStaff(app, 'driver', 'คนขับคนอื่น');
    const created = await request(app)
      .post('/api/batches')
      .set(bearer(coordinator.token))
      .send({ driver_id: driver.user.id });
    expect(created.status).toBe(201);
    expect(created.body.batch.driver_id).toBe(driver.user.id);
    const batchId = Number(created.body.batch.id);
    const stops = created.body.stops as StopBody[];
    const route: RoutableStop[] = stops.map((stop) => ({
      id: String(stop.id),
      kind: stop.stop_type,
      buyerId: String(stop.buyer_id),
      lat: 0,
      lng: 0,
    }));
    expect(respectsPrecedence(route)).toBe(true);

    const hidden = await request(app).get(`/api/batches/${batchId}`).set(bearer(otherDriver.token));
    expect(hidden.status).toBe(403);
    const visible = await request(app).get(`/api/batches/${batchId}`).set(bearer(driver.token));
    expect(visible.status).toBe(200);

    const paidDrop = stops.find((stop) => stop.stop_type === 'drop' && stop.buyer_id === shop.user.id);
    const giftDrop = stops.find((stop) => stop.stop_type === 'drop' && stop.buyer_id === charity.user.id);
    const paidPickup = stops.find((stop) => stop.lot_id === paidLot);
    const giftPickup = stops.find((stop) => stop.lot_id === giftLot);
    if (paidDrop === undefined || giftDrop === undefined || paidPickup === undefined || giftPickup === undefined) {
      throw new Error('missing stops');
    }

    const earlyDrop = await request(app)
      .post(`/api/stops/${paidDrop.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: '1234' });
    expect(earlyDrop.status).toBe(409);
    expect(earlyDrop.body.error.code).toBe('PICKUP_REQUIRED');

    const weighedPaid = await request(app)
      .post(`/api/stops/${paidPickup.id}/confirm`)
      .set(bearer(driver.token))
      .send({ weight_kg: 80 });
    expect(weighedPaid.status).toBe(200);
    expect(weighedPaid.body.stop.weight_flag).toBe(false);
    expect(weighedPaid.body.lot_status).toBe('picked');
    const repeatPickup = await request(app)
      .post(`/api/stops/${paidPickup.id}/confirm`)
      .set(bearer(driver.token))
      .send({ weight_kg: 80 });
    expect(repeatPickup.status).toBe(409);

    const outsider = await request(app)
      .post(`/api/stops/${giftPickup.id}/confirm`)
      .set(bearer(otherDriver.token))
      .send({ weight_kg: 50 });
    expect(outsider.status).toBe(403);
    const weighedGift = await request(app)
      .post(`/api/stops/${giftPickup.id}/confirm`)
      .set(bearer(driver.token))
      .send({ weight_kg: 50 });
    expect(weighedGift.status).toBe(200);
    expect(weighedGift.body.stop.weight_flag).toBe(true);

    const wrongOtp = paidOrder.body.order.drop_otp === '0000' ? '1111' : '0000';
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const rejected = await request(app)
        .post(`/api/stops/${paidDrop.id}/confirm`)
        .set(bearer(driver.token))
        .send({ otp: wrongOtp });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error.code).toBe('OTP_MISMATCH');
    }
    const locked = await request(app)
      .post(`/api/stops/${paidDrop.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: wrongOtp });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('OTP_LOCKED');
    const [attemptRow] = await pool.query<RowDataPacket[]>('SELECT otp_attempts FROM route_stops WHERE id = ?', [
      paidDrop.id,
    ]);
    expect(Number(attemptRow[0]?.otp_attempts)).toBe(5);
    const stillLocked = await request(app)
      .post(`/api/stops/${paidDrop.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: paidOrder.body.order.drop_otp });
    expect(stillLocked.status).toBe(409);
    expect(stillLocked.body.error.code).toBe('OTP_LOCKED');

    const driverUnlock = await request(app).post(`/api/stops/${paidDrop.id}/unlock`).set(bearer(driver.token));
    expect(driverUnlock.status).toBe(403);
    const unlocked = await request(app).post(`/api/stops/${paidDrop.id}/unlock`).set(bearer(coordinator.token));
    expect(unlocked.status).toBe(200);
    expect(unlocked.body).toEqual({ id: paidDrop.id, otp_attempts: 0, locked: false });

    const deliveredPaid = await request(app)
      .post(`/api/stops/${paidDrop.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: paidOrder.body.order.drop_otp });
    expect(deliveredPaid.status).toBe(200);
    expect(deliveredPaid.body.lot_status).toBe('delivered');
    expect(deliveredPaid.body.batch_status).toBe('in_progress');

    const deliveredGift = await request(app)
      .post(`/api/stops/${giftDrop.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: giftOrder.body.order.drop_otp });
    expect(deliveredGift.status).toBe(200);
    expect(deliveredGift.body.batch_status).toBe('completed');

    const summary = await request(app).get('/api/impact/summary').set(bearer(farmer.token));
    expect(summary.body.summary).toEqual({
      kg_saved: 130,
      co2e_kg: round2(130 * CO2E_PER_KG),
      farmer_income: round2(Number(paidOrder.body.order.agreed_price_per_kg) * 80),
      donated_kg: 50,
      lot_count: 2,
    });
    const [weights] = await pool.query<RowDataPacket[]>(
      'SELECT weight_kg FROM harvest_lots WHERE id IN (?, ?) ORDER BY id',
      [paidLot, giftLot],
    );
    expect(weights.map((row) => Number(row.weight_kg))).toEqual([80, 40]);
  });

  it('does not place one order on two batches created together', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('มะเขือเทศ', 6, 30);
    const later = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const plotA = await insertPlot(farmer.user.id, 13.66, 100.63);
    const plotB = await insertPlot(farmer.user.id, 13.67, 100.64);
    const lotA = await insertLot({ plotId: plotA, cropId, expiresAt: later, weightKg: 10 });
    const lotB = await insertLot({ plotId: plotB, cropId, expiresAt: later, weightKg: 12 });
    const buyerA = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.66, lng: 100.63 });
    const buyerB = await registerUser(app, { role: 'buyer', buyer_type: 'shop', lat: 13.67, lng: 100.64 });
    expect((await request(app).post('/api/orders').set(bearer(buyerA.token)).send({ lot_id: lotA, donation: false })).status).toBe(201);
    expect((await request(app).post('/api/orders').set(bearer(buyerB.token)).send({ lot_id: lotB, donation: false })).status).toBe(201);
    const first = await loginStaff(app, 'coordinator', 'ผู้ประสานหนึ่ง');
    const second = await loginStaff(app, 'coordinator', 'ผู้ประสานสอง');
    const driver = await loginStaff(app, 'driver', 'คนขับพร้อมกัน');
    const [left, right] = await Promise.all([
      request(app).post('/api/batches').set(bearer(first.token)).send({ driver_id: driver.user.id }),
      request(app).post('/api/batches').set(bearer(second.token)).send({ driver_id: driver.user.id }),
    ]);
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([201, 422]);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.batch_id
       FROM orders o
       JOIN harvest_lots h ON h.id = o.lot_id
       WHERE h.id IN (?, ?)`,
      [lotA, lotB],
    );
    const batchIds = rows.map((row) => Number(row.batch_id));
    expect(batchIds).toHaveLength(2);
    expect(new Set(batchIds).size).toBe(1);
    expect(batchIds.every((id) => id > 0)).toBe(true);
  });

  it('merges one buyer\'s orders into a single drop that needs every pickup first', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'เกษตรกรรวมจุดส่ง' });
    const cropId = await insertCrop('มะม่วงรวม', 5, 40);
    const later = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const plotA = await insertPlot(farmer.user.id, 13.7, 100.7, 'แปลงเอ');
    const plotB = await insertPlot(farmer.user.id, 13.69, 100.66, 'แปลงบี');
    const lotA = await insertLot({ plotId: plotA, cropId, expiresAt: later, weightKg: 30 });
    const lotB = await insertLot({ plotId: plotB, cropId, expiresAt: later, weightKg: 20 });
    const shop = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'shop',
      name: 'ร้านรวมส่ง',
      lat: 13.652,
      lng: 100.62,
    });

    const orderA = await request(app)
      .post('/api/orders')
      .set(bearer(shop.token))
      .send({ lot_id: lotA, donation: false });
    const orderB = await request(app)
      .post('/api/orders')
      .set(bearer(shop.token))
      .send({ lot_id: lotB, donation: false });
    expect(orderA.status).toBe(201);
    expect(orderB.status).toBe(201);

    const coordinator = await loginStaff(app, 'coordinator', 'ผู้ประสานรวมส่ง');
    const driver = await loginStaff(app, 'driver', 'คนขับรวมส่ง');
    const created = await request(app)
      .post('/api/batches')
      .set(bearer(coordinator.token))
      .send({ driver_id: driver.user.id });
    expect(created.status).toBe(201);
    const stops = created.body.stops as StopBody[];

    const pickups = stops.filter((stop) => stop.stop_type === 'pickup');
    const drops = stops.filter((stop) => stop.stop_type === 'drop');
    expect(pickups).toHaveLength(2);
    expect(drops).toHaveLength(1);
    const drop = drops[0];
    const pickupA = stops.find((stop) => stop.lot_id === lotA);
    const pickupB = stops.find((stop) => stop.lot_id === lotB);
    if (drop === undefined || pickupA === undefined || pickupB === undefined) {
      throw new Error('missing stops');
    }
    expect(drop.buyer_id).toBe(shop.user.id);

    const beforeAnyPickup = await request(app)
      .post(`/api/stops/${drop.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: orderA.body.order.drop_otp });
    expect(beforeAnyPickup.status).toBe(409);
    expect(beforeAnyPickup.body.error.code).toBe('PICKUP_REQUIRED');

    const firstPickup = await request(app)
      .post(`/api/stops/${pickupA.id}/confirm`)
      .set(bearer(driver.token))
      .send({ weight_kg: 30 });
    expect(firstPickup.status).toBe(200);
    const afterOnePickup = await request(app)
      .post(`/api/stops/${drop.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: orderA.body.order.drop_otp });
    expect(afterOnePickup.status).toBe(409);
    expect(afterOnePickup.body.error.code).toBe('PICKUP_REQUIRED');

    const secondPickup = await request(app)
      .post(`/api/stops/${pickupB.id}/confirm`)
      .set(bearer(driver.token))
      .send({ weight_kg: 20 });
    expect(secondPickup.status).toBe(200);

    const otpA = orderA.body.order.drop_otp as string;
    const otpB = orderB.body.order.drop_otp as string;
    const firstDrop = await request(app)
      .post(`/api/stops/${drop.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: otpA });
    expect(firstDrop.status).toBe(200);
    expect(firstDrop.body.lot_status).toBe('delivered');
    if (otpB === otpA) {
      expect(firstDrop.body.batch_status).toBe('completed');
    } else {
      expect(firstDrop.body.batch_status).toBe('in_progress');
      const secondDrop = await request(app)
        .post(`/api/stops/${drop.id}/confirm`)
        .set(bearer(driver.token))
        .send({ otp: otpB });
      expect(secondDrop.status).toBe(200);
      expect(secondDrop.body.batch_status).toBe('completed');
    }

    const [lotRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, status FROM harvest_lots WHERE id IN (?, ?) ORDER BY id',
      [lotA, lotB],
    );
    expect(lotRows.map((row) => String(row.status))).toEqual(['delivered', 'delivered']);
  });
});
