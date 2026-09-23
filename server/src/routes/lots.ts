import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { urgentPricePerKg, type ProduceGrade } from '../domain/pricing';
import { predictShelfHours } from '../domain/shelfLife';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { fetchWeather } from '../weather/openMeteo';

export const lotsRouter = Router();

const gradeSchema = z.enum(['normal', 'substandard']);

const estimateSchema = z.object({
  crop_id: z.number().int().positive(),
  ripeness: z.number().int().min(0).max(4),
  grade: gradeSchema,
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

const createSchema = z.object({
  plot_id: z.number().int().positive(),
  crop_id: z.number().int().positive(),
  weight_kg: z.number().positive(),
  grade: gradeSchema,
  ripeness: z.number().int().min(0).max(4),
  allow_donation: z.boolean().optional(),
  photo_url: z.string().max(1024).nullable().optional(),
});

interface CropRow extends RowDataPacket {
  id: number;
  base_shelf_days: number;
  market_price_per_kg: number;
}

lotsRouter.use(requireAuth, requireRole('farmer'));

lotsRouter.post(
  '/estimate',
  asyncHandler(async (req, res) => {
    const body = estimateSchema.parse(req.body);
    const crop = await findCrop(body.crop_id);
    const weather = await fetchWeather(body.lat, body.lng);
    const shelfHours = predictShelfHours(crop.base_shelf_days, body.ripeness, weather.tempC);
    const pricePerKg = urgentPricePerKg({
      marketPricePerKg: Number(crop.market_price_per_kg),
      baseShelfHours: crop.base_shelf_days * 24,
      hoursLeft: shelfHours,
      grade: body.grade,
    });
    res.json({
      shelf_hours: shelfHours,
      price_per_kg: pricePerKg,
      temp_c: weather.tempC,
      humidity: weather.humidity,
      weather_source: weather.fallback ? 'fallback' : 'live',
    });
  }),
);

lotsRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    res.json({ lots: await listMine(req.auth?.id ?? 0) });
  }),
);

lotsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ lots: await listMine(req.auth?.id ?? 0) });
  }),
);

lotsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const farmerId = req.auth?.id ?? 0;
    const plot = await findOwnedPlot(body.plot_id, farmerId);
    const crop = await findCrop(body.crop_id);
    const weather = await fetchWeather(Number(plot.lat), Number(plot.lng));
    const shelfHours = predictShelfHours(crop.base_shelf_days, body.ripeness, weather.tempC);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + shelfHours * 60 * 60 * 1000);
    const allowDonation = body.allow_donation === true ? 1 : 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [lotResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO harvest_lots (
           plot_id, crop_id, weight_kg, grade, ripeness, photo_url, allow_donation,
           predicted_shelf_hours, expires_at, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        [
          body.plot_id,
          body.crop_id,
          body.weight_kg,
          body.grade,
          body.ripeness,
          body.photo_url ?? null,
          allowDonation,
          shelfHours,
          expiresAt,
          createdAt,
        ],
      );
      const [assessmentResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO quality_assessments
           (lot_id, method, ripeness, temp_c, humidity, predicted_shelf_hours, created_at)
         VALUES (?, 'rule', ?, ?, ?, ?, ?)`,
        [lotResult.insertId, body.ripeness, weather.tempC, weather.humidity, shelfHours, createdAt],
      );
      await connection.commit();
      const pricePerKg = quotePrice(crop, body.grade, shelfHours);
      res.status(201).json({
        lot: {
          id: lotResult.insertId,
          plot_id: body.plot_id,
          crop_id: body.crop_id,
          weight_kg: body.weight_kg,
          grade: body.grade,
          ripeness: body.ripeness,
          photo_url: body.photo_url ?? null,
          allow_donation: allowDonation === 1,
          predicted_shelf_hours: shelfHours,
          expires_at: expiresAt.toISOString(),
          status: 'open',
          price_per_kg: pricePerKg,
        },
        assessment: {
          id: assessmentResult.insertId,
          lot_id: lotResult.insertId,
          method: 'rule',
          ripeness: body.ripeness,
          temp_c: weather.tempC,
          humidity: weather.humidity,
          predicted_shelf_hours: shelfHours,
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

function quotePrice(crop: CropRow, grade: ProduceGrade, hoursLeft: number): number {
  return urgentPricePerKg({
    marketPricePerKg: Number(crop.market_price_per_kg),
    baseShelfHours: crop.base_shelf_days * 24,
    hoursLeft,
    grade,
  });
}

async function findCrop(cropId: number): Promise<CropRow> {
  const [rows] = await pool.query<CropRow[]>(
    'SELECT id, base_shelf_days, market_price_per_kg FROM crops WHERE id = ?',
    [cropId],
  );
  const crop = rows[0];
  if (crop === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบพืชผล');
  }
  return crop;
}

async function findOwnedPlot(plotId: number, farmerId: number): Promise<RowDataPacket> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, farmer_id, lat, lng FROM plots WHERE id = ?',
    [plotId],
  );
  const plot = rows[0];
  if (plot === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบแปลง');
  }
  if (Number(plot.farmer_id) !== farmerId) {
    throw new HttpError(403, 'FORBIDDEN', 'ดูหรือแก้ไขได้เฉพาะแปลงของตนเอง');
  }
  return plot;
}

interface MineLotRow extends RowDataPacket {
  id: number;
  plot_id: number;
  crop_id: number;
  weight_kg: number;
  grade: ProduceGrade;
  ripeness: number;
  photo_url: string | null;
  allow_donation: number;
  predicted_shelf_hours: number;
  expires_at: Date;
  status: string;
  created_at: Date;
  crop_name_th: string;
  plot_name: string;
  base_shelf_days: number;
  market_price_per_kg: number;
}

async function listMine(farmerId: number): Promise<object[]> {
  const [rows] = await pool.query<MineLotRow[]>(
    `SELECT h.id, h.plot_id, h.crop_id, h.weight_kg, h.grade, h.ripeness, h.photo_url,
            h.allow_donation, h.predicted_shelf_hours, h.expires_at, h.status, h.created_at,
            c.name_th AS crop_name_th, c.base_shelf_days, c.market_price_per_kg,
            p.name AS plot_name
     FROM harvest_lots h
     JOIN plots p ON p.id = h.plot_id
     JOIN crops c ON c.id = h.crop_id
     WHERE p.farmer_id = ?
     ORDER BY h.id`,
    [farmerId],
  );
  const now = Date.now();
  return rows.map((row) => {
    const hoursLeft = (new Date(row.expires_at).getTime() - now) / (60 * 60 * 1000);
    return {
      id: Number(row.id),
      plot_id: Number(row.plot_id),
      crop_id: Number(row.crop_id),
      weight_kg: Number(row.weight_kg),
      grade: row.grade,
      ripeness: Number(row.ripeness),
      photo_url: row.photo_url,
      allow_donation: Number(row.allow_donation) === 1,
      predicted_shelf_hours: Number(row.predicted_shelf_hours),
      expires_at: new Date(row.expires_at).toISOString(),
      status: row.status,
      created_at: new Date(row.created_at).toISOString(),
      crop_name_th: row.crop_name_th,
      plot_name: row.plot_name,
      price_per_kg: urgentPricePerKg({
        marketPricePerKg: Number(row.market_price_per_kg),
        baseShelfHours: Number(row.base_shelf_days) * 24,
        hoursLeft,
        grade: row.grade,
      }),
    };
  });
}
