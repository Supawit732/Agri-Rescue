import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../src/db/pool';
import { crops, SEED_CROP_PHOTOS } from '../src/db/seedData';

/**
 * Set harvest_lots.photo_url for existing lots of the crops in SEED_CROP_PHOTOS
 * (see seedData.ts), without touching anything else: no other lot, no
 * photo_url that's already set, no user/plot/order/payment/pricing data. Safe to re-run —
 * only fills rows currently NULL. Use this on a deployment with real data you don't want
 * `npm run seed` or `npm run seed:reset` anywhere near.
 */
async function main(): Promise<void> {
  let updated = 0;
  for (const [key, url] of Object.entries(SEED_CROP_PHOTOS)) {
    const crop = crops.find((item) => item.key === key);
    if (crop === undefined) {
      continue;
    }
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE harvest_lots hl
       JOIN crops c ON c.id = hl.crop_id
       SET hl.photo_url = ?
       WHERE c.name_th = ? AND hl.photo_url IS NULL`,
      [url, crop.nameTh],
    );
    console.log(`${key} (${crop.nameTh}): ${result.affectedRows} lot(s) updated`);
    updated += result.affectedRows;
  }
  const [[remaining]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM harvest_lots WHERE photo_url IS NULL`,
  );
  console.log(`total updated: ${updated}`);
  console.log(`lots still without a photo (other crops, or real uploads pending): ${String(remaining?.n ?? 0)}`);
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
