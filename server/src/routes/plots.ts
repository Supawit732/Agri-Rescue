import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { reverseGeocode } from '../geo/nominatim';
import { asyncHandler } from '../http/asyncHandler';
import { requireAuth, requireCapability } from '../middleware/auth';

export const plotsRouter = Router();

const plotSchema = z.object({
  name: z.string().trim().min(1, 'กรุณากรอกชื่อแปลง'),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  area_rai: z.number().positive('พื้นที่ต้องมากกว่า 0'),
});

plotsRouter.use(requireAuth, requireCapability('sell'));

plotsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ plots: await listMine(req.auth?.id ?? 0) });
  }),
);

plotsRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    res.json({ plots: await listMine(req.auth?.id ?? 0) });
  }),
);

plotsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = plotSchema.parse(req.body);
    const farmerId = req.auth?.id ?? 0;
    const geo = await reverseGeocode(body.lat, body.lng);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO plots (farmer_id, name, lat, lng, area_rai, subdistrict_th, district_th)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [farmerId, body.name, body.lat, body.lng, body.area_rai, geo.subdistrictTh, geo.districtTh],
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, farmer_id, name, lat, lng, area_rai, subdistrict_th, district_th
       FROM plots WHERE id = ? AND farmer_id = ?`,
      [result.insertId, farmerId],
    );
    res.status(201).json({ plot: rows[0] });
  }),
);

async function listMine(farmerId: number): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, farmer_id, name, lat, lng, area_rai, subdistrict_th, district_th
     FROM plots WHERE farmer_id = ? ORDER BY id`,
    [farmerId],
  );
  return rows;
}
