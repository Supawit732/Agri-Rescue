import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from './pool';
import {
  buyers,
  crops,
  DEMO_PASSWORD,
  farmers,
  staff,
  type CropKey,
} from './seedData';

export async function seed(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const cropIds = new Map<CropKey, number>();
    for (const crop of crops) {
      cropIds.set(
        crop.key,
        await upsertCrop(connection, {
          nameTh: crop.nameTh,
          nameEn: crop.nameEn,
          baseShelfDays: crop.baseShelfDays,
          marketPricePerKg: crop.marketPricePerKg,
          categoryId: crop.categoryId,
          normalFeaturesTh: crop.normalFeaturesTh,
          defectExamplesTh: crop.defectExamplesTh,
        }),
      );
    }

    for (const farmer of farmers) {
      const farmerId = await upsertUser(connection, {
        name: farmer.name,
        phone: farmer.phone,
        role: 'farmer',
        buyerType: null,
        lat: farmer.lat,
        lng: farmer.lng,
        passwordHash,
      });
      const plotId = await upsertPlot(connection, farmerId, farmer.plotName, farmer.lat, farmer.lng, farmer.areaRai);
      const cropId = cropIds.get(farmer.lot.cropKey);
      if (cropId === undefined) {
        throw new Error(`Unknown crop ${farmer.lot.cropKey}`);
      }
      // Relative to now so demo open lots are never pre-expired.
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + farmer.lot.hoursLeft * 60 * 60 * 1000);
      await upsertLot(connection, {
        plotId,
        cropId,
        weightKg: farmer.lot.weightKg,
        grade: farmer.lot.grade,
        ripeness: farmer.lot.ripeness,
        allowDonation: farmer.lot.allowDonation,
        shelfHours: farmer.lot.hoursLeft,
        createdAt,
        expiresAt,
      });
      await connection.query(
        `INSERT INTO shops (user_id, name) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [farmerId, `สวน${farmer.name}`],
      );
    }

    for (const person of staff) {
      await upsertUser(connection, {
        name: person.name,
        phone: person.phone,
        role: person.role,
        buyerType: null,
        lat: null,
        lng: null,
        passwordHash,
      });
    }

    for (const buyer of buyers) {
      await upsertUser(connection, {
        name: buyer.name,
        phone: buyer.phone,
        role: 'buyer',
        buyerType: buyer.buyerType,
        lat: buyer.lat,
        lng: buyer.lng,
        passwordHash,
      });
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function upsertCrop(
  connection: PoolConnection,
  input: {
    nameTh: string;
    nameEn: string;
    baseShelfDays: number;
    marketPricePerKg: number;
    categoryId?: number | null;
    normalFeaturesTh: string;
    defectExamplesTh: string;
  },
): Promise<number> {
  const [existing] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM crops WHERE name_th = ?',
    [input.nameTh],
  );
  const row = existing[0];
  if (row !== undefined) {
    await connection.query(
      `UPDATE crops
       SET name_en = ?, base_shelf_days = ?, market_price_per_kg = ?, category_id = ?,
           normal_features_th = ?, defect_examples_th = ?
       WHERE id = ?`,
      [
        input.nameEn,
        input.baseShelfDays,
        input.marketPricePerKg,
        input.categoryId ?? null,
        input.normalFeaturesTh,
        input.defectExamplesTh,
        row.id,
      ],
    );
    return Number(row.id);
  }
  const [result] = await connection.query<ResultSetHeader>(
    `INSERT INTO crops
       (name_th, name_en, base_shelf_days, market_price_per_kg, category_id, normal_features_th, defect_examples_th)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.nameTh,
      input.nameEn,
      input.baseShelfDays,
      input.marketPricePerKg,
      input.categoryId ?? null,
      input.normalFeaturesTh,
      input.defectExamplesTh,
    ],
  );
  return result.insertId;
}

interface NewUser {
  name: string;
  phone: string;
  role: 'farmer' | 'buyer' | 'driver' | 'coordinator';
  buyerType: 'vendor' | 'shop' | 'charity' | null;
  lat: number | null;
  lng: number | null;
  passwordHash: string;
}

