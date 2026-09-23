import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { JWT_EXPIRES_IN } from '../../src/middleware/auth';
import { bearer, insertCrop, insertLot, insertPlot, loginStaff, registerUser, testApp } from '../helpers';

describe('auth', () => {
  const app = testApp();

  it('rejects staff registration, stores capabilities in JWT, and omits password_hash', async () => {
    const coordinator = await request(app).post('/api/auth/register').send({
      name: 'ผู้ประสานทดสอบ',
      phone: '0810000001',
      password: 'demo1234',
      can_sell: false,
      can_buy: false,
    });
    expect(coordinator.status).toBe(400);

    const driver = await request(app).post('/api/auth/register').send({
      name: 'คนขับทดสอบ',
      phone: '0810000002',
      password: 'demo1234',
      role: 'driver',
    });
    expect(driver.status).toBe(400);

    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE phone IN (?, ?)', [
      '0810000001',
      '0810000002',
    ]);
    expect(rows).toHaveLength(0);

    const farmer = await registerUser(app, { role: 'farmer', name: 'เกษตรกรทดสอบ' });
    expect(farmer.user).not.toHaveProperty('password_hash');
    expect(farmer.user.can_sell).toBe(true);
    expect(farmer.user.can_buy).toBe(false);
    expect(JSON.stringify(farmer)).not.toContain('password_hash');
    const decoded = jwt.decode(farmer.token) as {
      exp: number;
      iat: number;
      can_sell: boolean;
      can_buy: boolean;
      is_admin: boolean;
    };
    expect(decoded.can_sell).toBe(true);
    expect(decoded.can_buy).toBe(false);
    expect(decoded.is_admin).toBe(false);
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
    expect(JWT_EXPIRES_IN).toBe('7d');

    const [stored] = await pool.query<RowDataPacket[]>(
      'SELECT password_hash FROM users WHERE id = ?',
      [farmer.user.id],
    );
    const hash = String(stored[0]?.password_hash);
    expect(hash.startsWith('$2')).toBe(true);
    expect(JSON.stringify(farmer)).not.toContain(hash);

    const login = await request(app).post('/api/auth/login').send({
      phone: farmer.user.phone,
      password: 'demo1234',
    });
    expect(login.status).toBe(200);
    expect(login.body.user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(login.body)).not.toContain(hash);
    expect(JSON.stringify(login.body)).not.toContain('password_hash');

    const crops = await request(app).get('/api/crops');
    expect(crops.status).toBe(200);
    const authed = await request(app).get('/api/plots').set(bearer(farmer.token));
    expect(authed.status).toBe(200);
  });

  it('registers dual-role users, blocks booking own lots, and allows booking others', async () => {
    const seller = await registerUser(app, {
      can_sell: true,
      can_buy: true,
      buyer_type: 'shop',
      name: 'ขายและซื้อ',
    });
    expect(seller.user.can_sell).toBe(true);
    expect(seller.user.can_buy).toBe(true);
    expect(seller.user.buyer_type).toBe('shop');
    expect(seller.user.charity_approved).toBe(true);

    const cropId = await insertCrop();
    const plotId = await insertPlot(seller.user.id, 13.65, 100.62);
    const ownLot = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const ownBook = await request(app)
      .post('/api/orders')
      .set(bearer(seller.token))
      .send({ lot_id: ownLot, donation: false });
    expect(ownBook.status).toBe(403);
    expect(ownBook.body.error.code).toBe('FORBIDDEN');

    const other = await registerUser(app, { role: 'farmer', name: 'เกษตรกรอื่น' });
    const otherPlot = await insertPlot(other.user.id, 13.66, 100.63);
    const otherLot = await insertLot({
      plotId: otherPlot,
      cropId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const bookOther = await request(app)
      .post('/api/orders')
      .set(bearer(seller.token))
      .send({ lot_id: otherLot, donation: false });
    expect(bookOther.status).toBe(201);

    const enableBuy = await registerUser(app, { role: 'farmer', name: 'เปิดซื้อทีหลัง' });
    const patched = await request(app)
      .patch('/api/auth/profile')
      .set(bearer(enableBuy.token))
      .send({ can_buy: true, buyer_type: 'vendor' });
    expect(patched.status).toBe(200);
    expect(patched.body.user.can_buy).toBe(true);
    expect(patched.body.user.buyer_type).toBe('vendor');
    expect(patched.body.token).toBeTruthy();

    const charity = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'charity',
      name: 'สงเคราะห์รออนุมัติ',
    });
    expect(charity.user.charity_approved).toBe(false);
    const admin = await loginStaff(app, 'coordinator', 'แอดมิน');
    expect(admin.user.is_admin).toBe(true);

    const listed = await request(app).get('/api/auth/admin/charity-requests').set(bearer(admin.token));
    expect(listed.status).toBe(200);
    expect(listed.body.requests.some((row: { user_id: number }) => row.user_id === charity.user.id)).toBe(true);

    const farmer = await registerUser(app, { role: 'farmer', name: 'ไม่ใช่แอดมิน' });
    const forbiddenList = await request(app).get('/api/auth/admin/charity-requests').set(bearer(farmer.token));
    expect(forbiddenList.status).toBe(403);
    const forbiddenApprove = await request(app)
      .post(`/api/auth/admin/approve-charity/${charity.user.id}`)
      .set(bearer(farmer.token));
    expect(forbiddenApprove.status).toBe(403);
    const forbiddenReject = await request(app)
      .post(`/api/auth/admin/reject-charity/${charity.user.id}`)
      .set(bearer(farmer.token));
    expect(forbiddenReject.status).toBe(403);

    const pending = await registerUser(app, { role: 'buyer', buyer_type: 'charity', name: 'จะถูกปฏิเสธ' });
    const rejected = await request(app)
      .post(`/api/auth/admin/reject-charity/${pending.user.id}`)
      .set(bearer(admin.token));
    expect(rejected.status).toBe(200);
    expect(rejected.body.user.can_buy).toBe(false);
    expect(rejected.body.user.buyer_type).toBeNull();

    const approved = await request(app)
      .post(`/api/auth/admin/approve-charity/${charity.user.id}`)
      .set(bearer(admin.token));
    expect(approved.status).toBe(200);
    expect(approved.body.user.charity_approved).toBe(true);
  });
});
