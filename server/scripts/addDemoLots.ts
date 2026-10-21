/**
 * Adds extra open lots to the market for a demo. Safe to re-run (removes lots it added before).
 * Run: npx tsx scripts/addDemoLots.ts   (after npm run seed / seed:reset)
 */
import type { RowDataPacket } from 'mysql2';
import { pool } from '../src/db/pool';
import { crops, farmers, SEED_CROP_PHOTOS, type CropKey } from '../src/db/seedData';
import { upsertLot } from '../src/db/seed';

const TAG = 'Harvested today, ready for pickup';

const LOTS: Array<{ farmer: number; crop: CropKey; kg: number; grade: 'normal' | 'substandard'; ripeness: number; hours: number; donate: boolean }> = [
  { farmer: 0, crop: 'lime', kg: 25, grade: 'normal', ripeness: 3, hours: 120, donate: false },
  { farmer: 0, crop: 'durian', kg: 15, grade: 'substandard', ripeness: 4, hours: 96, donate: false },
  { farmer: 0, crop: 'pineapple', kg: 30, grade: 'normal', ripeness: 4, hours: 144, donate: true },
  { farmer: 0, crop: 'chinese-kale', kg: 18, grade: 'normal', ripeness: 3, hours: 100, donate: true },
  { farmer: 1, crop: 'pomelo', kg: 35, grade: 'normal', ripeness: 3, hours: 168, donate: false },
  { farmer: 1, crop: 'longan', kg: 22, grade: 'substandard', ripeness: 4, hours: 110, donate: true },
  { farmer: 1, crop: 'guava', kg: 28, grade: 'normal', ripeness: 3, hours: 150, donate: false },
  { farmer: 1, crop: 'napa-cabbage', kg: 20, grade: 'substandard', ripeness: 4, hours: 104, donate: true },
  { farmer: 2, crop: 'rambutan', kg: 24, grade: 'normal', ripeness: 4, hours: 130, donate: false },
  { farmer: 2, crop: 'custard-apple', kg: 12, grade: 'normal', ripeness: 4, hours: 115, donate: false },
  { farmer: 2, crop: 'mango', kg: 45, grade: 'substandard', ripeness: 4, hours: 96, donate: true },
  { farmer: 2, crop: 'tomato', kg: 30, grade: 'normal', ripeness: 3, hours: 160, donate: false },
];

async function main(): Promise<void> {
  const connection = await pool.getConnection();
  const now = new Date();
  try {
    await connection.beginTransaction();
    await connection.query(
      `DELETE FROM harvest_lots WHERE description = ? AND id NOT IN (SELECT lot_id FROM orders)`,
      [TAG],
    );
    let added = 0;
    for (const item of LOTS) {
      const farmer = farmers[item.farmer]!;
      const [plots] = await connection.query<RowDataPacket[]>(
        `SELECT p.id FROM plots p JOIN users u ON u.id = p.farmer_id WHERE u.phone = ? AND p.name = ?`,
        [farmer.phone, farmer.plotName],
      );
      const crop = crops.find((c) => c.key === item.crop)!;
      const [cropRows] = await connection.query<RowDataPacket[]>('SELECT id FROM crops WHERE name_th = ?', [crop.nameTh]);
      if (!plots[0] || !cropRows[0]) {
        console.warn(`skip ${item.crop}: run npm run seed first`);
        continue;
      }
      await upsertLot(connection, {
        plotId: Number(plots[0].id),
        cropId: Number(cropRows[0].id),
        weightKg: item.kg,
        grade: item.grade,
        ripeness: item.ripeness,
        allowDonation: item.donate,
        shelfHours: item.hours,
        description: TAG,
        photoUrl: SEED_CROP_PHOTOS[item.crop] ?? null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + item.hours * 3600 * 1000),
      });
      added += 1;
    }
    await connection.commit();
    console.log(`addDemoLots ok lots=${added}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
