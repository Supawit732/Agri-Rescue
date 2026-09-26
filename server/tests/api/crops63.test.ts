import request from 'supertest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { bearer, insertCrop, insertLot, insertPlot, loginStaff, registerUser, testApp } from '../helpers';

async function getCategoryId(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM crop_categories ORDER BY id LIMIT 1`,
  );
  const row = rows[0];
  if (row === undefined) throw new Error('no crop categories — migration not run?');
  return Number(row.id);
}

describe('6.3 crop catalog', () => {
  const app = testApp();

  it('GET /api/crops returns only approved crops', async () => {
    const catId = await getCategoryId();
    await pool.query<ResultSetHeader>(
      `INSERT INTO crops (name_th, name_en, base_shelf_days, market_price_per_kg, category_id, status)
       VALUES ('พืชทดสอบอนุมัติ', null, 5, 30, ?, 'approved'),
              ('พืชทดสอบรอตรวจ', null, 5, 30, ?, 'pending')`,
      [catId, catId],
    );
    const res = await request(app).get('/api/crops');
    expect(res.status).toBe(200);
    const names: string[] = (res.body.crops as Array<{ name_th: string }>).map((c) => c.name_th);
    expect(names).toContain('พืชทดสอบอนุมัติ');
    expect(names).not.toContain('พืชทดสอบรอตรวจ');
  });

  it('GET /api/crops/categories returns default_shelf_days, parcel_allowed, and example_crops', async () => {
    const res = await request(app).get('/api/crops/categories');
    expect(res.status).toBe(200);
    const cats = res.body.categories as Array<{
      id: number;
      default_shelf_days: number;
      parcel_allowed: boolean;
      example_crops: Array<{ id: number; name_th: string; name_en: string | null }>;
    }>;
    expect(cats.length).toBeGreaterThan(0);
    for (const cat of cats) {
      expect(cat).toHaveProperty('default_shelf_days');
      expect(typeof cat.default_shelf_days).toBe('number');
      expect(cat).toHaveProperty('parcel_allowed');
      expect(typeof cat.parcel_allowed).toBe('boolean');
      expect(Array.isArray(cat.example_crops)).toBe(true);
      expect(cat.example_crops.length).toBeLessThanOrEqual(3);
    }
  });

  it('farmer propose auto-approves crop (status=approved), category defaults applied', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const catId = await getCategoryId();
    const [catRows] = await pool.query<RowDataPacket[]>(
      `SELECT default_shelf_days FROM crop_categories WHERE id = ?`,
      [catId],
    );
    const expectedShelf = Number(catRows[0]?.default_shelf_days ?? 5);

    const res = await request(app)
      .post('/api/crops/propose')
      .set(bearer(farmer.token))
      .send({ name_th: 'พืชทดสอบ auto-approve', category_id: catId, market_price_per_kg: 25 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('approved');
    expect(typeof res.body.id).toBe('number');

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT status, base_shelf_days FROM crops WHERE id = ?`,
      [res.body.id],
    );
    expect(String(rows[0]?.status)).toBe('approved');
    expect(Number(rows[0]?.base_shelf_days)).toBe(expectedShelf);
  });

  it('non-farmer (buyer) cannot propose crop — 403', async () => {
    const buyer = await registerUser(app, { role: 'buyer' });
    const catId = await getCategoryId();
    const res = await request(app)
      .post('/api/crops/propose')
      .set(bearer(buyer.token))
      .send({ name_th: 'พืชทดสอบบายเออร์', category_id: catId, market_price_per_kg: 25 });
    expect(res.status).toBe(403);
  });

  it('exact duplicate name returns 409 DUPLICATE', async () => {
    const catId = await getCategoryId();
    await pool.query<ResultSetHeader>(
      `INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg, category_id, status)
       VALUES ('พืชซ้ำทดสอบ63', 5, 20, ?, 'approved')`,
      [catId],
    );
    const farmer = await registerUser(app, { role: 'farmer' });
    const res = await request(app)
      .post('/api/crops/propose')
      .set(bearer(farmer.token))
      .send({ name_th: 'พืชซ้ำทดสอบ63', category_id: catId, market_price_per_kg: 20 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE');
  });

  it('near-duplicate name (edit distance ≤2) returns 409 NEAR_MATCH with suggestions', async () => {
    const catId = await getCategoryId();
    // Insert "พืชใกล้เคียง63" then propose "พืชใกล้เคยง63" (one char swap)
    await pool.query<ResultSetHeader>(
      `INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg, category_id, status)
       VALUES ('พืชใกล้เคียง63', 5, 20, ?, 'approved')`,
      [catId],
    );
    const farmer = await registerUser(app, { role: 'farmer' });
    const res = await request(app)
      .post('/api/crops/propose')
      .set(bearer(farmer.token))
      .send({ name_th: 'พืชใกล้เคยง63', category_id: catId, market_price_per_kg: 20 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NEAR_MATCH');
    expect(Array.isArray(res.body.error.details?.suggestions)).toBe(true);
    expect((res.body.error.details?.suggestions as unknown[]).length).toBeGreaterThan(0);
  });

  it('force=true bypasses near-match and creates crop', async () => {
    const catId = await getCategoryId();
    await pool.query<ResultSetHeader>(
      `INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg, category_id, status)
       VALUES ('พืชฟอร์ซ63', 5, 20, ?, 'approved')`,
      [catId],
    );
    const farmer = await registerUser(app, { role: 'farmer' });
    const res = await request(app)
      .post('/api/crops/propose')
      .set(bearer(farmer.token))
      .send({ name_th: 'พืชฟอรซ63', category_id: catId, market_price_per_kg: 20, force: true });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('approved');
  });

  it('price sanity check rejects outlier price (>3× category median)', async () => {
    const catId = await getCategoryId();
    // Ensure category has enough approved crops to compute median
    await pool.query<ResultSetHeader>(
      `INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg, category_id, status)
       VALUES ('พืชราคาฐาน-a', 5, 20, ?, 'approved'),
              ('พืชราคาฐาน-b', 5, 25, ?, 'approved')`,
      [catId, catId],
    );
    const farmer = await registerUser(app, { role: 'farmer' });
    const res = await request(app)
      .post('/api/crops/propose')
      .set(bearer(farmer.token))
      // median ~22.5; >3× = >67.5 → 200 should fail
      .send({ name_th: 'พืชราคาแพงมากผิดปกติ', category_id: catId, market_price_per_kg: 999 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PRICE_SANITY');
  });

  it('admin merge re-points lots from source crop to target, deletes source', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const admin = await loginStaff(app, 'coordinator', 'admin-merge-test');

    const sourceId = await insertCrop('พืชต้นทาง-merge63', 5, 30, 'Merge Source');
    const targetId = await insertCrop('พืชปลายทาง-merge63', 5, 30, 'Merge Target');

    const plotId = await insertPlot(farmer.user.id, 13.65, 100.62, 'แปลง merge test');
    const lotId = await insertLot({
      plotId,
      cropId: sourceId,
      expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .post(`/api/admin/crops/${sourceId}/merge`)
      .set(bearer(admin.token))
      .send({ target_id: targetId });
    expect(res.status).toBe(200);
    expect(res.body.merged_id).toBe(sourceId);
    expect(res.body.target_id).toBe(targetId);

    const [lotRows] = await pool.query<RowDataPacket[]>(
      `SELECT crop_id FROM harvest_lots WHERE id = ?`,
      [lotId],
    );
    expect(Number(lotRows[0]?.crop_id)).toBe(targetId);

    const [remaining] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM crops WHERE id = ?`,
      [sourceId],
    );
    expect(remaining.length).toBe(0);
  });

  it('non-admin cannot call admin crops merge endpoint — 403', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const res = await request(app)
      .post('/api/admin/crops/1/merge')
      .set(bearer(farmer.token))
      .send({ target_id: 2 });
    expect(res.status).toBe(403);
  });
});
