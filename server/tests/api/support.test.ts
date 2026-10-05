import request from 'supertest';
import { pool } from '../../src/db/pool';
import { resetSupportCreateRateLimit } from '../../src/middleware/supportRateLimit';
import {
  registerUser,
  testApp,
  bearer,
  nextPhone,
  insertCrop,
  insertLot,
  insertPlot,
  pickAvailablePickupSlot,
} from '../helpers';
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

  /** Books a lot as `buyer` and returns the order id (support tickets can reference it). */
  async function bookOrder(buyerToken: string): Promise<number> {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61);
    const lotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const res = await request(app)
      .post('/api/orders')
      .set(bearer(buyerToken))
      .send({ lot_id: lotId, donation: false, quantity_kg: 5, ...pickAvailablePickupSlot() });
    expect(res.status).toBe(201);
    return res.body.order.id as number;
  }

  it('user creates ticket and only sees own tickets', async () => {
    const alice = await registerUser(app, { role: 'buyer', name: 'Alice', buyer_type: 'shop' });
    const bob = await registerUser(app, { role: 'buyer', name: 'Bob' });
    const aliceOrderId = await bookOrder(alice.token);

    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(alice.token))
      .send({
        topic: 'item_mismatch',
        order_id: aliceOrderId,
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
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const buyerOrderId = await bookOrder(buyer.token);
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
      .set(bearer(buyer.token))
      .send({ topic: 'order_pickup', order_id: buyerOrderId, details: 'ผู้ขายไม่อยู่แปลง', reply_via: 'app' });
    const ticketId = created.body.ticket.id as number;

    const reply = await request(app)
      .post(`/api/support/tickets/${ticketId}/messages`)
      .set(bearer(admin.token))
      .send({ body: 'กำลังติดต่อผู้ขายครับ' });
    expect(reply.status).toBe(201);
    expect(reply.body.message.sender_role).toBe('admin');

    const notifs = await request(app)
      .get('/api/notifications')
      .set(bearer(buyer.token));
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
      .set(bearer(buyer.token))
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

  describe('topic-dependent related order', () => {
    const post = (token: string, body: Record<string, unknown>) =>
      request(app)
        .post('/api/support/tickets')
        .set(bearer(token))
        .send({ details: 'รายละเอียด', reply_via: 'app', ...body });

    it.each(['order_pickup', 'item_mismatch', 'weight_mismatch'])(
      'requires a related order for %s',
      async (topic) => {
        const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
        const missing = await post(buyer.token, { topic });
        expect(missing.status).toBe(400);
        expect(missing.body.error.fields.order_id).toBeDefined();
        const nulled = await post(buyer.token, { topic, order_id: null });
        expect(nulled.status).toBe(400);

        const orderId = await bookOrder(buyer.token);
        const ok = await post(buyer.token, { topic, order_id: orderId });
        expect(ok.status).toBe(201);
        expect(ok.body.ticket.order_id).toBe(orderId);
      },
    );

    it.each(['payment', 'donation', 'other'])('keeps the order optional for %s', async (topic) => {
      const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
      const without = await post(buyer.token, { topic });
      expect(without.status).toBe(201);
      expect(without.body.ticket.order_id).toBeNull();
      const orderId = await bookOrder(buyer.token);
      const withOrder = await post(buyer.token, { topic, order_id: orderId });
      expect(withOrder.status).toBe(201);
      expect(withOrder.body.ticket.order_id).toBe(orderId);
    });

    it('drops any order id on account_login tickets', async () => {
      const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
      const orderId = await bookOrder(buyer.token);
      const res = await post(buyer.token, { topic: 'account_login', order_id: orderId });
      expect(res.status).toBe(201);
      expect(res.body.ticket.order_id).toBeNull();
    });

    it('never requires photos, and still rejects a foreign order', async () => {
      const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
      const other = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
      const foreign = await bookOrder(other.token);
      const stolen = await post(buyer.token, { topic: 'weight_mismatch', order_id: foreign });
      expect(stolen.status).toBe(400);
      const orderId = await bookOrder(buyer.token);
      const noPhotos = await post(buyer.token, {
        topic: 'weight_mismatch',
        order_id: orderId,
        attachments: [],
      });
      expect(noPhotos.status).toBe(201);
    });
  });
});
