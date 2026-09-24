import request from 'supertest';
import { pool } from '../../src/db/pool';
import { resetSupportCreateRateLimit } from '../../src/middleware/supportRateLimit';
import { registerUser, testApp, bearer, nextPhone } from '../helpers';
import bcrypt from 'bcryptjs';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
).toString('base64');

describe('support tickets', () => {
  const app = testApp();

  beforeEach(async () => {
    await resetSupportCreateRateLimit();
    await pool.query('DELETE FROM support_attachments');
    await pool.query('DELETE FROM support_messages');
    await pool.query('DELETE FROM support_tickets');
    await pool.query('DELETE FROM notifications');
  });

  it('user creates ticket and only sees own tickets', async () => {
    const alice = await registerUser(app, { role: 'buyer', name: 'Alice' });
    const bob = await registerUser(app, { role: 'buyer', name: 'Bob' });

    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(alice.token))
      .send({
        topic: 'item_mismatch',
        details: 'ของไม่ตรงตามรูป ยังไม่ได้ให้ OTP',
        reply_via: 'app',
      });
    expect(created.status).toBe(201);
    expect(created.body.ticket.status).toBe('open');
    expect(created.body.ticket.topic).toBe('item_mismatch');

    const aliceList = await request(app)
      .get('/api/support')
      .set(bearer(alice.token));
    expect(aliceList.status).toBe(200);
    expect(aliceList.body.tickets).toHaveLength(1);

    const bobList = await request(app)
      .get('/api/support')
      .set(bearer(bob.token));
    expect(bobList.status).toBe(200);
    expect(bobList.body.tickets).toHaveLength(0);

    const bobOpen = await request(app)
      .get(`/api/support/tickets/${created.body.ticket.id}`)
      .set(bearer(bob.token));
    expect(bobOpen.status).toBe(403);
  });

  it('attachments are private — other users cannot download', async () => {
    const alice = await registerUser(app, { role: 'buyer', name: 'Alice' });
    const bob = await registerUser(app, { role: 'buyer', name: 'Bob' });
    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(alice.token))
      .send({
        topic: 'other',
        details: 'มีรูปแนบ',
        reply_via: 'app',
        attachments: [
          {
            filename: 'proof.png',
            mime: 'image/png',
            base64: tinyPng,
            original_name: 'proof.png',
          },
        ],
      });
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/support/tickets/${created.body.ticket.id}`)
      .set(bearer(alice.token));
    expect(detail.status).toBe(200);
    const attachmentId = detail.body.messages[0].attachments[0].id;
    expect(attachmentId).toBeDefined();

    const aliceFile = await request(app)
      .get(`/api/support/tickets/${created.body.ticket.id}/attachments/${attachmentId}`)
      .set(bearer(alice.token));
    expect(aliceFile.status).toBe(200);

    const bobFile = await request(app)
      .get(`/api/support/tickets/${created.body.ticket.id}/attachments/${attachmentId}`)
      .set(bearer(bob.token));
    expect(bobFile.status).toBe(403);

    const guestFile = await request(app).get(
      `/api/support/tickets/${created.body.ticket.id}/attachments/${attachmentId}`,
    );
    expect(guestFile.status).toBe(401);
  });

  it('admin reply notifies user and can change status', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'ผู้ขาย' });
    // coordinator with is_admin from seed path — create via staff helper style
    const phone = nextPhone();
    const passwordHash = await bcrypt.hash('demo1234', 10);
    await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, can_sell, can_buy, is_admin, lat, lng)
       VALUES (?, ?, ?, 'coordinator', 0, 1, 1, NULL, NULL)`,
      ['admin-support', phone, passwordHash],
    );
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone, password: 'demo1234' });
    expect(adminLogin.status).toBe(200);
    const admin = adminLogin.body as { token: string };

    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(farmer.token))
      .send({ topic: 'order_pickup', details: 'ผู้ขายไม่อยู่แปลง', reply_via: 'app' });
    const ticketId = created.body.ticket.id as number;

    const reply = await request(app)
      .post(`/api/support/tickets/${ticketId}/messages`)
      .set(bearer(admin.token))
      .send({ body: 'กำลังติดต่อผู้ขายครับ' });
    expect(reply.status).toBe(201);
    expect(reply.body.message.sender_role).toBe('admin');

    const notifs = await request(app)
      .get('/api/notifications')
      .set(bearer(farmer.token));
    expect(notifs.body.unread_count).toBeGreaterThan(0);
    const supportNotif = notifs.body.notifications.find(
      (n: { type: string }) => n.type === 'support_reply',
    );
    expect(supportNotif).toBeDefined();
    expect(supportNotif.title_key).toBe('notif.support_reply');
    expect(supportNotif.link).toBe(`/support/${ticketId}`);

    const patched = await request(app)
      .patch(`/api/support/tickets/${ticketId}`)
      .set(bearer(admin.token))
      .send({ status: 'in_progress' });
    expect(patched.status).toBe(200);
    expect(patched.body.ticket.status).toBe('in_progress');

    const closed = await request(app)
      .patch(`/api/support/tickets/${ticketId}`)
      .set(bearer(admin.token))
      .send({ status: 'closed' });
    expect(closed.body.ticket.status).toBe('closed');

    // user cannot change status
    const userPatch = await request(app)
      .patch(`/api/support/tickets/${ticketId}`)
      .set(bearer(farmer.token))
      .send({ status: 'closed' });
    expect(userPatch.status).toBe(403);
  });

  it('rate limits ticket creation at 5 per hour', async () => {
    const buyer = await registerUser(app, { role: 'buyer' });
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/api/support/tickets')
        .set(bearer(buyer.token))
        .send({ topic: 'other', details: `เรื่อง ${i}`, reply_via: 'app' });
      expect(res.status).toBe(201);
    }
    const sixth = await request(app)
      .post('/api/support/tickets')
      .set(bearer(buyer.token))
      .send({ topic: 'other', details: 'เกิน', reply_via: 'app' });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('RATE_LIMIT');
  });

  it('rejects empty details and too long body', async () => {
    const buyer = await registerUser(app, { role: 'buyer' });
    const empty = await request(app)
      .post('/api/support/tickets')
      .set(bearer(buyer.token))
      .send({ topic: 'other', details: '   ', reply_via: 'app' });
    expect(empty.status).toBe(400);

    const long = await request(app)
      .post('/api/support/tickets')
      .set(bearer(buyer.token))
      .send({ topic: 'other', details: 'x'.repeat(1001), reply_via: 'app' });
    expect(long.status).toBe(400);
  });
});
