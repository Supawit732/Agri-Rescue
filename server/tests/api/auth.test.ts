import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { JWT_EXPIRES_IN } from '../../src/middleware/auth';
import { bearer, insertCrop, insertLot, insertPlot, loginStaff, registerUser, testApp, pickAvailablePickupSlot } from '../helpers';

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

  it('register without phone returns 400 with fields.phone', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'ไม่มีเบอร์',
      password: 'demo1234',
      can_sell: true,
      can_buy: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.fields).toBeDefined();
    expect(res.body.error.fields.phone).toBeTruthy();

    const emptyPhone = await request(app).post('/api/auth/register').send({
      name: 'เบอร์ว่าง',
      phone: '',
      password: 'demo1234',
      can_sell: true,
      can_buy: false,
    });
    expect(emptyPhone.status).toBe(400);
    expect(emptyPhone.body.error.fields.phone).toBeTruthy();

    // dashed phone still accepted
    const dashed = await request(app).post('/api/auth/register').send({
      name: 'มีขีด',
      phone: '081-000-0003',
      password: 'demo1234',
      can_sell: true,
      can_buy: false,
    });
    expect(dashed.status).toBe(201);
    expect(dashed.body.user.phone).toBe('0810000003');
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
      .send({ lot_id: ownLot, donation: false, quantity_kg: 10, ...pickAvailablePickupSlot() });
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
      .send({ lot_id: otherLot, donation: false, quantity_kg: 10, ...pickAvailablePickupSlot() });
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
    const approved = await request(app)
      .post(`/api/auth/admin/approve-charity/${charity.user.id}`)
      .set(bearer(admin.token));
    expect(approved.status).toBe(200);
    expect(approved.body.user.charity_approved).toBe(true);
  });

  it('saves pickup lat/lng with reverse-geocode labels and syncs seller plots', async () => {
    const { resetNominatimState } = await import('../../src/geo/nominatim');
    resetNominatimState();
    const farmer = await registerUser(app, { role: 'farmer', name: 'บันทึกตำแหน่ง' });
    await insertPlot(farmer.user.id, 13.65, 100.62, 'แปลงเก่า');

    const patched = await request(app)
      .patch('/api/auth/profile')
      .set(bearer(farmer.token))
      .send({ lat: 13.72, lng: 100.56 });
    expect(patched.status).toBe(200);
    expect(patched.body.user.lat).toBeCloseTo(13.72, 5);
    expect(patched.body.user.lng).toBeCloseTo(100.56, 5);
    expect(patched.body.user.subdistrict_th).toBe('คลองเตย');
    expect(patched.body.user.district_th).toBe('คลองเตย');

    const [users] = await pool.query<RowDataPacket[]>(
      'SELECT lat, lng, subdistrict_th, district_th FROM users WHERE id = ?',
      [farmer.user.id],
    );
    expect(Number(users[0]?.lat)).toBeCloseTo(13.72, 5);
    expect(users[0]?.subdistrict_th).toBe('คลองเตย');

    const [plots] = await pool.query<RowDataPacket[]>(
      'SELECT lat, lng, subdistrict_th, district_th FROM plots WHERE farmer_id = ?',
      [farmer.user.id],
    );
    expect(plots).toHaveLength(1);
    expect(Number(plots[0]?.lat)).toBeCloseTo(13.72, 5);
    expect(plots[0]?.subdistrict_th).toBe('คลองเตย');
    expect(plots[0]?.district_th).toBe('คลองเตย');
  });

  it('rejects profile patch with only lat or only lng', async () => {
    const buyer = await registerUser(app, { role: 'buyer' });
    const onlyLat = await request(app)
      .patch('/api/auth/profile')
      .set(bearer(buyer.token))
      .send({ lat: 13.7 });
    expect(onlyLat.status).toBe(400);
    expect(onlyLat.body.error.fields?.lat ?? onlyLat.body.error.message).toBeTruthy();
  });
});
