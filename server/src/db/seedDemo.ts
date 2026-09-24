/**
 * Additive demo history for dashboards.
 * Prerequisite: `npm run migrate` and `npm run seed` (creates farmers/crops/plots/open lots).
 * Marker: harvest_lots.photo_url = 'seed:demo' — re-running deletes prior demo-tagged rows first.
 */
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from './pool';
import { CO2E_PER_KG, crops, farmers, buyers } from './seedData';
import { seed } from './seed';
import { round2 } from '../delivery/depot';

const DEMO_MARKER = 'seed:demo';

async function clearPreviousDemo(connection: PoolConnection): Promise<void> {
  const [lots] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM harvest_lots WHERE photo_url = ?',
    [DEMO_MARKER],
  );
  const lotIds = lots.map((r) => Number(r.id));
  if (lotIds.length === 0) {
    return;
  }
  const placeholders = lotIds.map(() => '?').join(',');
  const [orders] = await connection.query<RowDataPacket[]>(
    `SELECT id FROM orders WHERE lot_id IN (${placeholders})`,
    lotIds,
  );
  const orderIds = orders.map((r) => Number(r.id));
  if (orderIds.length > 0) {
    const orderPlaceholders = orderIds.map(() => '?').join(',');
    await connection.query(`DELETE FROM impact_logs WHERE order_id IN (${orderPlaceholders})`, orderIds);
    await connection.query(`DELETE FROM donation_proofs WHERE order_id IN (${orderPlaceholders})`, orderIds);
    await connection.query(`DELETE FROM orders WHERE id IN (${orderPlaceholders})`, orderIds);
  }
  await connection.query(`DELETE FROM quality_assessments WHERE lot_id IN (${placeholders})`, lotIds);
  await connection.query(`DELETE FROM lot_delete_logs WHERE lot_id IN (${placeholders})`, lotIds);
  await connection.query(`DELETE FROM harvest_lots WHERE id IN (${placeholders})`, lotIds);
}

