import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from './pool';
import {
  loadPrototype,
  type PrototypeCrop,
  type PrototypeLot,
  type PrototypePlot,
  type PrototypeUser,
} from './prototype';

const DEMO_PASSWORD = 'demo1234';
const FIXED_CREATED_AT = new Date('2026-09-22T02:00:00.000Z');
const FALLBACK_TEMP_C = 32;
const FALLBACK_HUMIDITY = 75;

const ROLE_FALLBACK: Record<'farmer' | 'driver' | 'coordinator', { name: string; phone: string }> = {
  farmer: { name: 'เกษตรกรตัวอย่าง', phone: '0800000001' },
  driver: { name: 'คนขับตัวอย่าง', phone: '0800000002' },
  coordinator: { name: 'ผู้ประสานตัวอย่าง', phone: '0800000003' },
};

const BUYER_FALLBACK_PHONES = ['0800000011', '0800000012', '0800000013'];

interface ResolvedPlot extends PrototypePlot {
  areaRai: number;
}

export function predictShelfHours(baseShelfDays: number, ripeness: number, tempC: number): number {
  const base = baseShelfDays * 24;
  const ripeFactor = 1 - ripeness * 0.18;
  const heatFactor = tempC > 30 ? Math.max(0.6, 1 - (tempC - 30) * 0.05) : 1;
  return Math.max(6, Math.round(base * ripeFactor * heatFactor));
}

