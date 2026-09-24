import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { haversineKm } from '../domain/geo';
import { remainingLotKg } from '../domain/lotInventory';
import type { ProduceGrade } from '../domain/pricing';
import { availableAs, lotPricePerKg } from '../domain/sellerPricing';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { publicRateLimit } from '../middleware/publicRateLimit';

export const publicMarketRouter = Router();
publicMarketRouter.use(publicRateLimit);

const optionalCoordsSchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90).optional(),
  lng: z.coerce.number().gte(-180).lte(180).optional(),
  radius_km: z.coerce.number().positive().max(200).optional(),
});

interface PublicMarketRow extends RowDataPacket {
  id: number;
  weight_kg: number;
  min_order_kg: number;
  order_step_kg: number;
  reserved_kg: number;
  grade: ProduceGrade;
  ripeness: number;
  start_price_per_kg: number | null;
  floor_price_per_kg: number | null;
  sale_mode: string;
  donation_opened: number;
  expires_at: Date;
  crop_name_th: string;
  crop_name_en: string | null;
  base_shelf_days: number;
  lat: number;
  lng: number;
  plot_name: string;
}

export type PublicLot = {
  id: number;
  crop_name_th: string;
  crop_name_en: string | null;
  grade: ProduceGrade;
  ripeness: number;
  weight_kg: number;
  remaining_kg: number;
  min_order_kg: number;
  price_per_kg: number | null;
  hours_left: number;
  expires_at: string;
  distance_km: number | null;
  subdistrict_th: string | null;
  district_th: string | null;
  area_th: string;
  available_as: ReturnType<typeof availableAs>;
};

const PUBLIC_LOT_SELECT = `SELECT h.id, h.weight_kg, h.min_order_kg, h.order_step_kg,
              h.grade, h.ripeness, h.start_price_per_kg, h.floor_price_per_kg,
              h.sale_mode, h.donation_opened, h.expires_at,
              c.name_th AS crop_name_th, c.name_en AS crop_name_en, c.base_shelf_days,
              p.lat, p.lng, p.name AS plot_name,
              COALESCE((
                SELECT SUM(o.quantity_kg) FROM orders o
                WHERE o.lot_id = h.id AND o.status IN ('reserved', 'picked', 'delivered')
              ), 0) AS reserved_kg
       FROM harvest_lots h
       JOIN crops c ON c.id = h.crop_id
       JOIN plots p ON p.id = h.plot_id`;

/** Round to nearest 0.5 km for public distance display. */
export function roundDistanceKm(km: number): number {
  return Math.round(km * 2) / 2;
}

function presentPublicLot(
  row: PublicMarketRow,
  viewer: { lat: number; lng: number } | null,
  now: number,
): PublicLot {
  const hoursLeft = (new Date(row.expires_at).getTime() - now) / (60 * 60 * 1000);
  const saleMode = String(row.sale_mode);
  const isDonateOnly = saleMode === 'donate';
  let pricePerKg: number | null = null;
  if (!isDonateOnly && row.start_price_per_kg !== null && row.floor_price_per_kg !== null) {
    pricePerKg = lotPricePerKg({
      startPricePerKg: Number(row.start_price_per_kg),
      floorPricePerKg: Number(row.floor_price_per_kg),
      baseShelfHours: Number(row.base_shelf_days) * 24,
      hoursLeft,
    });
  }
  const weightKg = Number(row.weight_kg);
  const remaining = remainingLotKg(weightKg, Number(row.reserved_kg));
  let distanceKm: number | null = null;
  if (viewer !== null) {
    distanceKm = roundDistanceKm(
      haversineKm(
        { lat: viewer.lat, lng: viewer.lng },
        { lat: Number(row.lat), lng: Number(row.lng) },
      ),
    );
  }
  return {
    id: Number(row.id),
    crop_name_th: row.crop_name_th,
    crop_name_en: row.crop_name_en === null || row.crop_name_en === '' ? null : String(row.crop_name_en),
    grade: row.grade,
    ripeness: Number(row.ripeness),
    weight_kg: weightKg,
    remaining_kg: remaining,
    min_order_kg: Number(row.min_order_kg),
    price_per_kg: pricePerKg,
    hours_left: hoursLeft,
    expires_at: new Date(row.expires_at).toISOString(),
    distance_km: distanceKm,
    // plots ยังไม่มีตำบล/อำเภอ — คืน null และใช้ area_th จาก plot_name (D024)
    subdistrict_th: null,
    district_th: null,
    area_th: row.plot_name,
    available_as: availableAs(saleMode, row.donation_opened),
  };
}

publicMarketRouter.get(
  '/market',
  asyncHandler(async (req, res) => {
    const query = optionalCoordsSchema.parse(req.query);
    const hasCoords = query.lat !== undefined && query.lng !== undefined;
    const radiusKm = query.radius_km ?? 15;
    const [rows] = await pool.query<PublicMarketRow[]>(
      `${PUBLIC_LOT_SELECT}
       WHERE h.status IN ('open', 'partially_reserved') AND h.expires_at > UTC_TIMESTAMP()
         AND h.deleted_at IS NULL
       ORDER BY h.expires_at ASC, h.id ASC`,
    );
    const now = Date.now();
    const viewer = hasCoords ? { lat: query.lat!, lng: query.lng! } : null;
    let lots = rows
      .map((row) => presentPublicLot(row, viewer, now))
      .filter((lot) => lot.hours_left > 0 && lot.remaining_kg > 0);
    if (viewer !== null) {
      lots = lots.filter((lot) => lot.distance_km !== null && lot.distance_km <= radiusKm);
      lots.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0) || a.hours_left - b.hours_left);
    } else {
      lots.sort((a, b) => a.hours_left - b.hours_left || a.id - b.id);
    }
    res.json({ lots });
  }),
);

publicMarketRouter.get(
  '/lots/:id',
  asyncHandler(async (req, res) => {
    const lotId = z.coerce.number().int().positive().parse(req.params.id);
    const coords = optionalCoordsSchema.parse(req.query);
    const [rows] = await pool.query<PublicMarketRow[]>(
      `${PUBLIC_LOT_SELECT}
       WHERE h.id = ? AND h.status IN ('open', 'partially_reserved') AND h.expires_at > UTC_TIMESTAMP()
         AND h.deleted_at IS NULL`,
      [lotId],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
    }
    const viewer =
      coords.lat !== undefined && coords.lng !== undefined
        ? { lat: coords.lat, lng: coords.lng }
        : null;
    const lot = presentPublicLot(row, viewer, Date.now());
    if (lot.remaining_kg <= 0 || lot.hours_left <= 0) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
    }
    res.json({ lot });
  }),
);
