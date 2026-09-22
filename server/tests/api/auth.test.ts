import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { JWT_EXPIRES_IN } from '../../src/middleware/auth';
import { bearer, registerUser, testApp } from '../helpers';

describe('auth', () => {
  const app = testApp();

  it('rejects coordinator and driver registration with 403 and omits password_hash', async () => {
    const coordinator = await request(app).post('/api/auth/register').send({
      name: 'ผู้ประสานทดสอบ',
      phone: '0810000001',
      password: 'demo1234',
      role: 'coordinator',
    });
    expect(coordinator.status).toBe(403);
    expect(coordinator.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'สมัครได้เฉพาะเกษตรกรและผู้ซื้อ' },
    });

    const driver = await request(app).post('/api/auth/register').send({
      name: 'คนขับทดสอบ',
      phone: '0810000002',
      password: 'demo1234',
      role: 'driver',
    });
    expect(driver.status).toBe(403);

    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE phone IN (?, ?)', [
      '0810000001',
      '0810000002',
    ]);
    expect(rows).toHaveLength(0);

    const farmer = await registerUser(app, { role: 'farmer', name: 'เกษตรกรทดสอบ' });
    expect(farmer.user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(farmer)).not.toContain('password_hash');
    const decoded = jwt.decode(farmer.token) as { exp: number; iat: number; role: string };
    expect(decoded.role).toBe('farmer');
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
});
