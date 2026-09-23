import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { haversineKm } from '../domain/geo';
import { urgentPricePerKg, type ProduceGrade } from '../domain/pricing';
import { asyncHandler } from '../http/asyncHandler';
import { requireAuth, requireCapability } from '../middleware/auth';

export const marketRouter = Router();

const querySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  radius_km: z.coerce.number().positive().max(200).optional(),
});

interface MarketRow extends RowDataPacket {
  id: number;
  weight_kg: number;
  grade: ProduceGrade;
  ripeness: number;
  allow_donation: number;
  donation_audience: 'verified_org_only' | 'all_donors';
  expires_at: Date;
  crop_name_th: string;
  base_shelf_days: number;
  market_price_per_kg: number;
  lat: number;
  lng: number;
  farmer_name: string;
}

marketRouter.get(
  '/',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const radiusKm = query.radius_km ?? 15;
    const [rows] = await pool.query<MarketRow[]>(
      `SELECT h.id, h.weight_kg, h.grade, h.ripeness, h.allow_donation, h.donation_audience, h.expires_at,
              c.name_th AS crop_name_th, c.base_shelf_days, c.market_price_per_kg,
              p.lat, p.lng, u.name AS farmer_name
       FROM harvest_lots h
       JOIN crops c ON c.id = h.crop_id
       JOIN plots p ON p.id = h.plot_id
       JOIN users u ON u.id = p.farmer_id
       WHERE h.status = 'open' AND h.expires_at > UTC_TIMESTAMP()
       ORDER BY h.expires_at ASC, h.id ASC`,
    );
    const now = Date.now();
    const lots = rows
      .map((row) => {
        const distanceKm = haversineKm({ lat: query.lat, lng: query.lng }, { lat: Number(row.lat), lng: Number(row.lng) });
        const hoursLeft = (new Date(row.expires_at).getTime() - now) / (60 * 60 * 1000);
        return {
          id: Number(row.id),
          crop_name_th: row.crop_name_th,
          farmer_name: row.farmer_name,
          weight_kg: Number(row.weight_kg),
          grade: row.grade,
          ripeness: Number(row.ripeness),
          allow_donation: Number(row.allow_donation) === 1,
          donation_audience: row.donation_audience,
          expires_at: new Date(row.expires_at).toISOString(),
          hours_left: hoursLeft,
          distance_km: distanceKm,
          price_per_kg: urgentPricePerKg({
            marketPricePerKg: Number(row.market_price_per_kg),
            baseShelfHours: Number(row.base_shelf_days) * 24,
            hoursLeft,
            grade: row.grade,
          }),
          lat: Number(row.lat),
          lng: Number(row.lng),
        };
      })
      .filter((lot) => lot.distance_km <= radiusKm && lot.hours_left > 0);
    res.json({ lots });
  }),
);
