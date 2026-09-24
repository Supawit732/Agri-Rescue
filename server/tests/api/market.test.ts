import request from 'supertest';
import { pool } from '../../src/db/pool';
import { lotPricePerKg } from '../../src/domain/sellerPricing';
import { bearer, insertCrop, insertLot, insertPlot, registerUser, testApp } from '../helpers';

describe('market', () => {
  const app = testApp();

  it('hides expired lots and prices the rest with the domain function', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const nearPlot = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงใกล้');
    const farPlot = await insertPlot(farmer.user.id, 14.8, 100.611, 'แปลงไกล');
    const soon = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const expired = new Date(Date.now() - 60 * 60 * 1000);
    const soonId = await insertLot({ plotId: nearPlot, cropId, expiresAt: soon, grade: 'normal' });
    const laterId = await insertLot({ plotId: nearPlot, cropId, expiresAt: later, grade: 'substandard' });
    const expiredId = await insertLot({ plotId: nearPlot, cropId, expiresAt: expired });
    await insertLot({ plotId: farPlot, cropId, expiresAt: later });

    const response = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(response.status).toBe(200);
    const ids = response.body.lots.map((lot: { id: number }) => lot.id);
    expect(ids).toEqual([soonId, laterId]);
    expect(ids).not.toContain(expiredId);

    for (const lot of response.body.lots as Array<{
      id: number;
      hours_left: number;
      price_per_kg: number;
      grade: 'normal' | 'substandard';
      available_as: string[];
      sale_mode?: string;
      donation_opened?: boolean;
    }>) {
      expect(lot.hours_left).toBeGreaterThan(0);
      expect(lot.available_as).toEqual(['buy']);
      expect(lot.sale_mode).toBeUndefined();
      expect(lot.donation_opened).toBeUndefined();
      const start = lot.grade === 'substandard' ? 28 : 40;
      const floor = Math.round(start * 0.3 * 100) / 100;
      expect(lot.price_per_kg).toBe(
        lotPricePerKg({
          startPricePerKg: start,
          floorPricePerKg: floor,
          baseShelfHours: 5 * 24,
          hoursLeft: lot.hours_left,
        }),
      );
    }
  });

  it('hides sell_then_donate until donation_opened, then exposes donate via available_as', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'vendor',
      lat: 13.662,
      lng: 100.611,
    });
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงทดสอบ');
    const lotId = await insertLot({
      plotId,
      cropId,
      saleMode: 'sell_then_donate',
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    const before = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(before.status).toBe(200);
    const beforeLot = before.body.lots.find((lot: { id: number }) => lot.id === lotId);
    expect(beforeLot).toBeDefined();
    expect(beforeLot.available_as).toEqual(['buy']);
    expect(beforeLot.allow_donation).toBe(false);
    expect(JSON.stringify(beforeLot)).not.toContain('sale_mode');
    expect(JSON.stringify(beforeLot)).not.toContain('sell_then_donate');
    expect(JSON.stringify(beforeLot)).not.toContain('donate');

    const detailBefore = await request(app)
      .get(`/api/market/lots/${lotId}`)
      .query({ lat: 13.662, lng: 100.611 })
      .set(bearer(buyer.token));
    expect(detailBefore.status).toBe(200);
    expect(detailBefore.body.lot.available_as).toEqual(['buy']);
    expect(detailBefore.body.lot.plot_name).toBe('แปลงทดสอบ');
    expect(detailBefore.body.lot.location_label).toBe('แปลงทดสอบ');
    expect(detailBefore.body.lot.sale_mode).toBeUndefined();
    expect(JSON.stringify(detailBefore.body)).not.toContain('sell_then_donate');

    await pool.query(`UPDATE harvest_lots SET donation_opened = 1, allow_donation = 1 WHERE id = ?`, [
      lotId,
    ]);

    const after = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(after.status).toBe(200);
    const afterLot = after.body.lots.find((lot: { id: number }) => lot.id === lotId);
    expect(afterLot.available_as).toEqual(['buy', 'donate']);
    expect(afterLot.allow_donation).toBe(true);
    expect(afterLot.sale_mode).toBeUndefined();
    expect(JSON.stringify(afterLot)).not.toContain('sell_then_donate');

    const detailAfter = await request(app)
      .get(`/api/market/lots/${lotId}`)
      .set(bearer(buyer.token));
    expect(detailAfter.status).toBe(200);
    expect(detailAfter.body.lot.available_as).toEqual(['buy', 'donate']);

    const mine = await request(app).get('/api/lots/mine').set(bearer(farmer.token));
    expect(mine.status).toBe(200);
    const owned = mine.body.lots.find((lot: { id: number }) => lot.id === lotId);
    expect(owned.sale_mode).toBe('sell_then_donate');
    expect(owned.donation_opened).toBe(true);
  });

  it('returns 404 for missing buyer lot detail', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    const missing = await request(app).get('/api/market/lots/999999').set(bearer(buyer.token));
    expect(missing.status).toBe(404);
  });
});
