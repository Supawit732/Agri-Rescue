import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { evaluateDonationRequest, type DonationAudience, type DonorTier, type OrgStatus } from '../domain/donorRules';
import { haversineKm } from '../domain/geo';
import { remainingLotKg } from '../domain/lotInventory';
import type { ProduceGrade } from '../domain/pricing';
import { availableAs, lotAcceptsDonation, lotPricePerKg } from '../domain/sellerPricing';
import { usedDonationKgThisWeek } from '../donors/donationService';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { optionalAuth } from '../middleware/optionalAuth';
import { publicMarketRateLimit } from '../middleware/publicMarketRateLimit';
import { lotPhotoPublicUrl } from '../storage/publicUploads';

export const publicMarketRouter = Router();

publicMarketRouter.use(publicMarketRateLimit);
publicMarketRouter.use(optionalAuth);

const querySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90).optional(),
  lng: z.coerce.number().gte(-180).lte(180).optional(),
  radius_km: z.coerce.number().positive().max(200).optional(),
  crop_id: z.coerce.number().int().positive().optional(),
  category_id: z.coerce.number().int().positive().optional(),
  price_min: z.coerce.number().nonnegative().optional(),
  price_max: z.coerce.number().positive().optional(),
  max_hours: z.coerce.number().positive().optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['near', 'urgent', 'cheap']).optional(),
});

interface PublicMarketRow extends RowDataPacket {
  id: number;
  crop_id: number;
  farmer_id: number;
  shop_name: string | null;
  weight_kg: number;
  split_allowed: number;
  min_order_kg: number;
  order_step_kg: number;
  reserved_kg: number;
  grade: ProduceGrade;
  ripeness: number;
  donation_audience: DonationAudience;
  photo_url: string | null;
  start_price_per_kg: number | null;
  floor_price_per_kg: number | null;
  sale_mode: string;
  donation_opened: number;
  market_price_snapshot: number | null;
  expires_at: Date;
  crop_name_th: string;
  crop_name_en: string | null;
  base_shelf_days: number;
  lat: number;
  lng: number;
  plot_name: string;
}

const PUBLIC_LOT_SELECT = `SELECT h.id, h.crop_id, p.farmer_id, s.name AS shop_name,
              h.weight_kg, h.split_allowed, h.min_order_kg, h.order_step_kg,
              h.grade, h.ripeness, h.donation_audience, h.photo_url,
              h.start_price_per_kg, h.floor_price_per_kg, h.sale_mode, h.donation_opened,
              h.market_price_snapshot, h.expires_at,
              c.name_th AS crop_name_th, c.name_en AS crop_name_en, c.base_shelf_days,
              p.lat, p.lng, p.name AS plot_name,
              COALESCE((
                SELECT SUM(o.quantity_kg) FROM orders o
                WHERE o.lot_id = h.id AND o.status IN ('reserved', 'picked', 'delivered')
              ), 0) AS reserved_kg
       FROM harvest_lots h
       JOIN crops c ON c.id = h.crop_id
       JOIN plots p ON p.id = h.plot_id
       LEFT JOIN shops s ON s.user_id = p.farmer_id`;

/** Round distance to nearest 0.5 km (D023). */
export function roundDistanceKm(km: number): number {
  return Math.round(km * 2) / 2;
}

export interface PublicLotView {
  id: number;
  crop_id: number;
  farmer_id: number;
  shop_name: string | null;
  crop_name_th: string;
  crop_name_en: string | null;
  plot_name: string;
  photos: string[];
  photo_url: string | null;
  weight_kg: number;
  remaining_kg: number;
  split_allowed: boolean;
  min_order_kg: number;
  order_step_kg: number;
  grade: ProduceGrade;
  ripeness: number;
  available_as: ReturnType<typeof availableAs>;
  price_per_kg: number | null;
  market_price_per_kg: number | null;
  expires_at: string;
  hours_left: number;
  distance_km: number | null;
  donation_audience?: DonationAudience;
  can_request_donation?: boolean;
  reason?: string | null;
}

interface ViewerDonorHints {
  donor_tier: DonorTier | null;
  org_status: OrgStatus;
  donation_suspended: boolean;
  beneficiary_count: number | null;
  usedKg: number;
}

