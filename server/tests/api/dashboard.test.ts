import request from 'supertest';
import type { ResultSetHeader } from 'mysql2';
import { CO2E_PER_KG } from '../../src/db/seedData';
import { pool } from '../../src/db/pool';
import { round2 } from '../../src/delivery/depot';
import { bearer, insertCrop, insertLot, insertPlot, loginStaff, registerUser, testApp } from '../helpers';

describe('dashboard', () => {
  const app = testApp();

  async function seedImpactForFarmer(farmerId: number, kg: number): Promise<void> {
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const plotId = await insertPlot(farmerId, 13.66, 100.61);
    const lotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      weightKg: kg,
    });
    await pool.query('UPDATE harvest_lots SET status = ? WHERE id = ?', ['delivered', lotId]);
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const [orderResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO orders
         (lot_id, buyer_id, quantity_kg, agreed_price_per_kg, is_donation, status, batch_id, drop_otp)
       VALUES (?, ?, ?, 20, 0, 'delivered', NULL, '1111')`,
      [lotId, buyer.user.id, kg],
    );
    await pool.query('INSERT INTO impact_logs (order_id, kg_saved, co2e_kg) VALUES (?, ?, ?)', [
      orderResult.insertId,
      kg,
      round2(kg * CO2E_PER_KG),
    ]);
    await pool.query(
      `INSERT INTO quality_assessments
         (lot_id, method, ripeness, temp_c, humidity, predicted_shelf_hours, ai_ripeness, ai_confidence, ai_model)
       VALUES (?, 'model', 2, 32, 75, 48, 2, 0.9, 'test')`,
      [lotId],
    );
  }

  it('lets admin see system-wide stats and sellers see only their lots', async () => {
    const farmerA = await registerUser(app, { role: 'farmer', name: 'เกษตรกรเอ' });
    const farmerB = await registerUser(app, { role: 'farmer', name: 'เกษตรกรบี' });
    await seedImpactForFarmer(farmerA.user.id, 10);
    await seedImpactForFarmer(farmerB.user.id, 30);

    const admin = await loginStaff(app, 'coordinator', 'ผู้ประสานแดชบอร์ด');
    const adminDash = await request(app).get('/api/dashboard').set(bearer(admin.token));
    expect(adminDash.status).toBe(200);
    expect(adminDash.body.scope).toBe('admin');
    expect(adminDash.body.cards.kg_saved).toBe(40);
    expect(adminDash.body.cards.order_count).toBe(2);
    expect(adminDash.body.charts.daily_kg).toHaveLength(14);
    expect(adminDash.body.charts.ai_accuracy.total).toBe(2);
    expect(adminDash.body.charts.ai_accuracy.matched).toBe(2);
    expect(adminDash.body.charts.ai_accuracy.accuracy).toBe(1);

    const sellerDash = await request(app).get('/api/dashboard').set(bearer(farmerA.token));
    expect(sellerDash.status).toBe(200);
    expect(sellerDash.body.scope).toBe('seller');
    expect(sellerDash.body.cards.kg_saved).toBe(10);
    expect(sellerDash.body.cards.order_count).toBe(1);
    expect(sellerDash.body.charts.by_crop[0]?.crop_name_th).toBe('มะม่วง');
  });

  it('returns 403 for buyer-only users', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    const res = await request(app).get('/api/dashboard').set(bearer(buyer.token));
    expect(res.status).toBe(403);
  });
});
