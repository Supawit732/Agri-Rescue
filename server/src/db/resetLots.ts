import type { RowDataPacket } from 'mysql2';
import { pool } from './pool';
import { crops, farmers } from './seedData';

export async function resetDemoLots(now: Date = new Date()): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM impact_logs');
    await connection.query('DELETE FROM route_stops');
    await connection.query('DELETE FROM orders');
    await connection.query('DELETE FROM batches');
    await connection.query('DELETE FROM quality_assessments');
    await connection.query('DELETE FROM harvest_lots');

    let inserted = 0;
    for (const farmer of farmers) {
      const [userRows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM users WHERE phone = ? AND role = ?',
        [farmer.phone, 'farmer'],
      );
      const user = userRows[0];
      if (user === undefined) {
        throw new Error(`Run npm run seed before seed:reset. Missing farmer ${farmer.name}`);
      }
      const [plotRows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM plots WHERE farmer_id = ? AND name = ?',
        [user.id, farmer.plotName],
      );
      const plot = plotRows[0];
      if (plot === undefined) {
        throw new Error(`Run npm run seed before seed:reset. Missing plot ${farmer.plotName}`);
      }
      const crop = crops.find((item) => item.key === farmer.lot.cropKey);
      if (crop === undefined) {
        throw new Error(`Unknown crop ${farmer.lot.cropKey}`);
      }
      const [cropRows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM crops WHERE name_th = ?',
        [crop.nameTh],
      );
      const cropRow = cropRows[0];
      if (cropRow === undefined) {
        throw new Error(`Run npm run seed before seed:reset. Missing crop ${crop.nameTh}`);
      }
      const expiresAt = new Date(now.getTime() + farmer.lot.hoursLeft * 60 * 60 * 1000);
      await connection.query(
        `INSERT INTO harvest_lots (
           plot_id, crop_id, weight_kg, grade, ripeness, photo_url, allow_donation,
           predicted_shelf_hours, expires_at, status, created_at
         ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'open', ?)`,
        [
          plot.id,
          cropRow.id,
          farmer.lot.weightKg,
          farmer.lot.grade,
          farmer.lot.ripeness,
          farmer.lot.allowDonation ? 1 : 0,
          farmer.lot.hoursLeft,
          expiresAt,
          now,
        ],
      );
      inserted += 1;
    }

    await connection.commit();
    return inserted;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main(): Promise<void> {
  try {
    const inserted = await resetDemoLots();
    console.log(`seed:reset ok lots=${inserted}`);
  } finally {
    await pool.end();
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('resetLots.ts') || entry.endsWith('resetLots.js')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
