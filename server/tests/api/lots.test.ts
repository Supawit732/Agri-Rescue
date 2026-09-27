import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { PLAN_WEATHER_FALLBACK } from '../../src/db/seedData';
import { pool } from '../../src/db/pool';
import {
  lotPricePerKg,
  minAllowedFloor,
  suggestedFloorPrice,
  suggestedStartPrice,
} from '../../src/domain/sellerPricing';
import { predictShelfHours } from '../../src/domain/shelfLife';
import { bearer, insertCrop, insertLot, insertPlot, registerUser, testApp, pickAvailablePickupSlot } from '../helpers';
import { installWeatherFailure, installWeatherSuccess } from '../weatherMock';

describe('lots and plots', () => {
  const app = testApp();

  it('previews price from domain helpers and keeps lots scoped to the farmer', async () => {
    installWeatherSuccess(34, 78);
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const owner = await registerUser(app, { role: 'farmer', name: 'เจ้าของแปลง' });
    const other = await registerUser(app, { role: 'farmer', name: 'เกษตรกรคนอื่น' });

    const created = await request(app).post('/api/plots').set(bearer(owner.token)).send({
      name: 'แปลงมะม่วง',
      lat: 13.67,
      lng: 100.63,
      area_rai: 1,
    });
    expect(created.status).toBe(201);
    const plotId = Number(created.body.plot.id);

    const estimate = await request(app).post('/api/lots/estimate').set(bearer(owner.token)).send({
      crop_id: cropId,
      ripeness: 2,
      grade: 'normal',
      lat: 13.67,
      lng: 100.63,
    });
    expect(estimate.status).toBe(200);
    const shelfHours = predictShelfHours(5, 2, 34, 78);
    const start = suggestedStartPrice(40, 'normal');
    const floor = suggestedFloorPrice(start);
    expect(estimate.body.shelf_hours).toBe(shelfHours);
    expect(estimate.body.price_per_kg).toBe(
      lotPricePerKg({
        startPricePerKg: start,
        floorPricePerKg: floor,
        baseShelfHours: 5 * 24,
        hoursLeft: shelfHours,
      }),
    );
    expect(estimate.body.suggested_start_price_per_kg).toBe(start);
    expect(estimate.body.suggested_floor_price_per_kg).toBe(floor);
    expect(estimate.body.market_quote.label_th).toContain('บาท');
    expect(estimate.body.market_quote.is_estimate).toBe(true);
    expect(estimate.body.market_quote.seasonal_adjusted).toBe(false);
    expect(estimate.body.max_start_price_per_kg).toBe(40);
    expect(estimate.body.min_floor_price_per_kg).toBe(minAllowedFloor(40));
    expect(estimate.body.min_floor_pct_of_market).toBe(20);
    expect(estimate.body.forecast).toHaveLength(3);
    expect(estimate.body.temp_c).toBe(34);
    expect(estimate.body.humidity).toBe(78);
    expect(estimate.body.weather_source).toBe('live');
    expect(estimate.body.weather_basis).toBe('forecast_72h_daytime_avg');
    expect(estimate.body.shelf_hours).toBe(61);
    expect(estimate.body.price_per_kg).toBe(32);

    const [before] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM harvest_lots');
    expect(Number(before[0]?.total)).toBe(0);

    const lot = await request(app).post('/api/lots').set(bearer(owner.token)).send({
      plot_id: plotId,
      crop_id: cropId,
      weight_kg: 12,
      grade: 'substandard',
      ripeness: 2,
      sale_mode: 'sell_then_donate',
    });
    expect(lot.status).toBe(201);
    expect(lot.body.assessment.method).toBe('rule');
    expect(lot.body.lot.predicted_shelf_hours).toBe(shelfHours);
    expect(lot.body.lot.sale_mode).toBe('sell_then_donate');
    expect(lot.body.lot.donation_opened).toBe(false);

    const mine = await request(app).get('/api/lots/mine').set(bearer(owner.token));
    expect(mine.status).toBe(200);
    expect(mine.body.lots).toHaveLength(1);
    expect(mine.body.lots[0]).toMatchObject({
      crop_name_th: 'มะม่วง',
      plot_name: 'แปลงมะม่วง',
      weight_kg: 12,
      grade: 'substandard',
      sale_mode: 'sell_then_donate',
    });
    expect(typeof mine.body.lots[0].price_per_kg).toBe('number');
    expect(mine.body.lots[0].price_per_kg).toBeGreaterThan(0);

    const hidden = await request(app).get('/api/lots').set(bearer(other.token));
    expect(hidden.body.lots).toHaveLength(0);
    const otherPlots = await request(app).get('/api/plots/mine').set(bearer(other.token));
    expect(otherPlots.body.plots).toHaveLength(0);

    const forbidden = await request(app).post('/api/lots').set(bearer(other.token)).send({
      plot_id: plotId,
      crop_id: cropId,
      weight_kg: 5,
      grade: 'normal',
      ripeness: 1,
      sale_mode: 'sell',
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('returns weather_source fallback from /lots/estimate when Open-Meteo fails', async () => {
    installWeatherFailure();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const cropId = await insertCrop('กล้วย', 4, 20);
      const owner = await registerUser(app, { role: 'farmer', name: 'เกษตรกรอากาศสำรอง' });

      const estimate = await request(app).post('/api/lots/estimate').set(bearer(owner.token)).send({
        crop_id: cropId,
        ripeness: 1,
        grade: 'substandard',
        lat: 13.67,
        lng: 100.63,
      });
      expect(estimate.status).toBe(200);
      expect(estimate.body.temp_c).toBe(PLAN_WEATHER_FALLBACK.tempC);
      expect(estimate.body.humidity).toBe(PLAN_WEATHER_FALLBACK.humidity);
      expect(estimate.body.weather_source).toBe('fallback');
      expect(estimate.body.weather_basis).toBe('forecast_72h_daytime_avg');
      expect(estimate.body.shelf_hours).toBe(
        predictShelfHours(4, 1, PLAN_WEATHER_FALLBACK.tempC, PLAN_WEATHER_FALLBACK.humidity),
      );
      const start = suggestedStartPrice(20, 'substandard');
      const floor = suggestedFloorPrice(start);
      expect(estimate.body.price_per_kg).toBe(
        lotPricePerKg({
          startPricePerKg: start,
          floorPricePerKg: floor,
          baseShelfHours: 4 * 24,
          hoursLeft: estimate.body.shelf_hours,
        }),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('soft-deletes owner lots with no orders and blocks when orders exist or other farmer', async () => {
    const owner = await registerUser(app, { role: 'farmer', name: 'เจ้าของลบ' });
    const other = await registerUser(app, { role: 'farmer', name: 'คนอื่น' });
    const cropId = await insertCrop('มะนาว', 14, 35);
    const plotId = await insertPlot(owner.user.id, 13.66, 100.61);
    const emptyLotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      weightKg: 8,
    });
    const bookedLotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      weightKg: 12,
    });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const booked = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: bookedLotId, donation: false, quantity_kg: 3, ...pickAvailablePickupSlot() });
    expect(booked.status).toBe(201);

    const forbidden = await request(app)
      .delete(`/api/lots/${emptyLotId}`)
      .set(bearer(other.token));
    expect(forbidden.status).toBe(403);

    const conflict = await request(app)
      .delete(`/api/lots/${bookedLotId}`)
      .set(bearer(owner.token));
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('HAS_ORDERS');

    const ok = await request(app).delete(`/api/lots/${emptyLotId}`).set(bearer(owner.token));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT status, deleted_at FROM harvest_lots WHERE id = ?',
      [emptyLotId],
    );
    expect(rows[0]?.status).toBe('cancelled');
    expect(rows[0]?.deleted_at).not.toBeNull();

    const [logs] = await pool.query<RowDataPacket[]>(
      'SELECT lot_id, farmer_id, snapshot_json FROM lot_delete_logs WHERE lot_id = ?',
      [emptyLotId],
    );
    expect(logs).toHaveLength(1);
    expect(Number(logs[0]?.farmer_id)).toBe(owner.user.id);

    const mine = await request(app).get('/api/lots/mine').set(bearer(owner.token));
    expect(mine.status).toBe(200);
    expect(mine.body.lots.map((l: { id: number }) => l.id)).not.toContain(emptyLotId);
    expect(mine.body.lots.map((l: { id: number }) => l.id)).toContain(bookedLotId);
  });

  it('creates and patches a lot description, and rejects contact info in it', async () => {
    installWeatherSuccess(30, 70);
    const cropId = await insertCrop('ส้ม', 7, 30);
    const owner = await registerUser(app, { role: 'farmer', name: 'เจ้าของคำอธิบาย' });
    const plotId = await insertPlot(owner.user.id, 13.66, 100.61);

    const rejected = await request(app).post('/api/lots').set(bearer(owner.token)).send({
      plot_id: plotId,
      crop_id: cropId,
      weight_kg: 5,
      grade: 'normal',
      ripeness: 2,
      sale_mode: 'sell',
      description: 'โทร 0812345678 นะครับ',
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.fields.description).toBeDefined();

    const created = await request(app).post('/api/lots').set(bearer(owner.token)).send({
      plot_id: plotId,
      crop_id: cropId,
      weight_kg: 5,
      grade: 'normal',
      ripeness: 2,
      sale_mode: 'sell',
      description: 'ผิวมีรอยเล็กน้อย รสหวาน เหมาะทำน้ำผลไม้',
    });
    expect(created.status).toBe(201);
    expect(created.body.lot.description).toBe('ผิวมีรอยเล็กน้อย รสหวาน เหมาะทำน้ำผลไม้');
    const lotId = Number(created.body.lot.id);

    const patchRejected = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(owner.token))
      .send({ description: 'ทักไลน์มาคุยกันได้' });
    expect(patchRejected.status).toBe(400);
    expect(patchRejected.body.error.fields.description).toBeDefined();

    const patched = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(owner.token))
      .send({ description: 'มีตำหนิเล็กน้อยที่ขั้ว' });
    expect(patched.status).toBe(200);
    expect(patched.body.lot.description).toBe('มีตำหนิเล็กน้อยที่ขั้ว');

    const [logs] = await pool.query<RowDataPacket[]>(
      `SELECT field_name, old_value, new_value FROM lot_edit_logs WHERE lot_id = ? AND field_name = 'description'`,
      [lotId],
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]?.new_value).toBe('มีตำหนิเล็กน้อยที่ขั้ว');

    const mine = await request(app).get('/api/lots/mine').set(bearer(owner.token));
    const mineLot = mine.body.lots.find((l: { id: number }) => l.id === lotId);
    expect(mineLot.description).toBe('มีตำหนิเล็กน้อยที่ขั้ว');
  });

  it('clears photo_url when crop changes without a new photo', async () => {
    installWeatherSuccess(28, 75);
    const mangoCropId = await insertCrop('มะม่วง', 5, 40);
    const bananaCropId = await insertCrop('กล้วย', 4, 20);
    const owner = await registerUser(app, { role: 'farmer', name: 'เจ้าของเปลี่ยนพืช' });
    const plotId = await insertPlot(owner.user.id, 13.66, 100.61);

    const created = await request(app).post('/api/lots').set(bearer(owner.token)).send({
      plot_id: plotId,
      crop_id: mangoCropId,
      weight_kg: 10,
      grade: 'normal',
      ripeness: 2,
      sale_mode: 'sell',
      photo_url: 'https://example.com/mango.jpg',
    });
    expect(created.status).toBe(201);
    const lotId = Number(created.body.lot.id);
    expect(created.body.lot.photo_url).toBe('https://example.com/mango.jpg');

    const patched = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(owner.token))
      .send({ crop_id: bananaCropId, photo_url: null });
    expect(patched.status).toBe(200);
    expect(patched.body.lot.photo_url).toBeNull();

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT photo_url FROM harvest_lots WHERE id = ?',
      [lotId],
    );
    expect(rows[0]?.photo_url).toBeNull();
  });

  it('saves the photo from assess-photo even when the AI check is unavailable', async () => {
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const owner = await registerUser(app, { role: 'farmer', name: 'เกษตรกรถ่ายรูป' });
    // 1x1 px PNG, tiny fixture image.
    const image_base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const assessed = await request(app).post('/api/lots/assess-photo').set(bearer(owner.token)).send({
      crop_id: cropId,
      image_base64,
      mime: 'image/png',
    });

    expect(assessed.status).toBe(200);
    expect(assessed.body.available).toBe(false);
    expect(typeof assessed.body.photo_url).toBe('string');
    expect(assessed.body.photo_url).toMatch(/^\/uploads\/lots\//);

    const plotId = await insertPlot(owner.user.id, 13.65, 100.6);
    const created = await request(app).post('/api/lots').set(bearer(owner.token)).send({
      plot_id: plotId,
      crop_id: cropId,
      weight_kg: 8,
      grade: 'normal',
      ripeness: 2,
      sale_mode: 'sell',
      photo_url: assessed.body.photo_url,
    });

    expect(created.status).toBe(201);
    expect(created.body.lot.photo_url).toBe(assessed.body.photo_url);
  });
});
