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

  it('GET /api/crops/categories returns default_shelf_days and parcel_allowed', async () => {
    const res = await request(app).get('/api/crops/categories');
    expect(res.status).toBe(200);
    const cats = res.body.categories as Array<{ id: number; default_shelf_days: number; parcel_allowed: boolean }>;
    expect(cats.length).toBeGreaterThan(0);
    for (const cat of cats) {
      expect(cat).toHaveProperty('default_shelf_days');
      expect(typeof cat.default_shelf_days).toBe('number');
      expect(cat).toHaveProperty('parcel_allowed');
      expect(typeof cat.parcel_allowed).toBe('boolean');
    }
  });

  it('farmer can propose a new crop, status=pending, category defaults applied', async () => {
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
      .send({ name_th: 'พืชทดสอบ propose', category_id: catId, market_price_per_kg: 25 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(typeof res.body.id).toBe('number');

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT status, base_shelf_days FROM crops WHERE id = ?`,
      [res.body.id],
    );
    expect(String(rows[0]?.status)).toBe('pending');
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

  it('admin can approve a pending crop via PATCH', async () => {
    const catId = await getCategoryId();
    const [ins] = await pool.query<ResultSetHeader>(
      `INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg, category_id, status)
       VALUES ('พืชรอตรวจ-approve', 5, 20, ?, 'pending')`,
      [catId],
    );
    const pendingId = ins.insertId;

    const admin = await loginStaff(app, 'coordinator', 'admin-crops-test');
    const res = await request(app)
      .patch(`/api/admin/crops/${pendingId}`)
      .set(bearer(admin.token))
      .send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT status FROM crops WHERE id = ?`,
      [pendingId],
    );
    expect(String(rows[0]?.status)).toBe('approved');
  });

  it('admin merge re-points lots from pending crop to existing crop, deletes pending', async () => {
    const catId = await getCategoryId();
    const farmer = await registerUser(app, { role: 'farmer' });
    const admin = await loginStaff(app, 'coordinator', 'admin-merge-test');

    const existingId = await insertCrop('พืชหลัก-merge', 5, 30, 'Merge Target');
    const [ins] = await pool.query<ResultSetHeader>(
      `INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg, category_id, status)
       VALUES ('พืชรอตรวจ-merge', 5, 30, ?, 'pending')`,
      [catId],
    );
    const pendingId = ins.insertId;

    const plotId = await insertPlot(farmer.user.id, 13.65, 100.62, 'แปลง merge test');
    const lotId = await insertLot({
      plotId,
      cropId: pendingId,
      expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .post(`/api/admin/crops/${pendingId}/merge`)
      .set(bearer(admin.token))
      .send({ target_id: existingId });
    expect(res.status).toBe(200);
    expect(res.body.merged_id).toBe(pendingId);
    expect(res.body.target_id).toBe(existingId);

    const [lotRows] = await pool.query<RowDataPacket[]>(
      `SELECT crop_id FROM harvest_lots WHERE id = ?`,
      [lotId],
    );
    expect(Number(lotRows[0]?.crop_id)).toBe(existingId);

    const [remaining] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM crops WHERE id = ?`,
      [pendingId],
    );
    expect(remaining.length).toBe(0);
  });

  it('GET /api/admin/crops?status=pending lists pending crops', async () => {
    const catId = await getCategoryId();
    await pool.query<ResultSetHeader>(
      `INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg, category_id, status)
       VALUES ('พืช-list-pending-test', 5, 25, ?, 'pending')`,
      [catId],
    );
    const admin = await loginStaff(app, 'coordinator', 'admin-list-crops');
    const res = await request(app)
      .get('/api/admin/crops?status=pending')
      .set(bearer(admin.token));
    expect(res.status).toBe(200);
    const pending = (res.body.crops as Array<{ status: string }>).filter((c) => c.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
  });

  it('GET /api/admin/inbox includes crop count for pending crops', async () => {
    const catId = await getCategoryId();
    await pool.query<ResultSetHeader>(
      `INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg, category_id, status)
       VALUES ('พืช-inbox-test', 5, 25, ?, 'pending')`,
      [catId],
    );
    const admin = await loginStaff(app, 'coordinator', 'admin-inbox-crops');
    const res = await request(app)
      .get('/api/admin/inbox')
      .set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.counts).toHaveProperty('crop');
    expect(res.body.counts.crop).toBeGreaterThan(0);
    const cropItems = (res.body.items as Array<{ kind: string }>).filter((i) => i.kind === 'crop');
    expect(cropItems.length).toBeGreaterThan(0);
  });

  it('non-admin cannot call admin crops endpoint — 403', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const res = await request(app)
      .get('/api/admin/crops')
      .set(bearer(farmer.token));
    expect(res.status).toBe(403);
  });
});
