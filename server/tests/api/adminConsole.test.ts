import request from 'supertest';
import bcrypt from 'bcryptjs';
import { pool } from '../../src/db/pool';
import { insertCrop, insertLot, insertPlot, registerUser, testApp, bearer, nextPhone } from '../helpers';

async function createAdmin(): Promise<{ token: string; user: { id: number; name: string } }> {
  const phone = nextPhone();
  const passwordHash = await bcrypt.hash('demo1234', 10);
  await pool.query(
    `INSERT INTO users (name, phone, password_hash, role, can_sell, can_buy, is_admin, lat, lng)
     VALUES (?, ?, ?, 'coordinator', 0, 0, 1, NULL, NULL)`,
    ['admin-test', phone, passwordHash],
  );
  const login = await request(testApp()).post('/api/auth/login').send({ phone, password: 'demo1234' });
  if (login.status !== 200) {
    throw new Error(`admin login failed ${login.status}`);
  }
  return { token: login.body.token, user: login.body.user };
}

describe('admin console', () => {
  const app = testApp();

  it('admin overview returns real metrics with actions and charts', async () => {
    const admin = await createAdmin();
    const farmer = await registerUser(app, { role: 'farmer', name: 'ผู้ขายเดโม' });
    const buyer = await registerUser(app, { role: 'buyer', name: 'ผู้ซื้อเดโม' });
    const cropId = await insertCrop('มะม่วงAdmin', 5, 40, 'Mango Admin');
    const plotId = await insertPlot(farmer.user.id, 13.65, 100.62, 'แปลงAdmin');
    await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .get('/api/admin/overview')
      .set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.users.total).toBeGreaterThan(0);
    expect(res.body.users.sellers).toBeGreaterThanOrEqual(1);
    expect(res.body.lots.open).toBeGreaterThanOrEqual(1);
    expect(res.body.impact).toHaveProperty('kg_saved');
    expect(res.body.impact).toHaveProperty('co2e_kg');
    expect(res.body.impact).toHaveProperty('farmer_income');
    expect(res.body.impact).toHaveProperty('donated_kg');
    expect(res.body.actions).toHaveProperty('org_pending');
    expect(res.body.actions).toHaveProperty('support_open');
    expect(res.body.actions).toHaveProperty('weight_flags');
    expect(res.body.actions).toHaveProperty('otp_locked');
    expect(res.body.health).toHaveProperty('sell_through_rate');
    expect(res.body.health).toHaveProperty('cancelled_orders');
    expect(res.body.charts.daily_kg).toBeInstanceOf(Array);
    expect(res.body.charts.by_crop).toBeInstanceOf(Array);
    expect(res.body.charts.top_shops).toBeInstanceOf(Array);
    void buyer;
  });

  it('non-admin cannot call admin console APIs', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const res = await request(app)
      .get('/api/admin/overview')
      .set(bearer(farmer.token));
    expect(res.status).toBe(403);
  });

  it('admin cannot enable sell or buy (segregation of duties)', async () => {
    const admin = await createAdmin();
    const patch = await request(app)
      .patch('/api/auth/profile')
      .set(bearer(admin.token))
      .send({ can_sell: true });
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe('FORBIDDEN');

    const patchBuy = await request(app)
      .patch('/api/auth/profile')
      .set(bearer(admin.token))
      .send({ can_buy: true, buyer_type: 'vendor' });
    expect(patchBuy.status).toBe(403);

    const me = await request(app).get('/api/auth/me').set(bearer(admin.token));
    expect(me.body.user.can_sell).toBe(false);
    expect(me.body.user.can_buy).toBe(false);
    expect(me.body.user.is_admin).toBe(true);
  });

  it('admin market hide/unhide with reason log', async () => {
    const admin = await createAdmin();
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('กล้วยซ่อน', 4, 25);
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.63, 'แปลงซ่อน');
    const lotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const list = await request(app)
      .get('/api/admin/lots')
      .set(bearer(admin.token))
      .query({ status: 'active' });
    expect(list.status).toBe(200);
    expect(list.body.lots.some((l: { id: number }) => l.id === lotId)).toBe(true);

    const hide = await request(app)
      .post(`/api/admin/lots/${lotId}/hide`)
      .set(bearer(admin.token))
      .send({ reason: 'ข้อมูลผิด' });
    expect(hide.status).toBe(200);
    expect(hide.body.hidden).toBe(true);

    const [logs] = await pool.query(
      `SELECT reason FROM lot_delete_logs WHERE lot_id = ? ORDER BY id DESC LIMIT 1`,
      [lotId],
    );
    expect(String((logs as { reason: string }[])[0]?.reason ?? '')).toContain('admin_hide');

    const unhide = await request(app)
      .post(`/api/admin/lots/${lotId}/unhide`)
      .set(bearer(admin.token));
    expect(unhide.status).toBe(200);
    expect(unhide.body.hidden).toBe(false);
  });

  it('admin inbox returns combined queues and users list is read-only', async () => {
    const admin = await createAdmin();
    const inbox = await request(app)
      .get('/api/admin/inbox')
      .set(bearer(admin.token));
    expect(inbox.status).toBe(200);
    expect(inbox.body.counts).toHaveProperty('org');
    expect(inbox.body.counts).toHaveProperty('support');
    expect(inbox.body.counts).toHaveProperty('weight');
    expect(inbox.body.counts).toHaveProperty('otp');
    expect(inbox.body.counts).toHaveProperty('total');
    expect(Array.isArray(inbox.body.items)).toBe(true);

    const users = await request(app)
      .get('/api/admin/users')
      .set(bearer(admin.token))
      .query({ q: 'admin-test' });
    expect(users.status).toBe(200);
    expect(users.body.users.length).toBeGreaterThanOrEqual(1);
    const found = users.body.users.find((u: { name: string }) => u.name === 'admin-test');
    expect(found.is_admin).toBe(true);
    expect(found.can_sell).toBe(false);
    expect(found.can_buy).toBe(false);
  });

  describe('org applications list', () => {
    async function seedOrg(
      orgName: string,
      status: string,
      opts: { kind?: string | null; reviewedAt?: string | null; createdAt?: string } = {},
    ): Promise<number> {
      const user = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
      await pool.query(
        `INSERT INTO buyer_profiles (user_id, buyer_type, application_kind, org_name, org_type, org_status, org_reviewed_at, created_at)
         VALUES (?, 'shop', ?, ?, 'foundation', ?, ?, ?)
         ON DUPLICATE KEY UPDATE application_kind = VALUES(application_kind), org_name = VALUES(org_name),
           org_type = VALUES(org_type), org_status = VALUES(org_status),
           org_reviewed_at = VALUES(org_reviewed_at), created_at = VALUES(created_at)`,
        [
          user.user.id,
          opts.kind === undefined ? 'organization' : opts.kind,
          orgName,
          status,
          opts.reviewedAt ?? null,
          opts.createdAt ?? '2026-01-01 00:00:00',
        ],
      );
      return user.user.id;
    }

    it('requires admin', async () => {
      const farmer = await registerUser(app, { role: 'farmer' });
      const res = await request(app).get('/api/admin/org-applications').set(bearer(farmer.token));
      expect(res.status).toBe(403);
    });

    it('lists all non-draft org applications newest first and filters by status', async () => {
      const admin = await createAdmin();
      const oldest = await seedOrg('ListOrg เก่า', 'pending', { createdAt: '2026-01-01 00:00:00' });
      const approved = await seedOrg('ListOrg อนุมัติ', 'approved', {
        createdAt: '2026-02-01 00:00:00',
        reviewedAt: '2026-02-03 04:05:06',
      });
      const rejected = await seedOrg('ListOrg ปฏิเสธ', 'rejected', { createdAt: '2026-03-01 00:00:00' });
      await seedOrg('ListOrg ร่าง', 'draft');
      await seedOrg('ListOrg รายบุคคล', 'approved', { kind: 'individual' });
      const legacy = await seedOrg('ListOrg เดิม', 'approved', { kind: null, createdAt: '2025-12-01 00:00:00' });

      const all = await request(app)
        .get('/api/admin/org-applications')
        .set(bearer(admin.token))
        .query({ q: 'ListOrg' });
      expect(all.status).toBe(200);
      expect(all.body.total).toBe(4);
      expect(all.body.items.map((i: { user_id: number }) => i.user_id)).toEqual([rejected, approved, oldest, legacy]);
      const row = all.body.items.find((i: { user_id: number }) => i.user_id === approved);
      expect(row).toMatchObject({ org_name: 'ListOrg อนุมัติ', org_type: 'foundation', org_status: 'approved' });
      expect(row.decided_at).toBe('2026-02-03T04:05:06.000Z');

      const onlyApproved = await request(app)
        .get('/api/admin/org-applications')
        .set(bearer(admin.token))
        .query({ q: 'ListOrg', status: 'approved' });
      expect(onlyApproved.body.items.map((i: { user_id: number }) => i.user_id)).toEqual([approved, legacy]);
      expect(onlyApproved.body.total).toBe(2);

      const bad = await request(app)
        .get('/api/admin/org-applications')
        .set(bearer(admin.token))
        .query({ status: 'draft' });
      expect(bad.status).toBe(400);
    });

    it('paginates with limit/offset and reports the full total', async () => {
      const admin = await createAdmin();
      for (let i = 0; i < 3; i += 1) {
        await seedOrg(`PageOrg ${String(i)}`, 'approved', { createdAt: `2026-04-0${String(i + 1)} 00:00:00` });
      }
      const page1 = await request(app)
        .get('/api/admin/org-applications')
        .set(bearer(admin.token))
        .query({ q: 'PageOrg', limit: 2, offset: 0 });
      const page2 = await request(app)
        .get('/api/admin/org-applications')
        .set(bearer(admin.token))
        .query({ q: 'PageOrg', limit: 2, offset: 2 });
      expect(page1.body.total).toBe(3);
      expect(page1.body.items.map((i: { org_name: string }) => i.org_name)).toEqual(['PageOrg 2', 'PageOrg 1']);
      expect(page2.body.items.map((i: { org_name: string }) => i.org_name)).toEqual(['PageOrg 0']);
    });

    it('treats % and _ in the search as literals', async () => {
      const admin = await createAdmin();
      await seedOrg('Lit100%Org', 'approved');
      await seedOrg('LitXYZOrg', 'approved');
      const res = await request(app)
        .get('/api/admin/org-applications')
        .set(bearer(admin.token))
        .query({ q: 't100%' });
      expect(res.body.items.map((i: { org_name: string }) => i.org_name)).toEqual(['Lit100%Org']);
      const wild = await request(app).get('/api/admin/org-applications').set(bearer(admin.token)).query({ q: 'Lit%Org' });
      expect(wild.body.total).toBe(0);
    });

    it('detail endpoint returns a decided application and 404s for none/unknown', async () => {
      const admin = await createAdmin();
      const approved = await seedOrg('DetailOrg', 'approved', { reviewedAt: '2026-02-03 04:05:06' });
      const ok = await request(app)
        .get(`/api/donors/admin/org-applications/${String(approved)}`)
        .set(bearer(admin.token));
      expect(ok.status).toBe(200);
      expect(ok.body.application).toMatchObject({ user_id: approved, org_status: 'approved' });
      expect(ok.body.application.reviewed_at).toBe('2026-02-03T04:05:06.000Z');
      expect(ok.body.application.review_logs).toEqual([]);

      const missing = await request(app).get('/api/donors/admin/org-applications/999999').set(bearer(admin.token));
      expect(missing.status).toBe(404);
      const farmer = await registerUser(app, { role: 'farmer' });
      const denied = await request(app)
        .get(`/api/donors/admin/org-applications/${String(approved)}`)
        .set(bearer(farmer.token));
      expect(denied.status).toBe(403);
    });
  });
});