function dayAgo(days: number, hourUtc = 8): Date {
  const d = new Date();
  d.setUTCHours(hourUtc, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export async function seedDemo(options?: { skipBaseSeed?: boolean }): Promise<void> {
  if (options?.skipBaseSeed !== true) {
    await seed();
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await clearPreviousDemo(connection);

    const farmerIds = new Map<string, number>();
    for (const farmer of farmers) {
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM users WHERE phone = ?',
        [farmer.phone],
      );
      if (rows[0] === undefined) {
        throw new Error(`Missing demo farmer ${farmer.phone} — run seed first`);
      }
      farmerIds.set(farmer.phone, Number(rows[0].id));
    }

    const buyerIds: number[] = [];
    for (const buyer of buyers) {
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM users WHERE phone = ?',
        [buyer.phone],
      );
      if (rows[0] === undefined) {
        throw new Error(`Missing demo buyer ${buyer.phone} — run seed first`);
      }
      buyerIds.push(Number(rows[0].id));
    }

    const cropIds = new Map<string, number>();
    for (const crop of crops) {
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM crops WHERE name_th = ?',
        [crop.nameTh],
      );
      if (rows[0] === undefined) {
        throw new Error(`Missing crop ${crop.nameTh}`);
      }
      cropIds.set(crop.key, Number(rows[0].id));
    }

    const plotByFarmer = new Map<number, number>();
    for (const farmer of farmers) {
      const farmerId = farmerIds.get(farmer.phone)!;
      const [plots] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM plots WHERE farmer_id = ? LIMIT 1',
        [farmerId],
      );
      if (plots[0] === undefined) {
        throw new Error(`Missing plot for ${farmer.phone}`);
      }
      plotByFarmer.set(farmerId, Number(plots[0].id));
    }

    // ~14 days of delivered history across crops/farmers
    let dayIndex = 0;
    for (let day = 13; day >= 0; day -= 1) {
      const farmer = farmers[dayIndex % farmers.length]!;
      const crop = crops[dayIndex % crops.length]!;
      const farmerId = farmerIds.get(farmer.phone)!;
      const plotId = plotByFarmer.get(farmerId)!;
      const cropId = cropIds.get(crop.key)!;
      const createdAt = dayAgo(day, 6);
      const deliveredAt = dayAgo(day, 10);
      const expiresAt = new Date(createdAt.getTime() + 48 * 60 * 60 * 1000);
      const weightKg = 20 + (dayIndex % 5) * 5;
      const ripeness = 1 + (dayIndex % 4);
      const isDonation = dayIndex % 3 === 0;
      const price = isDonation ? 0 : Math.round(crop.marketPricePerKg * 0.7 * 100) / 100;
      const buyerId = buyerIds[dayIndex % buyerIds.length]!;

      const [lotResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO harvest_lots (
           plot_id, crop_id, weight_kg, grade, ripeness, photo_url, allow_donation, donation_audience,
           start_price_per_kg, floor_price_per_kg, sale_mode, donation_opened,
           market_price_snapshot, market_price_is_estimate,
           predicted_shelf_hours, expires_at, status, created_at
         ) VALUES (?, ?, ?, 'normal', ?, ?, ?, 'verified_org_only', ?, ?, ?, ?, ?, 1, 48, ?, 'delivered', ?)`,
        [
          plotId,
          cropId,
          weightKg,
          ripeness,
          DEMO_MARKER,
          isDonation ? 1 : 0,
          isDonation ? null : price,
          isDonation ? null : Math.round(price * 0.3 * 100) / 100,
          isDonation ? 'donate' : 'sell',
          isDonation ? 1 : 0,
          crop.marketPricePerKg,
          expiresAt,
          createdAt,
        ],
      );
      const lotId = lotResult.insertId;

      // AI accuracy mix: match on even days, mismatch on odd
      const aiRipeness = dayIndex % 2 === 0 ? ripeness : (ripeness + 1) % 5;
      await connection.query(
        `INSERT INTO quality_assessments
           (lot_id, method, ripeness, temp_c, humidity, predicted_shelf_hours, ai_ripeness, ai_confidence, ai_model, created_at)
         VALUES (?, 'model', ?, 32, 75, 48, ?, 0.85, 'seed:demo', ?)`,
        [lotId, ripeness, aiRipeness, createdAt],
      );

      const qty = weightKg;
      const otp = String(1000 + (dayIndex % 9000)).padStart(4, '0');
      const [orderResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO orders
           (lot_id, buyer_id, quantity_kg, agreed_price_per_kg, is_donation, status, batch_id, drop_otp, created_at)
         VALUES (?, ?, ?, ?, ?, 'delivered', NULL, ?, ?)`,
        [lotId, buyerId, qty, price, isDonation ? 1 : 0, otp, deliveredAt],
      );
      await connection.query(
        `INSERT INTO impact_logs (order_id, kg_saved, co2e_kg, created_at) VALUES (?, ?, ?, ?)`,
        [orderResult.insertId, qty, round2(qty * CO2E_PER_KG), deliveredAt],
      );

      dayIndex += 1;
    }

    // Recent open lots with reserved + cancelled for status chart (still tagged seed:demo)
    const liveFarmer = farmers[0]!;
    const liveFarmerId = farmerIds.get(liveFarmer.phone)!;
    const livePlotId = plotByFarmer.get(liveFarmerId)!;
    const liveCropId = cropIds.get(crops[0]!.key)!;
    const openExpires = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const [openLot] = await connection.query<ResultSetHeader>(
      `INSERT INTO harvest_lots (
         plot_id, crop_id, weight_kg, grade, ripeness, photo_url, allow_donation, donation_audience,
         start_price_per_kg, floor_price_per_kg, sale_mode, donation_opened,
         market_price_snapshot, market_price_is_estimate,
         predicted_shelf_hours, expires_at, status, created_at
       ) VALUES (?, ?, 50, 'normal', 2, ?, 0, 'verified_org_only', 28, 8.4, 'sell', 0, 40, 1, 72, ?, 'partially_reserved', UTC_TIMESTAMP())`,
      [livePlotId, liveCropId, DEMO_MARKER, openExpires],
    );
    const openLotId = openLot.insertId;
    await connection.query(
      `INSERT INTO quality_assessments
         (lot_id, method, ripeness, temp_c, humidity, predicted_shelf_hours, ai_ripeness, ai_confidence, ai_model)
       VALUES (?, 'model', 2, 32, 75, 72, 2, 0.9, 'seed:demo')`,
      [openLotId],
    );
    await connection.query(
      `INSERT INTO orders
         (lot_id, buyer_id, quantity_kg, agreed_price_per_kg, is_donation, status, batch_id, drop_otp)
       VALUES (?, ?, 10, 28, 0, 'reserved', NULL, '4321')`,
      [openLotId, buyerIds[0]],
    );
    await connection.query(
      `INSERT INTO orders
         (lot_id, buyer_id, quantity_kg, agreed_price_per_kg, is_donation, status, batch_id, drop_otp)
       VALUES (?, ?, 5, 28, 0, 'cancelled', NULL, '9999')`,
      [openLotId, buyerIds[1]],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main(): Promise<void> {
  try {
    await seedDemo();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS demo_lots FROM harvest_lots WHERE photo_url = ?`,
      [DEMO_MARKER],
    );
    console.log('seed:demo ok');
    console.log(`demo_lots=${String(rows[0]?.demo_lots)}`);
  } finally {
    await pool.end();
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('seedDemo.ts') || entry.endsWith('seedDemo.js')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
