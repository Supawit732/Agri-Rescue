import fs from 'fs';
import path from 'path';
import request from 'supertest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { crops, SEED_CROP_PHOTOS } from '../../src/db/seedData';
import { seed } from '../../src/db/seed';
import { seedDemo } from '../../src/db/seedDemo';
import { testApp } from '../helpers';

const SEED_PHOTOS_DIR = path.resolve(__dirname, '../../assets/seed-photos');
/** seed:demo spreads its history over the first 14 catalog crops. */
const DEMO_CROP_COUNT = 14;
const DEMO_LOT_COUNT = 14 + 1 + 4; // delivered history + live lot + route lots

describe('seed crop photos', () => {
  const app = testApp();

  async function lotsWithoutPhoto(where: string): Promise<RowDataPacket[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT hl.id, c.name_th FROM harvest_lots hl JOIN crops c ON c.id = hl.crop_id
       WHERE ${where} AND (hl.photo_url IS NULL OR hl.photo_url = '' OR hl.photo_url = 'seed:demo')`,
    );
    return rows;
  }

  /** Every distinct photo_url of the matching lots must be served by the app as a JPEG. */
  async function expectPhotosServed(where: string): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT hl.photo_url FROM harvest_lots hl WHERE ${where}`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const res = await request(app).get(String(row.photo_url)).expect(200);
      expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    }
    return rows.length;
  }

  async function count(sql: string): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(sql);
    return Number(rows[0]?.n);
  }

  it('has a committed, credited JPEG under 150 KB for every mapped crop', () => {
    const credits = fs.readFileSync(path.join(SEED_PHOTOS_DIR, 'CREDITS.md'), 'utf8');
    for (const crop of crops.slice(0, DEMO_CROP_COUNT)) {
      expect(Object.keys(SEED_CROP_PHOTOS)).toContain(crop.key);
    }
    for (const url of Object.values(SEED_CROP_PHOTOS)) {
      const file = path.basename(url ?? '');
      const full = path.join(SEED_PHOTOS_DIR, file);
      expect(url).toBe(`/uploads/seed/${file}`);
      expect(fs.statSync(full).size).toBeLessThan(150_000);
      expect(fs.readFileSync(full).subarray(0, 2).toString('hex')).toBe('ffd8');
      expect(credits).toContain(`\`${file}\``);
    }
  });

  it('gives every seeded lot a photo the server serves (HTTP 200)', async () => {
    await seed();
    expect(await lotsWithoutPhoto('1=1')).toEqual([]);
    await expectPhotosServed('1=1');
  });

  it('gives every seed:demo lot its crop photo without lot_photos, and re-runs cleanly', async () => {
    await seed();
    // A leftover from an older seed:demo (marker in photo_url) must still be cleaned up.
    const [plot] = await pool.query<RowDataPacket[]>('SELECT id FROM plots LIMIT 1');
    const [crop] = await pool.query<RowDataPacket[]>('SELECT id FROM crops LIMIT 1');
    const [legacy] = await pool.query<ResultSetHeader>(
      `INSERT INTO harvest_lots (plot_id, crop_id, weight_kg, grade, ripeness, photo_url, allow_donation,
         donation_audience, start_price_per_kg, floor_price_per_kg, sale_mode, donation_opened,
         predicted_shelf_hours, expires_at, status)
       VALUES (?, ?, 5, 'normal', 2, 'seed:demo', 0, 'verified_org_only', 10, 3, 'sell', 0, 48,
         DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY), 'open')`,
      [plot[0]!.id, crop[0]!.id],
    );
    const baseLots = await count(`SELECT COUNT(*) AS n FROM harvest_lots WHERE seed_tag IS NULL`);

    await seedDemo();
    expect(await count(`SELECT COUNT(*) AS n FROM harvest_lots WHERE seed_tag = 'seed:demo'`)).toBe(
      DEMO_LOT_COUNT,
    );
    expect(await lotsWithoutPhoto(`hl.seed_tag = 'seed:demo'`)).toEqual([]);
    expect(await expectPhotosServed(`hl.seed_tag = 'seed:demo'`)).toBe(DEMO_CROP_COUNT);
    expect(await count(`SELECT COUNT(*) AS n FROM harvest_lots WHERE id = ${legacy.insertId}`)).toBe(0);
    // seed:demo must leave the base seed's lots alone (only the injected legacy row is gone).
    expect(await count(`SELECT COUNT(*) AS n FROM harvest_lots WHERE seed_tag IS NULL`)).toBe(baseLots - 1);

    // Demo lots carry their photo in photo_url only, and a second run leaves no lot_photos behind.
    const photoRows = await count('SELECT COUNT(*) AS n FROM lot_photos');
    await seedDemo();
    expect(await count(`SELECT COUNT(*) AS n FROM harvest_lots WHERE seed_tag = 'seed:demo'`)).toBe(
      DEMO_LOT_COUNT,
    );
    expect(await count('SELECT COUNT(*) AS n FROM lot_photos')).toBe(photoRows);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM lot_photos lp JOIN harvest_lots hl ON hl.id = lp.lot_id
         WHERE hl.seed_tag = 'seed:demo'`,
      ),
    ).toBe(0);
  });

  it('shows the crop photo for a demo lot on the public lot detail', async () => {
    await seedDemo();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT hl.id, c.name_th FROM harvest_lots hl JOIN crops c ON c.id = hl.crop_id
       WHERE hl.seed_tag = 'seed:demo' AND hl.status = 'partially_reserved' ORDER BY hl.id LIMIT 1`,
    );
    const lot = rows[0]!;
    const crop = crops.find((c) => c.nameTh === lot.name_th)!;
    const res = await request(app).get(`/api/public/lots/${String(lot.id)}`).expect(200);
    const expected = SEED_CROP_PHOTOS[crop.key];
    expect(res.body.lot.photos[0]).toBe(expected);
    await request(app).get(res.body.lot.photos[0]).expect(200);
  });
});
