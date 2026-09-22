import fs from 'fs';
import path from 'path';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { EXPIRE_INTERVAL_MS, expireOpenLots } from '../../src/jobs/expireLots';
import { insertCrop, insertLot, insertPlot, registerUser, testApp } from '../helpers';

describe('expire lots job', () => {
  const app = testApp();

  it('expires only open lots and is scheduled from server.ts', async () => {
    expect(EXPIRE_INTERVAL_MS).toBe(10 * 60 * 1000);
    const serverSource = fs.readFileSync(path.resolve(__dirname, '../../src/server.ts'), 'utf8');
    const appSource = fs.readFileSync(path.resolve(__dirname, '../../src/app.ts'), 'utf8');
    expect(serverSource).toContain('startExpireSchedule');
    expect(appSource).not.toContain('startExpireSchedule');

    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.62);
    const now = new Date('2026-09-22T12:00:00.000Z');
    const due = await insertLot({ plotId, cropId, expiresAt: now });
    const overdue = await insertLot({ plotId, cropId, expiresAt: new Date(now.getTime() - 1000) });
    const fresh = await insertLot({ plotId, cropId, expiresAt: new Date(now.getTime() + 60 * 60 * 1000) });
    const reserved = await insertLot({ plotId, cropId, expiresAt: new Date(now.getTime() - 60 * 60 * 1000) });
    await pool.query('UPDATE harvest_lots SET status = ? WHERE id = ?', ['reserved', reserved]);

    expect(await expireOpenLots(now)).toBe(2);
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id, status FROM harvest_lots ORDER BY id');
    const status = new Map(rows.map((row) => [Number(row.id), String(row.status)]));
    expect(status.get(due)).toBe('expired');
    expect(status.get(overdue)).toBe('expired');
    expect(status.get(fresh)).toBe('open');
    expect(status.get(reserved)).toBe('reserved');
  });
});