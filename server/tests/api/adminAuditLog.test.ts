import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { bearer, insertCrop, insertLot, insertPlot, nextPhone, registerUser, testApp } from '../helpers';

async function createAdmin(name: string): Promise<{ token: string; id: number }> {
  const phone = nextPhone();
  await pool.query(
    `INSERT INTO users (name, phone, password_hash, role, can_sell, can_buy, is_admin)
     VALUES (?, ?, ?, 'coordinator', 0, 0, 1)`,
    [name, phone, await bcrypt.hash('demo1234', 10)],
  );
  const login = await request(testApp()).post('/api/auth/login').send({ phone, password: 'demo1234' });
  return { token: login.body.token as string, id: login.body.user.id as number };
}

async function rows(): Promise<RowDataPacket[]> {
  const [r] = await pool.query<RowDataPacket[]>('SELECT * FROM admin_audit_log ORDER BY id');
  return r;
}

describe('admin audit log', () => {
  const app = testApp();

  beforeEach(async () => {
    await pool.query('DELETE FROM admin_audit_log');
  });

  it('logs lot hide/unhide with reason and target', async () => {
    const admin = await createAdmin('audit-admin');
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('มะม่วงAudit', 5, 40, 'Mango Audit');
    const plotId = await insertPlot(farmer.user.id, 13.65, 100.62);
    const lotId = await insertLot({ plotId, cropId, expiresAt: new Date(Date.now() + 86_400_000) });

    await request(app).post(`/api/admin/lots/${lotId}/hide`).set(bearer(admin.token)).send({ reason: 'spam' }).expect(200);
    await request(app).post(`/api/admin/lots/${lotId}/unhide`).set(bearer(admin.token)).expect(200);

    const log = await rows();
    expect(log.map((r) => r.action)).toEqual(['lot.hide', 'lot.unhide']);
    expect(log[0]).toMatchObject({ admin_id: admin.id, target_type: 'lot', target_id: String(lotId) });
    expect(log[0]!.metadata_json).toEqual({ reason: 'spam' });
  });

  it('logs support reply and status change but not user replies or reads', async () => {
    const admin = await createAdmin('audit-admin');
    const user = await registerUser(app, { role: 'buyer' });
    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(user.token))
      .send({ topic: 'other', details: 'ช่วยด้วย' });
    expect(created.status).toBe(201);
    const ticketId = created.body.ticket.id as number;
    await request(app).post(`/api/support/tickets/${ticketId}/messages`).set(bearer(user.token)).send({ body: 'ครับ' }).expect(201);
    expect(await rows()).toHaveLength(0);

    await request(app).post(`/api/support/tickets/${ticketId}/messages`).set(bearer(admin.token)).send({ body: 'รับเรื่องแล้ว' }).expect(201);
    await request(app).patch(`/api/support/tickets/${ticketId}`).set(bearer(admin.token)).send({ status: 'closed' }).expect(200);
    await request(app).get(`/api/support/tickets/${ticketId}`).set(bearer(admin.token)).expect(200);

    const log = await rows();
    expect(log.map((r) => r.action)).toEqual(['support.reply', 'support.close']);
    expect(log[0]).toMatchObject({ target_type: 'support_ticket', target_id: String(ticketId) });
  });

  it('logs org approval with org name; failed mutations are not logged', async () => {
    const admin = await createAdmin('audit-admin');
    await request(app).post('/api/donors/admin/org-applications/999999/approve').set(bearer(admin.token)).expect(404);
    expect(await rows()).toHaveLength(0);

    const buyer = await registerUser(app, { role: 'buyer' });
    await pool.query(
      `INSERT INTO buyer_profiles (user_id, org_status, application_kind, org_name) VALUES (?, 'pending', 'organization', 'มูลนิธิทดสอบ')
       ON DUPLICATE KEY UPDATE org_status = 'pending', application_kind = 'organization', org_name = 'มูลนิธิทดสอบ'`,
      [buyer.user.id],
    );
    await request(app).post(`/api/donors/admin/org-applications/${buyer.user.id}/approve`).set(bearer(admin.token)).expect(200);
    const log = await rows();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'org.approve', target_type: 'org', target_id: String(buyer.user.id) });
    expect(log[0]!.metadata_json.target_label).toBe('มูลนิธิทดสอบ');
  });

  it('falls back to a generic row for unregistered admin mutations', async () => {
    const admin = await createAdmin('audit-admin');
    await request(app).post('/api/support/tickets').set(bearer(admin.token)).send({ topic: 'other', details: 'admin ticket' }).expect(201);
    const log = await rows();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'other.post', admin_id: admin.id });
    expect(log[0]!.summary).toBe('POST /api/support/tickets');
  });

  it('GET /audit-log filters by type, admin and date, newest first, paginated; admin only', async () => {
    const a1 = await createAdmin('first-admin');
    const a2 = await createAdmin('second-admin');
    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, summary, created_at) VALUES
       (?, 'org.approve', 'org', '5', 's1', '2026-01-01 10:00:00'),
       (?, 'lot.hide', 'lot', '7', 's2', '2026-01-02 10:00:00'),
       (?, 'other.post', NULL, NULL, 's3', '2026-01-03 10:00:00')`,
      [a1.id, a2.id, a1.id],
    );
    const get = (qs: string) => request(app).get(`/api/admin/audit-log?${qs}`).set(bearer(a1.token));

    const all = await get('');
    expect(all.body.total).toBe(3);
    expect(all.body.items.map((i: { action: string }) => i.action)).toEqual(['other.post', 'lot.hide', 'org.approve']);
    expect(all.body.items[1].admin_name).toBe('second-admin');

    expect((await get('type=org')).body.items).toHaveLength(1);
    expect((await get('type=other')).body.items.map((i: { action: string }) => i.action)).toEqual(['other.post']);
    expect((await get(`admin_id=${a2.id}`)).body.total).toBe(1);
    expect((await get('from=2026-01-02T00:00:00Z&to=2026-01-02T23:59:59Z')).body.total).toBe(1);
    const page = await get('limit=1&offset=1');
    expect(page.body.total).toBe(3);
    expect(page.body.items[0].action).toBe('lot.hide');

    const farmer = await registerUser(app, { role: 'farmer' });
    await request(app).get('/api/admin/audit-log').set(bearer(farmer.token)).expect(403);
  });
});
