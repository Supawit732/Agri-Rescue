import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { DEMO_PENDING_ORG, seedDemo } from '../../src/db/seedDemo';
import { bearer, testApp } from '../helpers';

describe('seed:demo pending org application', () => {
  const app = testApp();

  async function demoUserId(): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE phone = ?', [
      DEMO_PENDING_ORG.phone,
    ]);
    return Number(rows[0]?.id);
  }

  it('leaves exactly one pending application after running twice, even after an admin decision', async () => {
    await seedDemo();
    const userId = await demoUserId();
    expect(userId).toBeGreaterThan(0);

    // Simulate a rehearsal: admin approved, leaving review + audit history behind.
    // Seeded demo admin (helper-made phones normalise onto the seeded 08000000xx numbers).
    const login = await request(app)
      .post('/api/auth/login')
      .send({ phone: '0800000005', password: 'demo1234' })
      .expect(200);
    const admin = { token: login.body.token as string };
    await request(app)
      .post(`/api/donors/admin/org-applications/${userId}/approve`)
      .set(bearer(admin.token))
      .expect(200);
    const [approved] = await pool.query<RowDataPacket[]>(
      'SELECT org_status FROM buyer_profiles WHERE user_id = ?',
      [userId],
    );
    expect(approved[0]?.org_status).toBe('approved');

    await seedDemo({ skipBaseSeed: true });

    const [apps] = await pool.query<RowDataPacket[]>(
      `SELECT org_status, charity_approved, donor_tier, application_kind
       FROM buyer_profiles WHERE user_id = ?`,
      [userId],
    );
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      org_status: 'pending',
      charity_approved: 0,
      donor_tier: null,
      application_kind: 'organization',
    });
    const [logs] = await pool.query<RowDataPacket[]>('SELECT id FROM org_review_logs WHERE user_id = ?', [userId]);
    expect(logs).toHaveLength(0);
    const [audit] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM admin_audit_log WHERE target_type = 'org' AND target_id = ?`,
      [String(userId)],
    );
    expect(audit).toHaveLength(0);
    const [docs] = await pool.query<RowDataPacket[]>('SELECT id FROM org_application_docs WHERE user_id = ?', [userId]);
    expect(docs).toHaveLength(2);

    const [users] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE phone = ?', [DEMO_PENDING_ORG.phone]);
    expect(users).toHaveLength(1);

    // Visible to the admin Inbox queue and the Org list.
    const queue = await request(app).get('/api/donors/admin/org-applications').set(bearer(admin.token)).expect(200);
    const mine = (queue.body.applications as Array<{ user_id: number }>).filter((a) => a.user_id === userId);
    expect(mine).toHaveLength(1);
    const list = await request(app)
      .get('/api/admin/org-applications?status=pending')
      .set(bearer(admin.token))
      .expect(200);
    expect((list.body.items as Array<{ user_id: number }>).filter((i) => i.user_id === userId)).toHaveLength(1);
  });
});