export async function seed(): Promise<void> {
  const prototype = loadPrototype();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const cropIds = new Map<string, number>();
    for (const crop of prototype.crops) {
      cropIds.set(crop.nameTh, await upsertCrop(connection, crop));
    }

    const farmer = userByRole(prototype.users, 'farmer');
    const driver = userByRole(prototype.users, 'driver');
    const coordinator = userByRole(prototype.users, 'coordinator');
    const farmerId = await upsertUser(connection, {
      name: farmer?.name ?? ROLE_FALLBACK.farmer.name,
      phone: farmer?.phone ?? ROLE_FALLBACK.farmer.phone,
      role: 'farmer',
      buyerType: null,
      lat: farmer?.lat ?? null,
      lng: farmer?.lng ?? null,
      passwordHash,
    });
    await upsertUser(connection, {
      name: driver?.name ?? ROLE_FALLBACK.driver.name,
      phone: driver?.phone ?? ROLE_FALLBACK.driver.phone,
      role: 'driver',
      buyerType: null,
      lat: driver?.lat ?? null,
      lng: driver?.lng ?? null,
      passwordHash,
    });
    await upsertUser(connection, {
      name: coordinator?.name ?? ROLE_FALLBACK.coordinator.name,
      phone: coordinator?.phone ?? ROLE_FALLBACK.coordinator.phone,
      role: 'coordinator',
      buyerType: null,
      lat: coordinator?.lat ?? null,
      lng: coordinator?.lng ?? null,
      passwordHash,
    });

    for (let index = 0; index < prototype.buyers.length; index += 1) {
      const buyer = prototype.buyers[index];
      if (buyer === undefined) {
        continue;
      }
      const phone = buyer.phone ?? BUYER_FALLBACK_PHONES[index];
      if (phone === undefined) {
        throw new Error(`Buyer ${buyer.name} has no phone`);
      }
      await upsertUser(connection, {
        name: buyer.name,
        phone,
        role: 'buyer',
        buyerType: buyer.buyerType,
        lat: buyer.lat,
        lng: buyer.lng,
        passwordHash,
      });
    }

    const plots = resolvePlots(prototype.plots, prototype.lots);
    const plotIds = new Map<string, number>();
    for (const plot of plots) {
      plotIds.set(plot.name, await upsertPlot(connection, farmerId, plot));
    }

    for (let index = 0; index < prototype.lots.length; index += 1) {
      const lot = prototype.lots[index];
      if (lot === undefined) {
        continue;
      }
      const crop = prototype.crops.find((item) => item.nameTh === lot.cropName);
      const cropId = cropIds.get(lot.cropName);
      if (crop === undefined || cropId === undefined) {
        throw new Error(`Lot crop not found: ${lot.cropName}`);
      }
      const plot = plotForLot(plots, lot, index);
      const plotId = plotIds.get(plot.name);
      if (plotId === undefined) {
        throw new Error(`Plot not found: ${plot.name}`);
      }
      await upsertLot(connection, lot, crop, plotId);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function userByRole(users: PrototypeUser[], role: PrototypeUser['role']): PrototypeUser | undefined {
  return users.find((user) => user.role === role);
}

function resolvePlots(plots: PrototypePlot[], lots: PrototypeLot[]): ResolvedPlot[] {
  if (plots.length === 3) {
    return plots.map((plot, index) => ({
      ...plot,
      areaRai: plot.areaRai ?? areaFromLot(lots[index]) ?? missingArea(plot.name),
    }));
  }
  if (lots.length !== 3) {
    throw new Error(`Expected 3 plots, found ${plots.length}`);
  }
  return lots.map((lot, index) => {
    if (lot.lat === null || lot.lng === null) {
      throw new Error(`Lot ${index + 1} has no coordinates for its plot`);
    }
    return {
      name: lot.plotName ?? `แปลง ${index + 1}`,
      lat: lot.lat,
      lng: lot.lng,
      areaRai: lot.areaRai ?? missingArea(lot.plotName ?? String(index + 1)),
    };
  });
}

function areaFromLot(lot: PrototypeLot | undefined): number | null {
  return lot?.areaRai ?? null;
}

function missingArea(name: string): number {
  throw new Error(`Plot ${name} has no area_rai in the prototype`);
}

function plotForLot(plots: ResolvedPlot[], lot: PrototypeLot, index: number): ResolvedPlot {
  if (lot.plotName !== null) {
    const named = plots.find((plot) => plot.name === lot.plotName);
    if (named !== undefined) {
      return named;
    }
  }
  const byIndex = plots[index];
  if (byIndex === undefined) {
    throw new Error(`No plot for lot ${index + 1}`);
  }
  return byIndex;
}

async function upsertCrop(connection: PoolConnection, crop: PrototypeCrop): Promise<number> {
  if (!Number.isInteger(crop.baseShelfDays)) {
    throw new Error(`Crop ${crop.nameTh} base_shelf_days is not an integer`);
  }
  const [existing] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM crops WHERE name_th = ?',
    [crop.nameTh],
  );
  const row = existing[0];
  if (row !== undefined) {
    return Number(row.id);
  }
  const [result] = await connection.query<ResultSetHeader>(
    'INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg) VALUES (?, ?, ?)',
    [crop.nameTh, crop.baseShelfDays, crop.marketPricePerKg],
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
    'SELECT id FROM users WHERE phone = ? OR (name = ? AND role = ?)',
    [user.phone, user.name, user.role],
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

async function upsertPlot(connection: PoolConnection, farmerId: number, plot: ResolvedPlot): Promise<number> {
  const [existing] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM plots WHERE farmer_id = ? AND name = ?',
    [farmerId, plot.name],
  );
  const row = existing[0];
  if (row !== undefined) {
    return Number(row.id);
  }
  const [result] = await connection.query<ResultSetHeader>(
    'INSERT INTO plots (farmer_id, name, lat, lng, area_rai) VALUES (?, ?, ?, ?, ?)',
    [farmerId, plot.name, plot.lat, plot.lng, plot.areaRai],
  );
  return result.insertId;
}

async function upsertLot(
  connection: PoolConnection,
  lot: PrototypeLot,
  crop: PrototypeCrop,
  plotId: number,
): Promise<void> {
  const tempC = lot.tempC ?? FALLBACK_TEMP_C;
  const humidity = lot.humidity ?? FALLBACK_HUMIDITY;
  const shelfHours = lot.shelfHours ?? predictShelfHours(crop.baseShelfDays, lot.ripeness, tempC);
  const createdAt = lot.createdAt === null ? FIXED_CREATED_AT : new Date(lot.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`Invalid lot created_at for ${lot.cropName}`);
  }
  const expiresAt = new Date(createdAt.getTime() + shelfHours * 60 * 60 * 1000);
  const cropId = await cropIdByName(connection, lot.cropName);
  const [found] = await connection.query<RowDataPacket[]>(
    `SELECT id FROM harvest_lots
     WHERE plot_id = ? AND crop_id = ? AND weight_kg = ? AND grade = ? AND ripeness = ?`,
    [plotId, cropId, lot.weightKg, lot.grade, lot.ripeness],
  );
  const row = found[0];
  const lotId = row === undefined
    ? await insertLot(connection, {
        plotId,
        cropId,
        lot,
        shelfHours,
        createdAt,
        expiresAt,
      })
    : Number(row.id);
  await upsertAssessment(connection, lotId, lot.ripeness, tempC, humidity, shelfHours);
}

async function cropIdByName(connection: PoolConnection, nameTh: string): Promise<number> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM crops WHERE name_th = ?',
    [nameTh],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Crop not inserted: ${nameTh}`);
  }
  return Number(row.id);
}

async function insertLot(
  connection: PoolConnection,
  input: {
    plotId: number;
    cropId: number;
    lot: PrototypeLot;
    shelfHours: number;
    createdAt: Date;
    expiresAt: Date;
  },
): Promise<number> {
  const [result] = await connection.query<ResultSetHeader>(
    `INSERT INTO harvest_lots (
       plot_id, crop_id, weight_kg, grade, ripeness, photo_url, allow_donation,
       predicted_shelf_hours, expires_at, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    [
      input.plotId,
      input.cropId,
      input.lot.weightKg,
      input.lot.grade,
      input.lot.ripeness,
      input.lot.photoUrl,
      input.lot.allowDonation ? 1 : 0,
      input.shelfHours,
      input.expiresAt,
      input.createdAt,
    ],
  );
  return result.insertId;
}

async function upsertAssessment(
  connection: PoolConnection,
  lotId: number,
  ripeness: number,
  tempC: number,
  humidity: number,
  shelfHours: number,
): Promise<void> {
  const [existing] = await connection.query<RowDataPacket[]>(
    "SELECT id FROM quality_assessments WHERE lot_id = ? AND method = 'rule'",
    [lotId],
  );
  if (existing.length > 0) {
    return;
  }
  await connection.query(
    `INSERT INTO quality_assessments
       (lot_id, method, ripeness, temp_c, humidity, predicted_shelf_hours)
     VALUES (?, 'rule', ?, ?, ?, ?)`,
    [lotId, ripeness, tempC, humidity, shelfHours],
  );
}

async function main(): Promise<void> {
  try {
    await seed();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
       UNION ALL SELECT 'crops', COUNT(*) FROM crops
       UNION ALL SELECT 'plots', COUNT(*) FROM plots
       UNION ALL SELECT 'harvest_lots', COUNT(*) FROM harvest_lots
       UNION ALL SELECT 'quality_assessments', COUNT(*) FROM quality_assessments`,
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