async function upsertUser(connection: PoolConnection, user: NewUser): Promise<number> {
  const [existing] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE phone = ?',
    [user.phone],
  );
  const row = existing[0];
  if (row !== undefined) {
    return Number(row.id);
  }
  const canSell = user.role === 'farmer' ? 1 : 0;
  const canBuy = user.role === 'buyer' || user.role === 'driver' ? 1 : 0;
  const isAdmin = user.role === 'coordinator' ? 1 : 0;
  const [result] = await connection.query<ResultSetHeader>(
    `INSERT INTO users (name, phone, password_hash, role, can_sell, can_buy, is_admin, line_id, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [user.name, user.phone, user.passwordHash, user.role, canSell, canBuy, isAdmin, user.lat, user.lng],
  );
  if (user.buyerType !== null) {
    const isCharity = user.buyerType === 'charity';
    await connection.query(
      `INSERT INTO buyer_profiles (
         user_id, buyer_type, charity_approved, donor_tier, distribution_mode, beneficiary_count,
         org_name, org_type, org_status, org_reviewed_at
       ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        user.buyerType,
        isCharity ? 'verified_org' : null,
        isCharity ? 'redistribute' : null,
        isCharity ? 40 : null,
        isCharity ? user.name : null,
        isCharity ? 'shelter' : null,
        isCharity ? 'approved' : 'none',
        isCharity ? new Date() : null,
      ],
    );
  }
  return result.insertId;
}

async function upsertPlot(
  connection: PoolConnection,
  farmerId: number,
  name: string,
  lat: number,
  lng: number,
  areaRai: number,
): Promise<number> {
  const [existing] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM plots WHERE farmer_id = ? AND name = ?',
    [farmerId, name],
  );
  const row = existing[0];
  if (row !== undefined) {
    return Number(row.id);
  }
  const [result] = await connection.query<ResultSetHeader>(
    'INSERT INTO plots (farmer_id, name, lat, lng, area_rai) VALUES (?, ?, ?, ?, ?)',
    [farmerId, name, lat, lng, areaRai],
  );
  return result.insertId;
}

async function upsertLot(
  connection: PoolConnection,
  lot: {
    plotId: number;
    cropId: number;
    weightKg: number;
    grade: 'normal' | 'substandard';
    ripeness: number;
    allowDonation: boolean;
    shelfHours: number;
    createdAt: Date;
    expiresAt: Date;
  },
): Promise<void> {
  const [existing] = await connection.query<RowDataPacket[]>(
    `SELECT id, status, expires_at FROM harvest_lots
     WHERE plot_id = ? AND crop_id = ? AND weight_kg = ? AND grade = ? AND ripeness = ?`,
    [lot.plotId, lot.cropId, lot.weightKg, lot.grade, lot.ripeness],
  );
  const row = existing[0];
  if (row !== undefined) {
    if (String(row.status) === 'open' && new Date(row.expires_at as Date).getTime() <= Date.now()) {
      await connection.query(
        `UPDATE harvest_lots SET status = 'open', expires_at = ?, created_at = UTC_TIMESTAMP() WHERE id = ?`,
        [lot.expiresAt, Number(row.id)],
      );
    }
    return;
  }
  const [cropRows] = await connection.query<RowDataPacket[]>(
    'SELECT market_price_per_kg FROM crops WHERE id = ?',
    [lot.cropId],
  );
  const market = Number(cropRows[0]?.market_price_per_kg ?? 0);
  const start = Math.round(market * (lot.grade === 'substandard' ? 0.7 : 1) * 100) / 100;
  const floor = Math.round(start * 0.3 * 100) / 100;
  const saleMode = lot.allowDonation ? 'sell_then_donate' : 'sell';
  await connection.query(
    `INSERT INTO harvest_lots (
       plot_id, crop_id, weight_kg, grade, ripeness, photo_url, allow_donation, donation_audience,
       start_price_per_kg, floor_price_per_kg, sale_mode, donation_opened,
       market_price_snapshot, market_price_is_estimate,
       predicted_shelf_hours, expires_at, status, created_at
     ) VALUES (?, ?, ?, ?, ?, NULL, ?, 'verified_org_only', ?, ?, ?, 0, ?, 1, ?, ?, 'open', ?)`,
    [
      lot.plotId,
      lot.cropId,
      lot.weightKg,
      lot.grade,
      lot.ripeness,
      lot.allowDonation ? 1 : 0,
      start,
      floor,
      saleMode,
      market,
      lot.shelfHours,
      lot.expiresAt,
      lot.createdAt,
    ],
  );
}

async function main(): Promise<void> {
  try {
    await seed();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
       UNION ALL SELECT 'crops', COUNT(*) FROM crops
       UNION ALL SELECT 'plots', COUNT(*) FROM plots
       UNION ALL SELECT 'harvest_lots', COUNT(*) FROM harvest_lots`,
    );
    console.log('seed ok');
    for (const row of rows) {
      console.log(`${String(row.table_name)}=${String(row.row_count)}`);
    }
  } finally {
    await pool.end();
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('seed.ts') || entry.endsWith('seed.js')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