async function loadPhotosByLotIds(lotIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (lotIds.length === 0) {
    return map;
  }
  const placeholders = lotIds.map(() => '?').join(',');
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT lot_id, path FROM lot_photos WHERE lot_id IN (${placeholders}) ORDER BY id ASC`,
    lotIds,
  );
  for (const row of rows) {
    const lotId = Number(row.lot_id);
    const url = lotPhotoPublicUrl(String(row.path));
    const list = map.get(lotId) ?? [];
    list.push(url);
    map.set(lotId, list);
  }
  return map;
}

function buildPhotos(primaryUrl: string | null, extra: string[] | undefined): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined): void => {
    if (url === null || url === undefined || url === '') {
      return;
    }
    const normalized = url.startsWith('/uploads/') || url.startsWith('http') ? url : lotPhotoPublicUrl(url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  };
  push(primaryUrl);
  for (const path of extra ?? []) {
    push(path);
  }
  return urls;
}

function presentPublicLot(
  row: PublicMarketRow,
  photos: string[] | undefined,
  viewer: { lat: number; lng: number } | null,
  now: number,
  donor: ViewerDonorHints | null,
): PublicLotView {
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
      : roundDistanceKm(haversineKm({ lat: viewer.lat, lng: viewer.lng }, { lat: plotLat, lng: plotLng }));
  const photoList = buildPhotos(row.photo_url, photos);
  const available = availableAs(saleMode, row.donation_opened);
  const marketPrice =
    row.market_price_snapshot === null || row.market_price_snapshot === undefined
      ? null
      : Number(row.market_price_snapshot);

  const view: PublicLotView = {
    id: Number(row.id),
    crop_id: Number(row.crop_id),
    farmer_id: Number(row.farmer_id),
    shop_name: row.shop_name === null || row.shop_name === undefined || row.shop_name === ''
      ? null
      : String(row.shop_name),
    crop_name_th: row.crop_name_th,
    crop_name_en: row.crop_name_en === null || row.crop_name_en === '' ? null : String(row.crop_name_en),
    plot_name: row.plot_name,
    photos: photoList,
    photo_url: photoList[0] ?? row.photo_url,
    weight_kg: weightKg,
    remaining_kg: remaining,
    split_allowed: Number(row.split_allowed) === 1,
    min_order_kg: Number(row.min_order_kg),
    order_step_kg: Number(row.order_step_kg),
    grade: row.grade,
    ripeness: Number(row.ripeness),
    available_as: available,
    price_per_kg: pricePerKg,
    market_price_per_kg: marketPrice,
    expires_at: new Date(row.expires_at).toISOString(),
    hours_left: hoursLeft,
    distance_km: distanceKm,
  };

  if (donor !== null && available.includes('donate')) {
    view.donation_audience = row.donation_audience;
    const verdict = evaluateDonationRequest({
      allowDonation: acceptsDonation,
      audience: row.donation_audience,
      lotWeightKg: remaining > 0 ? Math.min(remaining, Number(row.min_order_kg) || 1) : remaining,
      usedKg: donor.usedKg,
      donor_tier: donor.donor_tier,
      org_status: donor.org_status,
      donation_suspended: donor.donation_suspended,
      beneficiary_count: donor.beneficiary_count,
    });
    if (verdict.ok) {
      view.can_request_donation = true;
      view.reason = null;
    } else {
      view.can_request_donation = false;
      view.reason = verdict.message;
    }
  }

  return view;
}

async function loadViewerDonor(userId: number): Promise<ViewerDonorHints | null> {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT donor_tier, org_status, donation_suspended, beneficiary_count
       FROM buyer_profiles WHERE user_id = ?`,
      [userId],
    );
    const row = rows[0];
    if (row === undefined) {
      return {
        donor_tier: null,
        org_status: 'none',
        donation_suspended: false,
        beneficiary_count: null,
        usedKg: 0,
      };
    }
    const usedKg = await usedDonationKgThisWeek(connection, userId);
    return {
      donor_tier: (row.donor_tier as DonorTier | null) ?? null,
      org_status: (row.org_status as OrgStatus) ?? 'none',
      donation_suspended: Number(row.donation_suspended) === 1,
      beneficiary_count: row.beneficiary_count === null ? null : Number(row.beneficiary_count),
      usedKg,
    };
  } finally {
    connection.release();
  }
}

function sortLots(
  lots: PublicLotView[],
  sort: 'near' | 'urgent' | 'cheap',
  hasCoords: boolean,
): PublicLotView[] {
  const copy = [...lots];
  const effective = sort === 'near' && !hasCoords ? 'urgent' : sort;
  if (effective === 'near') {
    copy.sort((a, b) => {
      const da = a.distance_km ?? Number.POSITIVE_INFINITY;
      const db = b.distance_km ?? Number.POSITIVE_INFINITY;
      if (da !== db) {
        return da - db;
      }
      return a.id - b.id;
    });
  } else if (effective === 'cheap') {
    copy.sort((a, b) => {
      const pa = a.price_per_kg;
      const pb = b.price_per_kg;
      if (pa === null && pb === null) {
        return a.id - b.id;
      }
      if (pa === null) {
        return 1;
      }
      if (pb === null) {
        return -1;
      }
      if (pa !== pb) {
        return pa - pb;
      }
      return a.id - b.id;
    });
  } else {
    copy.sort((a, b) => {
      const ta = new Date(a.expires_at).getTime();
      const tb = new Date(b.expires_at).getTime();
      if (ta !== tb) {
        return ta - tb;
      }
      return a.id - b.id;
    });
  }
  return copy;
}

