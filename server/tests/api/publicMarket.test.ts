import request from 'supertest';
import { pool } from '../../src/db/pool';
import { roundDistanceKm } from '../../src/routes/publicMarket';
import { resetPublicMarketRateLimit } from '../../src/middleware/publicMarketRateLimit';
import { insertCrop, insertLot, insertPlot, registerUser, testApp, bearer } from '../helpers';

describe('public market', () => {
  const app = testApp();

  beforeEach(() => {
    resetPublicMarketRateLimit();
  });

  it('returns 200 without auth and omits private fields', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'ลุงลับ' });
    const cropId = await insertCrop('มะม่วงสาธารณะ', 5, 40, 'Public Mango');
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงชุมชน');
    const lotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      description: 'ผิวมีรอยเล็กน้อย รสหวาน เหมาะทำน้ำผลไม้',
    });

    const response = await request(app).get('/api/public/market').query({ sort: 'urgent' });
    expect(response.status).toBe(200);
    const lot = response.body.lots.find((row: { id: number }) => row.id === lotId);
    expect(lot).toBeDefined();
    expect(lot.crop_name_th).toBe('มะม่วงสาธารณะ');
    expect(lot.crop_name_en).toBe('Public Mango');
    expect(lot.plot_name).toBe('แปลงชุมชน');
    expect(lot.location_label).toBe('แปลงชุมชน');
    expect(lot.description).toBe('ผิวมีรอยเล็กน้อย รสหวาน เหมาะทำน้ำผลไม้');

    const detail = await request(app).get(`/api/public/lots/${lotId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.lot.description).toBe('ผิวมีรอยเล็กน้อย รสหวาน เหมาะทำน้ำผลไม้');
    expect(lot.available_as).toEqual(['buy']);
    expect(lot.distance_km).toBeNull();
    expect(lot.photos).toEqual([]);
    expect(lot.sale_mode).toBeUndefined();
    expect(lot.farmer_name).toBeUndefined();
    expect(lot.phone).toBeUndefined();
    expect(lot.lat).toBeUndefined();
    expect(lot.lng).toBeUndefined();
    expect(lot.can_request_donation).toBeUndefined();
    expect(lot.farmer_id).toBeUndefined();
    expect(lot.is_mine).toBeUndefined();

    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('sale_mode');
    expect(raw).not.toContain('farmer_name');
    expect(raw).not.toContain('"phone"');
    expect(raw).not.toContain('"lat"');
    expect(raw).not.toContain('"lng"');
    expect(raw).not.toContain('farmer_id');
  });

  it('flags is_mine only for the lot owner, and computes the price comparison badge', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const otherFarmer = await registerUser(app, { role: 'farmer', name: 'อีกคน' });
    const cropId = await insertCrop('พืชเทียบราคา', 5, 40);
    const plotId = await insertPlot(farmer.user.id, 13.663, 100.612, 'แปลงเทียบราคา');
    const cheaperId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      startPricePerKg: 34,
      floorPricePerKg: 34,
    });
    const higherId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      startPricePerKg: 44,
      floorPricePerKg: 44,
    });
    const donateId = await insertLot({
      plotId,
      cropId,
      saleMode: 'donate',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const anon = await request(app).get('/api/public/market');
    const anonLots = anon.body.lots as Array<{ id: number; is_mine?: boolean }>;
    expect(anonLots.find((l) => l.id === cheaperId)?.is_mine).toBeUndefined();

    const asOwner = await request(app).get('/api/public/market').set(bearer(farmer.token));
    const ownerLots = asOwner.body.lots as Array<{
      id: number;
      is_mine: boolean;
      price_comparison: { tone: string; percentDiff: number } | null;
    }>;
    const cheaperAsOwner = ownerLots.find((l) => l.id === cheaperId);
    expect(cheaperAsOwner?.is_mine).toBe(true);
    expect(cheaperAsOwner?.price_comparison).toEqual({ tone: 'cheaper', percentDiff: 15 });
    const higherAsOwner = ownerLots.find((l) => l.id === higherId);
    expect(higherAsOwner?.price_comparison).toEqual({ tone: 'higher', percentDiff: -10 });
    const donateAsOwner = ownerLots.find((l) => l.id === donateId);
    expect(donateAsOwner?.price_comparison ?? null).toBeNull();

    const asOther = await request(app).get('/api/public/market').set(bearer(otherFarmer.token));
    const otherLots = asOther.body.lots as Array<{ id: number; is_mine: boolean }>;
    expect(otherLots.find((l) => l.id === cheaperId)?.is_mine).toBe(false);

    const cheaperOnly = await request(app)
      .get('/api/public/market')
      .query({ crop_id: cropId, cheaper_only: 1 });
    const cheaperOnlyIds = (cheaperOnly.body.lots as Array<{ id: number }>).map((l) => l.id);
    expect(cheaperOnlyIds).toContain(cheaperId);
    expect(cheaperOnlyIds).not.toContain(higherId);
    expect(cheaperOnlyIds).not.toContain(donateId);
  });

  it('hides donate wording for sell_then_donate before open; donate-only has null price', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('กล้วยสาธารณะ', 4, 25);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงบริจาค');
    const pendingId = await insertLot({
      plotId,
      cropId,
      saleMode: 'sell_then_donate',
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const donateId = await insertLot({
      plotId,
      cropId,
      saleMode: 'donate',
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const response = await request(app)
      .get('/api/public/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, sort: 'urgent' });
    expect(response.status).toBe(200);

    const pending = response.body.lots.find((row: { id: number }) => row.id === pendingId);
    expect(pending.available_as).toEqual(['buy']);
    expect(JSON.stringify(pending)).not.toContain('sale_mode');
    expect(JSON.stringify(pending)).not.toContain('sell_then_donate');
    expect(JSON.stringify(pending)).not.toContain('donate');
    expect(pending.distance_km).toBe(roundDistanceKm(0));

    const donate = response.body.lots.find((row: { id: number }) => row.id === donateId);
    expect(donate.available_as).toEqual(['donate']);
    expect(donate.price_per_kg).toBeNull();

    const detail = await request(app).get(`/api/public/lots/${pendingId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.lot.available_as).toEqual(['buy']);
    expect(detail.body.lot.lat).toBeUndefined();
    expect(detail.body.lot.farmer_name).toBeUndefined();
    expect(JSON.stringify(detail.body)).not.toContain('sell_then_donate');
  });

  it('includes donation eligibility hints when Bearer token present', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    const cropId = await insertCrop('มะเขือสาธารณะ', 5, 30);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611);
    const lotId = await insertLot({
      plotId,
      cropId,
      saleMode: 'donate',
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });

    const anon = await request(app).get(`/api/public/lots/${lotId}`);
    expect(anon.status).toBe(200);
    expect(anon.body.lot.can_request_donation).toBeUndefined();
    expect(anon.body.lot.donation_audience).toBeUndefined();

    const authed = await request(app).get(`/api/public/lots/${lotId}`).set(bearer(buyer.token));
    expect(authed.status).toBe(200);
    expect(authed.body.lot.donation_audience).toBeDefined();
    expect(authed.body.lot.can_request_donation).toBe(false);
    expect(typeof authed.body.lot.reason).toBe('string');
  });

  it('filters by crop_id and sorts cheap', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const mango = await insertCrop('มะม่วงถูก', 5, 40);
    const banana = await insertCrop('กล้วยแพง', 4, 25);
    const plotId = await insertPlot(farmer.user.id, 13.65, 100.62);
    const mangoId = await insertLot({
      plotId,
      cropId: mango,
      startPricePerKg: 20,
      floorPricePerKg: 8,
      expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    });
    await insertLot({
      plotId,
      cropId: banana,
      startPricePerKg: 15,
      floorPricePerKg: 6,
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });

    const filtered = await request(app).get('/api/public/market').query({ crop_id: mango, sort: 'cheap' });
    expect(filtered.status).toBe(200);
    expect(filtered.body.lots.every((lot: { crop_id: number }) => lot.crop_id === mango)).toBe(true);
    expect(filtered.body.lots.some((lot: { id: number }) => lot.id === mangoId)).toBe(true);
  });

  it('filters by category_id, price range, and max_hours', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    await pool.query(`DELETE FROM crop_categories WHERE id >= 100`);
    await pool.query(
      `INSERT INTO crop_categories (id, name_th, name_en, sort_order) VALUES (100, 'ทดสอบหมวด', 'Test cat', 99)`,
    );
    const catCrop = await insertCrop('พืชหมวดทดสอบ', 5, 40, 'Cat crop');
    await pool.query(`UPDATE crops SET category_id = 100 WHERE id = ?`, [catCrop]);
    const otherCrop = await insertCrop('พืชนอกหมวด', 5, 20, 'Other crop');
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงตัวกรอง');
    await insertLot({
      plotId,
      cropId: catCrop,
      expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
    });
    await insertLot({
      plotId,
      cropId: otherCrop,
      expiresAt: new Date(Date.now() + 60 * 60 * 60 * 1000),
    });

    const byCat = await request(app).get('/api/public/market').query({ category_id: 100 });
    expect(byCat.status).toBe(200);
    expect(byCat.body.lots.every((lot: { crop_name_th: string }) => lot.crop_name_th === 'พืชหมวดทดสอบ')).toBe(true);

    const under12h = await request(app).get('/api/public/market').query({ max_hours: 12 });
    expect(under12h.status).toBe(200);
    expect(under12h.body.lots.length).toBeGreaterThan(0);
    expect(under12h.body.lots.every((lot: { hours_left: number }) => lot.hours_left <= 12)).toBe(true);

    const priceBand = await request(app).get('/api/public/market').query({ price_min: 0, price_max: 5 });
    expect(priceBand.status).toBe(200);
    expect(priceBand.body.lots.every((lot: { price_per_kg: number | null }) => lot.price_per_kg !== null)).toBe(true);

    const badRange = await request(app).get('/api/public/market').query({ price_min: 50, price_max: 10 });
    expect(badRange.status).toBe(400);
  });

  it('opens donation on sell_then_donate after donation_opened', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('ส้มสาธารณะ', 5, 35);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611);
    const lotId = await insertLot({
      plotId,
      cropId,
      saleMode: 'sell_then_donate',
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    await pool.query(`UPDATE harvest_lots SET donation_opened = 1, allow_donation = 1 WHERE id = ?`, [
      lotId,
    ]);

    const response = await request(app).get('/api/public/market');
    const lot = response.body.lots.find((row: { id: number }) => row.id === lotId);
    expect(lot.available_as).toEqual(['buy', 'donate']);
    expect(JSON.stringify(lot)).not.toContain('sell_then_donate');
    expect(JSON.stringify(lot)).not.toContain('sale_mode');
  });

  it('returns 404 for missing public lot', async () => {
    const missing = await request(app).get('/api/public/lots/999999');
    expect(missing.status).toBe(404);
  });
});
