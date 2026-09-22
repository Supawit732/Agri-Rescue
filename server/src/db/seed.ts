import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from './pool';
import {
  buyers,
  crops,
  DEMO_PASSWORD,
  farmers,
  SEED_AT_ISO,
  staff,
  type CropKey,
} from './seedData';

export async function seed(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const seedAt = new Date(SEED_AT_ISO);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const cropIds = new Map<CropKey, number>();
    for (const crop of crops) {
      cropIds.set(crop.key, await upsertCrop(connection, crop.nameTh, crop.baseShelfDays, crop.marketPricePerKg));
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
      const expiresAt = new Date(seedAt.getTime() + farmer.lot.hoursLeft * 60 * 60 * 1000);
      await upsertLot(connection, {
        plotId,
        cropId,
        weightKg: farmer.lot.weightKg,
        grade: farmer.lot.grade,
        ripeness: farmer.lot.ripeness,
        allowDonation: farmer.lot.allowDonation,
        shelfHours: farmer.lot.hoursLeft,
        createdAt: seedAt,
        expiresAt,
      });
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
  nameTh: string,
  baseShelfDays: number,
  marketPricePerKg: number,
): Promise<number> {
  const [existing] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM crops WHERE name_th = ?',
    [nameTh],
  );
  const row = existing[0];
  if (row !== undefined) {
    return Number(row.id);
  }
  const [result] = await connection.query<ResultSetHeader>(
    'INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg) VALUES (?, ?, ?)',
    [nameTh, baseShelfDays, marketPricePerKg],
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
  const [result] = await connection.query<ResultSetHeader>(
    `INSERT INTO users (name, phone, password_hash, role, buyer_type, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user.name, user.phone, user.passwordHash, user.role, user.buyerType, user.lat, user.lng],
  );
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
    `SELECT id FROM harvest_lots
     WHERE plot_id = ? AND crop_id = ? AND weight_kg = ? AND grade = ? AND ripeness = ?`,
    [lot.plotId, lot.cropId, lot.weightKg, lot.grade, lot.ripeness],
  );
  if (existing.length > 0) {
    return;
  }
  await connection.query(
    `INSERT INTO harvest_lots (
       plot_id, crop_id, weight_kg, grade, ripeness, photo_url, allow_donation,
       predicted_shelf_hours, expires_at, status, created_at
     ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'open', ?)`,
    [
      lot.plotId,
      lot.cropId,
      lot.weightKg,
      lot.grade,
      lot.ripeness,
      lot.allowDonation ? 1 : 0,
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