publicMarketRouter.get(
  '/market',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const hasCoords = query.lat !== undefined && query.lng !== undefined;
    if ((query.lat !== undefined) !== (query.lng !== undefined)) {
      throw new HttpError(400, 'VALIDATION', 'ต้องส่ง lat และ lng คู่กัน');
    }
    const sort = query.sort ?? 'urgent';
    const radiusKm = query.radius_km ?? 15;
    if (query.price_min !== undefined && query.price_max !== undefined && query.price_min > query.price_max) {
      throw new HttpError(400, 'VALIDATION', 'ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด');
    }
    const params: unknown[] = [];
    let lotFilter = '';
    if (query.crop_id !== undefined) {
      lotFilter += ' AND h.crop_id = ?';
      params.push(query.crop_id);
    }
    if (query.category_id !== undefined) {
      lotFilter += ' AND c.category_id = ?';
      params.push(query.category_id);
    }
    const [rows] = await pool.query<PublicMarketRow[]>(
      `${PUBLIC_LOT_SELECT}
       WHERE h.status IN ('open', 'partially_reserved') AND h.expires_at > UTC_TIMESTAMP()
         AND h.deleted_at IS NULL${lotFilter}
       ORDER BY h.expires_at ASC, h.id ASC`,
      params,
    );
    const now = Date.now();
    const viewer = hasCoords ? { lat: query.lat as number, lng: query.lng as number } : null;
    const donor =
      req.auth !== undefined ? await loadViewerDonor(req.auth.id) : null;
    const photoMap = await loadPhotosByLotIds(rows.map((r) => Number(r.id)));
    let lots = rows
      .map((row) => presentPublicLot(row, photoMap.get(Number(row.id)), viewer, now, donor))
      .filter((lot) => lot.hours_left > 0 && lot.remaining_kg > 0);
    if (hasCoords) {
      lots = lots.filter((lot) => lot.distance_km !== null && lot.distance_km <= radiusKm);
    }
    if (query.price_min !== undefined) {
      const min = query.price_min;
      lots = lots.filter((lot) => lot.price_per_kg !== null && lot.price_per_kg >= min);
    }
    if (query.price_max !== undefined) {
      const max = query.price_max;
      lots = lots.filter((lot) => lot.price_per_kg !== null && lot.price_per_kg <= max);
    }
    if (query.max_hours !== undefined) {
      const maxHours = query.max_hours;
      lots = lots.filter((lot) => lot.hours_left <= maxHours);
    }
    if (query.q !== undefined && query.q.trim() !== '') {
      const q = query.q.trim().toLowerCase();
      lots = lots.filter((lot) => {
        const cropTh = lot.crop_name_th.toLowerCase();
        const cropEn = (lot.crop_name_en ?? '').toLowerCase();
        const shop = (lot.shop_name ?? '').toLowerCase();
        return cropTh.includes(q) || cropEn.includes(q) || (q.length > 0 && shop.includes(q));
      });
    }
    lots = sortLots(lots, sort, hasCoords);
    res.json({ lots });
  }),
);

publicMarketRouter.get(
  '/lots/:id',
  asyncHandler(async (req, res) => {
    const lotId = z.coerce.number().int().positive().parse(req.params.id);
    const coords = z
      .object({
        lat: z.coerce.number().gte(-90).lte(90).optional(),
        lng: z.coerce.number().gte(-180).lte(180).optional(),
      })
      .parse(req.query);
    if ((coords.lat !== undefined) !== (coords.lng !== undefined)) {
      throw new HttpError(400, 'VALIDATION', 'ต้องส่ง lat และ lng คู่กัน');
    }
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
    const donor = req.auth !== undefined ? await loadViewerDonor(req.auth.id) : null;
    const photoMap = await loadPhotosByLotIds([lotId]);
    const lot = presentPublicLot(row, photoMap.get(lotId), viewer, Date.now(), donor);
    if (lot.remaining_kg <= 0 || lot.hours_left <= 0) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
    }
    res.json({ lot });
  }),
);
