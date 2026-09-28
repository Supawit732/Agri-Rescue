import type { RowDataPacket } from 'mysql2';
import { pool } from './pool';
import { crops, farmers, SEED_CROP_PHOTOS } from './seedData';
import { upsertLot } from './seed';

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
      // Delegates to seed.ts's upsertLot so pricing (start/floor/market-snapshot), sale
      // mode, and photo_url are computed the same way here as in `npm run seed` — this
      // used to be a separate hand-rolled INSERT that omitted those columns entirely,
      // leaving price_per_kg at 0 for anything reset this way. The table was already
      // wiped above, so upsertLot's "does a matching lot exist?" check always misses and
      // it always inserts.
      await upsertLot(connection, {
        plotId: Number(plot.id),
        cropId: Number(cropRow.id),
        weightKg: farmer.lot.weightKg,
        grade: farmer.lot.grade,
        ripeness: farmer.lot.ripeness,
        allowDonation: farmer.lot.allowDonation,
        shelfHours: farmer.lot.hoursLeft,
        description: 'description' in farmer.lot ? farmer.lot.description : null,
        photoUrl: SEED_CROP_PHOTOS[farmer.lot.cropKey] ?? null,
        createdAt: now,
        expiresAt,
      });
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
