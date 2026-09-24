import request from 'supertest';
import { pool } from '../../src/db/pool';
import { resetPublicRateLimit } from '../../src/middleware/publicRateLimit';
import { insertCrop, insertLot, insertPlot, registerUser, testApp } from '../helpers';

const FORBIDDEN_KEYS = [
  'lat',
  'lng',
  'farmer_name',
  'phone',
  'line_id',
  'sale_mode',
  'plot_id',
  'user_id',
  'farmer_id',
  'donation_opened',
];

function assertNoForbiddenFields(payload: unknown): void {
  const json = JSON.stringify(payload);
  for (const key of FORBIDDEN_KEYS) {
    expect(json).not.toContain(`"${key}"`);
  }
}

describe('public market', () => {
  const app = testApp();

  beforeEach(async () => {
    await resetPublicRateLimit();
  });

  it('lists open lots without auth and omits forbidden fields', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงใกล้ตลาด');
    const lotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      grade: 'normal',
    });

    const response = await request(app)
      .get('/api/public/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 });
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.lots)).toBe(true);
    const lot = response.body.lots.find((row: { id: number }) => row.id === lotId);
    expect(lot).toBeDefined();
    expect(lot.crop_name_th).toBe('มะม่วง');
    expect(lot.crop_name_en).toBe('Mango');
    expect(lot.grade).toBe('normal');
    expect(typeof lot.ripeness).toBe('number');
    expect(lot.weight_kg).toBeGreaterThan(0);
    expect(lot.remaining_kg).toBeGreaterThan(0);
    expect(lot.min_order_kg).toBeGreaterThan(0);
    expect(lot.price_per_kg).not.toBeNull();
    expect(lot.hours_left).toBeGreaterThan(0);
    expect(lot.distance_km).toBeGreaterThanOrEqual(0);
    expect(lot.distance_km * 2).toBe(Math.round(lot.distance_km * 2));
    expect(lot.area_th).toBe('แปลงใกล้ตลาด');
    expect(lot.subdistrict_th).toBeNull();
    expect(lot.district_th).toBeNull();
    expect(lot.available_as).toEqual(['buy']);
    assertNoForbiddenFields(lot);
  });

  it('sorts by hours_left when lat/lng omitted', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('มะนาว', 14, 35);
    const plotId = await insertPlot(farmer.user.id, 13.7, 100.7, 'แปลงเรียง');
    const soonId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
    });
    const laterId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });

    const response = await request(app).get('/api/public/market');
    expect(response.status).toBe(200);
    const ids = (response.body.lots as Array<{ id: number }>)
      .map((row) => row.id)
      .filter((id) => id === soonId || id === laterId);
    expect(ids[0]).toBe(soonId);
    expect(ids[1]).toBe(laterId);
    for (const lot of response.body.lots as Array<{ distance_km: number | null }>) {
      expect(lot.distance_km).toBeNull();
    }
  });

  it('hides donate wording for sell_then_donate until opened; donate-only has no price', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('กล้วยน้ำว้า', 4, 25);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงสาธารณะ');
    const stdId = await insertLot({
      plotId,
      cropId,
      saleMode: 'sell_then_donate',
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const donateId = await insertLot({
      plotId,
      cropId,
      saleMode: 'donate',
      expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    });

    const before = await request(app).get(`/api/public/lots/${stdId}`).query({ lat: 13.662, lng: 100.611 });
    expect(before.status).toBe(200);
    expect(before.body.lot.available_as).toEqual(['buy']);
    expect(before.body.lot.price_per_kg).not.toBeNull();
    expect(JSON.stringify(before.body)).not.toContain('donate');
    assertNoForbiddenFields(before.body.lot);

    await pool.query(`UPDATE harvest_lots SET donation_opened = 1, allow_donation = 1 WHERE id = ?`, [
      stdId,
    ]);
    const after = await request(app).get(`/api/public/lots/${stdId}`);
    expect(after.status).toBe(200);
    expect(after.body.lot.available_as).toEqual(['buy', 'donate']);

    const donateOnly = await request(app).get(`/api/public/lots/${donateId}`);
    expect(donateOnly.status).toBe(200);
    expect(donateOnly.body.lot.available_as).toEqual(['donate']);
    expect(donateOnly.body.lot.price_per_kg).toBeNull();
    assertNoForbiddenFields(donateOnly.body.lot);
  });

  it('returns 404 for missing public lot', async () => {
    const missing = await request(app).get('/api/public/lots/999999');
    expect(missing.status).toBe(404);
  });
});
