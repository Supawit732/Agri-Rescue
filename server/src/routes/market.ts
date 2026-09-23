import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { haversineKm } from '../domain/geo';
import { remainingLotKg } from '../domain/lotInventory';
import type { ProduceGrade } from '../domain/pricing';
import { availableAs, lotAcceptsDonation, lotPricePerKg } from '../domain/sellerPricing';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
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
  photo_url: string | null;
  start_price_per_kg: number | null;
  floor_price_per_kg: number | null;
  sale_mode: string;
  donation_opened: number;
  expires_at: Date;
  crop_name_th: string;
  base_shelf_days: number;
  lat: number;
  lng: number;
  plot_name: string;
  area_rai: number;
  farmer_name: string;
}

const MARKET_LOT_SELECT = `SELECT h.id, h.weight_kg, h.split_allowed, h.min_order_kg, h.order_step_kg,
              h.grade, h.ripeness, h.allow_donation, h.donation_audience, h.photo_url,
              h.start_price_per_kg, h.floor_price_per_kg, h.sale_mode, h.donation_opened, h.expires_at,
              c.name_th AS crop_name_th, c.base_shelf_days,
              p.lat, p.lng, p.name AS plot_name, p.area_rai, u.name AS farmer_name,
              COALESCE((
                SELECT SUM(o.quantity_kg) FROM orders o
                WHERE o.lot_id = h.id AND o.status IN ('reserved', 'picked', 'delivered')
              ), 0) AS reserved_kg
       FROM harvest_lots h
       JOIN crops c ON c.id = h.crop_id
       JOIN plots p ON p.id = h.plot_id
       JOIN users u ON u.id = p.farmer_id`;

function presentBuyerLot(
  row: MarketRow,
  viewer: { lat: number; lng: number } | null,
  now: number,
): {
  id: number;
  crop_name_th: string;
  farmer_name: string;
  plot_name: string;
  area_rai: number;
  photo_url: string | null;
  weight_kg: number;
  remaining_kg: number;
  split_allowed: boolean;
  min_order_kg: number;
  order_step_kg: number;
  grade: ProduceGrade;
  ripeness: number;
  available_as: ReturnType<typeof availableAs>;
  allow_donation: boolean;
  donation_audience: 'verified_org_only' | 'all_donors';
  expires_at: string;
  hours_left: number;
  distance_km: number | null;
  price_per_kg: number | null;
  lat: number;
  lng: number;
} {
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
  const plotLat = Number(row.lat);
  const plotLng = Number(row.lng);
  const distanceKm =
    viewer === null
      ? null
      : haversineKm({ lat: viewer.lat, lng: viewer.lng }, { lat: plotLat, lng: plotLng });
  return {
    id: Number(row.id),
    crop_name_th: row.crop_name_th,
    farmer_name: row.farmer_name,
    plot_name: row.plot_name,
    area_rai: Number(row.area_rai),
    photo_url: row.photo_url,
    weight_kg: weightKg,
    remaining_kg: remaining,
    split_allowed: Number(row.split_allowed) === 1,
    min_order_kg: Number(row.min_order_kg),
    order_step_kg: Number(row.order_step_kg),
    grade: row.grade,
    ripeness: Number(row.ripeness),
    available_as: availableAs(saleMode, row.donation_opened),
    allow_donation: acceptsDonation,
    donation_audience: row.donation_audience,
    expires_at: new Date(row.expires_at).toISOString(),
    hours_left: hoursLeft,
    distance_km: distanceKm,
    price_per_kg: pricePerKg,
    lat: plotLat,
    lng: plotLng,
  };
}

marketRouter.get(
  '/',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const radiusKm = query.radius_km ?? 15;
    const [rows] = await pool.query<MarketRow[]>(
      `${MARKET_LOT_SELECT}
       WHERE h.status IN ('open', 'partially_reserved') AND h.expires_at > UTC_TIMESTAMP()
       ORDER BY h.expires_at ASC, h.id ASC`,
    );
    const now = Date.now();
    const viewer = { lat: query.lat, lng: query.lng };
    const lots = rows
      .map((row) => presentBuyerLot(row, viewer, now))
      .filter(
        (lot) =>
          lot.distance_km !== null &&
          lot.distance_km <= radiusKm &&
          lot.hours_left > 0 &&
          lot.remaining_kg > 0,
      );
    res.json({ lots });
  }),
);

marketRouter.get(
  '/lots/:id',
  requireAuth,
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const lotId = z.coerce.number().int().positive().parse(req.params.id);
    const coords = z
      .object({
        lat: z.coerce.number().gte(-90).lte(90).optional(),
        lng: z.coerce.number().gte(-180).lte(180).optional(),
      })
      .parse(req.query);
    const [rows] = await pool.query<MarketRow[]>(
      `${MARKET_LOT_SELECT}
       WHERE h.id = ? AND h.status IN ('open', 'partially_reserved') AND h.expires_at > UTC_TIMESTAMP()`,
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
    const lot = presentBuyerLot(row, viewer, Date.now());
    if (lot.remaining_kg <= 0 || lot.hours_left <= 0) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
    }
    res.json({ lot });
  }),
);
