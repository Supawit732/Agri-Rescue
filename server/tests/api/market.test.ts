import request from 'supertest';
import { urgentPricePerKg } from '../../src/domain/pricing';
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
    }>) {
      expect(lot.hours_left).toBeGreaterThan(0);
      expect(lot.price_per_kg).toBe(
        urgentPricePerKg({
          marketPricePerKg: 40,
          baseShelfHours: 5 * 24,
          hoursLeft: lot.hours_left,
          grade: lot.grade,
        }),
      );
    }
  });
});
