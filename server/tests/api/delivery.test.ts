import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { CO2E_PER_KG } from '../../src/db/seedData';
import { depotPoint, round2 } from '../../src/delivery/depot';
import { defaultRouteSolver, respectsPrecedence, type RoutableStop } from '../../src/domain/routing';
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
  lat: number;
  lng: number;
  leg_km: number;
  status: string;
  weight_flag: boolean;
}

function stopKey(stop: StopBody): string {
  if (stop.stop_type === 'pickup') {
    return `pickup:${stop.lot_id}`;
  }
  return `drop:${stop.buyer_id}`;
}

describe('delivery flow', () => {
  const app = testApp();

  it('batches two buyers, flags overweight pickups, and records impact after the right OTP', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'เกษตรกรรอบวิ่ง' });
    const cropId = await insertCrop();
    const plotA = await insertPlot(farmer.user.id, 13.7, 100.7, 'แปลงไกล');
    const plotB = await insertPlot(farmer.user.id, 13.68, 100.65, 'แปลงกลาง');
    const later = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const lotA = await insertLot({ plotId: plotA, cropId, expiresAt: later, weightKg: 80 });
    const lotB = await insertLot({ plotId: plotB, cropId, expiresAt: later, weightKg: 40 });
    const buyerA = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'shop',
      name: 'ร้านใกล้',
      lat: 13.651,
      lng: 100.621,
    });
    const buyerB = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'vendor',
      name: 'รถเร่ไกล',
      lat: 13.8,
      lng: 100.8,
    });
    const orderA = await request(app)
      .post('/api/orders')
      .set(bearer(buyerA.token))
      .send({ lot_id: lotA, donation: false });
    const orderB = await request(app)
      .post('/api/orders')
      .set(bearer(buyerB.token))
      .send({ lot_id: lotB, donation: false });
    expect(orderA.status).toBe(201);
    expect(orderB.status).toBe(201);

    const coordinator = await loginStaff(app, 'coordinator', 'ผู้ประสานรอบวิ่ง');
    const driver = await loginStaff(app, 'driver', 'คนขับรอบวิ่ง');
    const created = await request(app).post('/api/batches').set(bearer(coordinator.token));
    expect(created.status).toBe(201);
    const batchId = Number(created.body.batch.id);
    const stops = created.body.stops as StopBody[];
    expect(stops.map((stop) => stop.seq)).toEqual(stops.map((_stop, index) => index + 1));
    const route: RoutableStop[] = stops.map((stop) => ({
      id: stopKey(stop),
      kind: stop.stop_type,
      buyerId: String(stop.buyer_id),
      lat: stop.lat,
      lng: stop.lng,
    }));
    expect(respectsPrecedence(route)).toBe(true);
    for (const buyerId of [buyerA.user.id, buyerB.user.id]) {
      const pickupSeq = stops
        .filter((stop) => stop.stop_type === 'pickup' && stop.buyer_id === buyerId)
        .map((stop) => stop.seq);
      const dropSeq = stops.find((stop) => stop.stop_type === 'drop' && stop.buyer_id === buyerId)?.seq;
      expect(dropSeq).toBeDefined();
      expect(Math.max(...pickupSeq)).toBeLessThan(dropSeq ?? 0);
    }
    const input: RoutableStop[] = [
      { id: `pickup:${lotA}`, kind: 'pickup', buyerId: String(buyerA.user.id), lat: 13.7, lng: 100.7 },
      { id: `pickup:${lotB}`, kind: 'pickup', buyerId: String(buyerB.user.id), lat: 13.68, lng: 100.65 },
      { id: `drop:${buyerA.user.id}`, kind: 'drop', buyerId: String(buyerA.user.id), lat: 13.651, lng: 100.621 },
      { id: `drop:${buyerB.user.id}`, kind: 'drop', buyerId: String(buyerB.user.id), lat: 13.8, lng: 100.8 },
    ];
    input.sort((left, right) => stopSort(left) - stopSort(right) || left.id.localeCompare(right.id));
    const expected = defaultRouteSolver.solve(depotPoint(), input);
    expect(stops.map((stop) => stopKey(stop))).toEqual(expected.map((stop) => stop.id));
    expect(created.body.batch.planned_km).toBe(round2(stops.reduce((sum, stop) => sum + stop.leg_km, 0)));

    const viewed = await request(app).get(`/api/batches/${batchId}`).set(bearer(driver.token));
    expect(viewed.status).toBe(200);
    expect(viewed.body.stops.map((stop: StopBody) => stop.seq)).toEqual(stops.map((stop) => stop.seq));
    const buyerView = await request(app).get(`/api/batches/${batchId}`).set(bearer(buyerA.token));
    expect(buyerView.status).toBe(403);

    const empty = await request(app).post('/api/batches').set(bearer(coordinator.token));
    expect(empty.status).toBe(409);

    const pickupA = stops.find((stop) => stop.lot_id === lotA);
    const pickupB = stops.find((stop) => stop.lot_id === lotB);
    const dropA = stops.find((stop) => stop.stop_type === 'drop' && stop.buyer_id === buyerA.user.id);
    const dropB = stops.find((stop) => stop.stop_type === 'drop' && stop.buyer_id === buyerB.user.id);
    if (pickupA === undefined || pickupB === undefined || dropA === undefined || dropB === undefined) {
      throw new Error('missing stops');
    }

    const weighedA = await request(app)
      .post(`/api/stops/${pickupA.id}/confirm`)
      .set(bearer(driver.token))
      .send({ weight_kg: 80 });
    expect(weighedA.status).toBe(200);
    expect(weighedA.body.stop.weight_flag).toBe(false);
    expect(weighedA.body.lot_status).toBe('picked');

    const weighedB = await request(app)
      .post(`/api/stops/${pickupB.id}/confirm`)
      .set(bearer(driver.token))
      .send({ weight_kg: 50 });
    expect(weighedB.status).toBe(200);
    expect(weighedB.body.stop.weight_flag).toBe(true);
    expect(weighedB.body.batch_status).toBe('in_progress');

    const wrongOtp = orderA.body.order.drop_otp === '0000' ? '1111' : '0000';
    const rejected = await request(app)
      .post(`/api/stops/${dropA.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: wrongOtp });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('OTP_MISMATCH');
    const [afterWrong] = await pool.query<RowDataPacket[]>('SELECT status FROM orders WHERE id = ?', [
      orderA.body.order.id,
    ]);
    expect(afterWrong[0]?.status).toBe('picked');

    const deliveredA = await request(app)
      .post(`/api/stops/${dropA.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: orderA.body.order.drop_otp });
    expect(deliveredA.status).toBe(200);
    expect(deliveredA.body.lot_status).toBe('delivered');
    expect(deliveredA.body.batch_status).toBe('in_progress');

    const deliveredB = await request(app)
      .post(`/api/stops/${dropB.id}/confirm`)
      .set(bearer(driver.token))
      .send({ otp: orderB.body.order.drop_otp });
    expect(deliveredB.status).toBe(200);
    expect(deliveredB.body.batch_status).toBe('completed');

    const summary = await request(app).get('/api/impact/summary').set(bearer(farmer.token));
    expect(summary.status).toBe(200);
    const kgSaved = 80 + 50;
    expect(summary.body.summary).toEqual({
      kg_saved: kgSaved,
      co2e_kg: round2(kgSaved * CO2E_PER_KG),
      farmer_income: round2(Number(orderA.body.order.agreed_price_per_kg) * 80 + Number(orderB.body.order.agreed_price_per_kg) * 50),
      donated_kg: 0,
      lot_count: 2,
    });
  });

  it('keeps one drop per buyer and does not flag a 10% weight difference', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('กล้วยน้ำว้า', 4, 25);
    const plotA = await insertPlot(farmer.user.id, 13.66, 100.63, 'แปลงหนึ่ง');
    const plotB = await insertPlot(farmer.user.id, 13.67, 100.64, 'แปลงสอง');
    const later = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    const lotA = await insertLot({ plotId: plotA, cropId, expiresAt: later, weightKg: 100 });
    const lotB = await insertLot({ plotId: plotB, cropId, expiresAt: later, weightKg: 100 });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop', lat: 13.655, lng: 100.625 });
    expect((await request(app).post('/api/orders').set(bearer(buyer.token)).send({ lot_id: lotA, donation: false })).status).toBe(201);
    expect((await request(app).post('/api/orders').set(bearer(buyer.token)).send({ lot_id: lotB, donation: false })).status).toBe(201);
    const coordinator = await loginStaff(app, 'coordinator', 'ผู้ประสานรวมจุด');
    const driver = await loginStaff(app, 'driver', 'คนขับรวมจุด');
    const created = await request(app).post('/api/batches').set(bearer(coordinator.token));
    expect(created.status).toBe(201);
    const stops = created.body.stops as StopBody[];
    expect(stops.filter((stop) => stop.stop_type === 'drop')).toHaveLength(1);
    const route: RoutableStop[] = stops.map((stop) => ({
      id: stopKey(stop),
      kind: stop.stop_type,
      buyerId: String(stop.buyer_id),
      lat: stop.lat,
      lng: stop.lng,
    }));
    expect(respectsPrecedence(route)).toBe(true);
    const drop = stops.find((stop) => stop.stop_type === 'drop');
    const pickups = stops.filter((stop) => stop.stop_type === 'pickup');
    expect(drop).toBeDefined();
    expect(Math.max(...pickups.map((stop) => stop.seq))).toBeLessThan(drop?.seq ?? 0);

    const exact = await request(app)
      .post(`/api/stops/${pickups[0]?.id}/confirm`)
      .set(bearer(driver.token))
      .send({ weight_kg: 110 });
    expect(exact.status).toBe(200);
    expect(exact.body.stop.weight_flag).toBe(false);
    const over = await request(app)
      .post(`/api/stops/${pickups[1]?.id}/confirm`)
      .set(bearer(driver.token))
      .send({ weight_kg: 111 });
    expect(over.body.stop.weight_flag).toBe(true);
  });
});

function stopSort(stop: RoutableStop): number {
  if (stop.kind === 'pickup') {
    return Number(stop.id.slice('pickup:'.length));
  }
  return 1_000_000 + Number(stop.id.slice('drop:'.length));
}
