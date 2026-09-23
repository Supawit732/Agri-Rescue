import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { haversineKm } from '../domain/geo';
import { remainingLotKg } from '../domain/lotInventory';
import type { ProduceGrade } from '../domain/pricing';
import { lotAcceptsDonation, lotPricePerKg } from '../domain/sellerPricing';
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
  split_allowed: number;
  min_order_kg: number;
  order_step_kg: number;
  reserved_kg: number;
  grade: ProduceGrade;
  ripeness: number;
  allow_donation: number;
  donation_audience: 'verified_org_only' | 'all_donors';
  start_price_per_kg: number | null;
  floor_price_per_kg: number | null;
  sale_mode: string;
  donation_opened: number;
  expires_at: Date;
  crop_name_th: string;
  base_shelf_days: number;
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
      `SELECT h.id, h.weight_kg, h.split_allowed, h.min_order_kg, h.order_step_kg,
              h.grade, h.ripeness, h.allow_donation, h.donation_audience,
              h.start_price_per_kg, h.floor_price_per_kg, h.sale_mode, h.donation_opened, h.expires_at,
              c.name_th AS crop_name_th, c.base_shelf_days,
              p.lat, p.lng, u.name AS farmer_name,
              COALESCE((
                SELECT SUM(o.quantity_kg) FROM orders o
                WHERE o.lot_id = h.id AND o.status IN ('reserved', 'picked', 'delivered')
              ), 0) AS reserved_kg
       FROM harvest_lots h
       JOIN crops c ON c.id = h.crop_id
       JOIN plots p ON p.id = h.plot_id
       JOIN users u ON u.id = p.farmer_id
       WHERE h.status IN ('open', 'partially_reserved') AND h.expires_at > UTC_TIMESTAMP()
       ORDER BY h.expires_at ASC, h.id ASC`,
    );
    const now = Date.now();
    const lots = rows
      .map((row) => {
        const distanceKm = haversineKm(
          { lat: query.lat, lng: query.lng },
          { lat: Number(row.lat), lng: Number(row.lng) },
        );
        const hoursLeft = (new Date(row.expires_at).getTime() - now) / (60 * 60 * 1000);
        const saleMode = String(row.sale_mode);
        const acceptsDonation = lotAcceptsDonation(saleMode, row.donation_opened);
        const isDonateOnly = saleMode === 'donate';
        let pricePerKg: number | null = null;
        if (!isDonateOnly && row.start_price_per_kg !== null && row.floor_price_per_kg !== null) {
          pricePerKg = lotPricePerKg({
            startPricePerKg: Number(row.start_price_per_kg),
            floorPricePerKg: Number(row.floor_price_per_kg),
            baseShelfHours: Number(row.base_shelf_days) * 24,
            hoursLeft,
          });
        } else if (isDonateOnly) {
          pricePerKg = null;
        } else {
          pricePerKg = 0;
        }
        const weightKg = Number(row.weight_kg);
        const remaining = remainingLotKg(weightKg, Number(row.reserved_kg));
        return {
          id: Number(row.id),
          crop_name_th: row.crop_name_th,
          farmer_name: row.farmer_name,
          weight_kg: weightKg,
          remaining_kg: remaining,
          split_allowed: Number(row.split_allowed) === 1,
          min_order_kg: Number(row.min_order_kg),
          order_step_kg: Number(row.order_step_kg),
          grade: row.grade,
          ripeness: Number(row.ripeness),
          sale_mode: saleMode,
          donation_opened: Number(row.donation_opened) === 1,
          allow_donation: acceptsDonation,
          donation_audience: row.donation_audience,
          expires_at: new Date(row.expires_at).toISOString(),
          hours_left: hoursLeft,
          distance_km: distanceKm,
          price_per_kg: pricePerKg,
          lat: Number(row.lat),
          lng: Number(row.lng),
        };
      })
      .filter((lot) => lot.distance_km <= radiusKm && lot.hours_left > 0 && lot.remaining_kg > 0);
    res.json({ lots });
  }),
);
