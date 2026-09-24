import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { assessRipenessFromPhoto, loadVisionConfig } from '../ai/vision';
import { pool } from '../db/pool';
import { haversineKm } from '../domain/geo';
import { remainingLotKg, validateLotWeightPatch } from '../domain/lotInventory';
import { assertLotTransition, type LotStatus } from '../domain/lotStateMachine';
import type { ProduceGrade } from '../domain/pricing';
import {
  PRICING_CONFIG,
  lotAcceptsDonation,
  lotPricePerKg,
  priceForecastRows,
  suggestedFloorPrice,
  suggestedStartPrice,
  validateSellerPrices,
} from '../domain/sellerPricing';
import { predictShelfHours } from '../domain/shelfLife';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';
import { sumReservedQuantityKg } from '../orders/lotInventoryService';
import { defaultLotPrices, resolveMarketPrice } from '../pricing/referencePrices';
import { fetchWeather, WEATHER_BASIS } from '../weather/openMeteo';

export const lotsRouter = Router();

const gradeSchema = z.enum(['normal', 'substandard']);
const saleModeSchema = z.enum(['sell', 'donate', 'sell_then_donate']);
const donationAudienceSchema = z.enum(['verified_org_only', 'all_donors']);

const estimateSchema = z.object({
  crop_id: z.number().int().positive(),
  ripeness: z.number().int().min(0).max(4),
  grade: gradeSchema,
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  start_price_per_kg: z.number().positive().optional(),
  floor_price_per_kg: z.number().positive().optional(),
});

const assessPhotoSchema = z.object({
  crop_id: z.number().int().positive(),
  image_base64: z.string().min(1, 'กรุณาส่งรูป'),
  mime: z.enum(['image/jpeg', 'image/png']),
});

const createSchema = z.object({
  plot_id: z.number().int().positive(),
  crop_id: z.number().int().positive(),
  weight_kg: z.number().positive(),
  split_allowed: z.boolean().optional(),
  min_order_kg: z.number().positive().optional(),
  order_step_kg: z.number().positive().optional(),
  grade: gradeSchema,
  ripeness: z.number().int().min(0).max(4),
  sale_mode: saleModeSchema,
  donation_audience: donationAudienceSchema.optional(),
  start_price_per_kg: z.number().nonnegative().nullable().optional(),
  floor_price_per_kg: z.number().nonnegative().nullable().optional(),
  photo_url: z.string().max(1024).nullable().optional(),
  ai_ripeness: z.number().int().min(0).max(4).nullable().optional(),
  ai_confidence: z.number().min(0).max(1).nullable().optional(),
  ai_model: z.string().max(128).nullable().optional(),
});

const patchSchema = z.object({
  weight_kg: z.number().positive().optional(),
  split_allowed: z.boolean().optional(),
  min_order_kg: z.number().positive().optional(),
  order_step_kg: z.number().positive().optional(),
  grade: gradeSchema.optional(),
  photo_url: z.string().max(1024).nullable().optional(),
  start_price_per_kg: z.number().nonnegative().nullable().optional(),
  floor_price_per_kg: z.number().nonnegative().nullable().optional(),
  sale_mode: saleModeSchema.optional(),
  donation_audience: donationAudienceSchema.optional(),
  ripeness: z.number().int().min(0).max(4).optional(),
  ai_ripeness: z.number().int().min(0).max(4).optional(),
  confirm_ripeness_photo: z.boolean().optional(),
});

interface CropRow extends RowDataPacket {
  id: number;
  name_th: string;
  base_shelf_days: number;
  market_price_per_kg: number;
  normal_features_th: string | null;
  defect_examples_th: string | null;
}

interface OwnedLotRow extends RowDataPacket {
  id: number;
  plot_id: number;
  crop_id: number;
  weight_kg: number;
  split_allowed: number;
  min_order_kg: number;
  order_step_kg: number;
  grade: ProduceGrade;
  ripeness: number;
  photo_url: string | null;
  allow_donation: number;
  donation_audience: 'verified_org_only' | 'all_donors';
  start_price_per_kg: number | null;
  floor_price_per_kg: number | null;
  sale_mode: 'sell' | 'donate' | 'sell_then_donate';
  donation_opened: number;
  market_price_snapshot: number | null;
  market_price_is_estimate: number;
  market_price_as_of: Date | null;
  predicted_shelf_hours: number;
  expires_at: Date;
  status: string;
  deleted_at: Date | null;
  farmer_id: number;
  base_shelf_days: number;
  plot_lat: number;
  plot_lng: number;
}

lotsRouter.use(requireAuth, requireCapability('sell'));

lotsRouter.post(
  '/estimate',
  asyncHandler(async (req, res) => {
    const body = estimateSchema.parse(req.body);
    const crop = await findCrop(body.crop_id);
    const weather = await fetchWeather(body.lat, body.lng);
    const shelfHours = predictShelfHours(
      crop.base_shelf_days,
      body.ripeness,
      weather.tempC,
      weather.humidity,
    );
    const market = await resolveMarketPrice(body.crop_id);
    const suggestedStart = suggestedStartPrice(market.price_per_kg, body.grade);
    const suggestedFloor = suggestedFloorPrice(suggestedStart);
    const start = body.start_price_per_kg ?? suggestedStart;
    const floor = body.floor_price_per_kg ?? suggestedFloor;
    const baseShelfHours = crop.base_shelf_days * 24;
    const pricePerKg = lotPricePerKg({
      startPricePerKg: start,
      floorPricePerKg: floor,
      baseShelfHours,
      hoursLeft: shelfHours,
    });
    const nearbyMedian = await nearbySameCropMedianPrice({
      cropId: body.crop_id,
      lat: body.lat,
      lng: body.lng,
    });
    res.json({
      shelf_hours: shelfHours,
      price_per_kg: pricePerKg,
      suggested_start_price_per_kg: suggestedStart,
      suggested_floor_price_per_kg: suggestedFloor,
      market_quote: {
        label_th: market.label_th,
        price_per_kg: market.price_per_kg,
        is_estimate: market.is_estimate,
        as_of: market.as_of,
        source: market.source,
      },
      forecast: priceForecastRows({
        startPricePerKg: start,
        floorPricePerKg: floor,
        baseShelfHours,
        hoursLeftNow: shelfHours,
      }),
      nearby_median_price_per_kg: nearbyMedian,
      temp_c: weather.tempC,
      humidity: weather.humidity,
      weather_source: weather.fallback ? 'fallback' : 'live',
      weather_basis: WEATHER_BASIS,
    });
  }),
);

lotsRouter.post(
  '/assess-photo',
  asyncHandler(async (req, res) => {
    const body = assessPhotoSchema.parse(req.body);
    const crop = await findCrop(body.crop_id);
    const result = await assessRipenessFromPhoto({
      cropNameTh: crop.name_th,
      imageBase64: body.image_base64,
      mime: body.mime,
      normalFeaturesTh: crop.normal_features_th,
      defectExamplesTh: crop.defect_examples_th,
    });
    res.json(result);
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
    const shelfHours = predictShelfHours(
      crop.base_shelf_days,
      body.ripeness,
      weather.tempC,
      weather.humidity,
    );
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + shelfHours * 60 * 60 * 1000);
    const market = await resolveMarketPrice(body.crop_id);
    const priced = resolveCreatePrices({
      saleMode: body.sale_mode,
      grade: body.grade,
      marketPricePerKg: market.price_per_kg,
      start: body.start_price_per_kg,
      floor: body.floor_price_per_kg,
    });
    const allowDonation = body.sale_mode === 'donate' ? 1 : 0;
    const donationAudience = body.donation_audience ?? 'verified_org_only';
    const hasAi =
      body.ai_ripeness !== undefined &&
      body.ai_ripeness !== null &&
      body.ai_confidence !== undefined &&
      body.ai_confidence !== null;
    const method = hasAi && body.ai_ripeness === body.ripeness ? 'model' : 'rule';
    const aiModel = hasAi ? (body.ai_model ?? loadVisionConfig().model) : null;
    const splitAllowed = body.split_allowed !== false;
    const minOrderKg = body.min_order_kg ?? 1;
    const orderStepKg = body.order_step_kg ?? 1;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [lotResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO harvest_lots (
           plot_id, crop_id, weight_kg, split_allowed, min_order_kg, order_step_kg,
           grade, ripeness, photo_url, allow_donation, donation_audience,
           start_price_per_kg, floor_price_per_kg, sale_mode, donation_opened,
           market_price_snapshot, market_price_is_estimate, market_price_as_of,
           predicted_shelf_hours, expires_at, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'open', ?)`,
        [
          body.plot_id,
          body.crop_id,
          body.weight_kg,
          splitAllowed ? 1 : 0,
          minOrderKg,
          orderStepKg,
          body.grade,
          body.ripeness,
          body.photo_url ?? null,
          allowDonation,
          donationAudience,
          priced.start,
          priced.floor,
          body.sale_mode,
          market.price_per_kg,
          market.is_estimate ? 1 : 0,
          market.as_of,
          shelfHours,
          expiresAt,
          createdAt,
        ],
      );
      const [assessmentResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO quality_assessments
           (lot_id, method, ripeness, temp_c, humidity, predicted_shelf_hours,
            ai_ripeness, ai_confidence, ai_model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lotResult.insertId,
          method,
          body.ripeness,
          weather.tempC,
          weather.humidity,
          shelfHours,
          hasAi ? body.ai_ripeness : null,
          hasAi ? body.ai_confidence : null,
          aiModel,
          createdAt,
        ],
      );
      await connection.commit();
      const pricePerKg =
        body.sale_mode === 'donate'
          ? 0
          : lotPricePerKg({
              startPricePerKg: Number(priced.start),
              floorPricePerKg: Number(priced.floor),
              baseShelfHours: crop.base_shelf_days * 24,
              hoursLeft: shelfHours,
            });
      res.status(201).json({
        lot: {
          id: lotResult.insertId,
          plot_id: body.plot_id,
          crop_id: body.crop_id,
          weight_kg: body.weight_kg,
          split_allowed: splitAllowed,
          min_order_kg: minOrderKg,
          order_step_kg: orderStepKg,
          remaining_kg: body.weight_kg,
          grade: body.grade,
          ripeness: body.ripeness,
          photo_url: body.photo_url ?? null,
          sale_mode: body.sale_mode,
          allow_donation: allowDonation === 1,
          donation_audience: donationAudience,
          donation_opened: false,
          start_price_per_kg: priced.start,
          floor_price_per_kg: priced.floor,
          market_price_snapshot: market.price_per_kg,
          market_price_is_estimate: market.is_estimate,
          market_price_as_of: market.as_of,
          predicted_shelf_hours: shelfHours,
          expires_at: expiresAt.toISOString(),
          status: 'open',
          price_per_kg: pricePerKg,
        },
        assessment: {
          id: assessmentResult.insertId,
          lot_id: lotResult.insertId,
          method,
          ripeness: body.ripeness,
          temp_c: weather.tempC,
          humidity: weather.humidity,
          predicted_shelf_hours: shelfHours,
          ai_ripeness: hasAi ? body.ai_ripeness : null,
          ai_confidence: hasAi ? body.ai_confidence : null,
          ai_model: aiModel,
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

lotsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const lotId = z.coerce.number().int().positive().parse(req.params.id);
    const body = patchSchema.parse(req.body);
    const farmerId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const lot = await findOwnedLotForUpdate(connection, lotId);
      if (Number(lot.farmer_id) !== farmerId) {
        throw new HttpError(403, 'FORBIDDEN', 'ดูหรือแก้ไขได้เฉพาะล็อตของตนเอง');
      }
      if (lot.status !== 'open' && lot.status !== 'partially_reserved') {
        throw new HttpError(409, 'CONFLICT', 'แก้ไขได้เฉพาะล็อตที่ยังมีคงเหลือ');
      }

      const updates: Record<string, unknown> = {};
      const logs: { field: string; oldValue: string | null; newValue: string | null }[] = [];

      const noteChange = (field: string, oldVal: unknown, newVal: unknown): void => {
        const oldStr = oldVal === null || oldVal === undefined ? null : String(oldVal);
        const newStr = newVal === null || newVal === undefined ? null : String(newVal);
        if (oldStr === newStr) {
          return;
        }
        logs.push({ field, oldValue: oldStr, newValue: newStr });
      };

      if (body.weight_kg !== undefined) {
        if (body.weight_kg > Number(lot.weight_kg) + 1e-9) {
          throw new HttpError(400, 'VALIDATION', 'น้ำหนักลดได้เท่านั้น', {
            weight_kg: 'น้ำหนักลดได้เท่านั้น — ห้ามเพิ่มน้ำหนักหลังลงประกาศ',
          });
        }
        const reservedSum = await sumReservedQuantityKg(connection, lot.id);
        const weightCheck = validateLotWeightPatch({
          nextWeightKg: body.weight_kg,
          reservedKgSum: reservedSum,
        });
        if (!weightCheck.ok) {
          throw new HttpError(400, 'VALIDATION', weightCheck.message, { weight_kg: weightCheck.message });
        }
        noteChange('weight_kg', lot.weight_kg, body.weight_kg);
        updates.weight_kg = body.weight_kg;
      }

      if (body.split_allowed !== undefined) {
        noteChange('split_allowed', lot.split_allowed, body.split_allowed ? 1 : 0);
        updates.split_allowed = body.split_allowed ? 1 : 0;
      }
      if (body.min_order_kg !== undefined) {
        noteChange('min_order_kg', lot.min_order_kg, body.min_order_kg);
        updates.min_order_kg = body.min_order_kg;
      }
      if (body.order_step_kg !== undefined) {
        noteChange('order_step_kg', lot.order_step_kg, body.order_step_kg);
        updates.order_step_kg = body.order_step_kg;
      }

      if (body.grade !== undefined) {
        noteChange('grade', lot.grade, body.grade);
        updates.grade = body.grade;
      }

      if (body.photo_url !== undefined) {
        noteChange('photo_url', lot.photo_url, body.photo_url);
        updates.photo_url = body.photo_url;
      }

      if (body.donation_audience !== undefined) {
        noteChange('donation_audience', lot.donation_audience, body.donation_audience);
        updates.donation_audience = body.donation_audience;
      }

      const nextSaleMode = body.sale_mode ?? lot.sale_mode;
      const nextGrade = (body.grade ?? lot.grade) as ProduceGrade;
      let nextStart =
        body.start_price_per_kg !== undefined
          ? body.start_price_per_kg
          : lot.start_price_per_kg === null
            ? null
            : Number(lot.start_price_per_kg);
      let nextFloor =
        body.floor_price_per_kg !== undefined
          ? body.floor_price_per_kg
          : lot.floor_price_per_kg === null
            ? null
            : Number(lot.floor_price_per_kg);

      if (body.sale_mode !== undefined && body.sale_mode !== lot.sale_mode) {
        noteChange('sale_mode', lot.sale_mode, body.sale_mode);
        updates.sale_mode = body.sale_mode;
        if (body.sale_mode === 'donate') {
          nextStart = null;
          nextFloor = null;
          updates.allow_donation = 1;
          noteChange('allow_donation', lot.allow_donation, 1);
        } else {
          const marketPrice =
            lot.market_price_snapshot === null
              ? (await resolveMarketPrice(Number(lot.crop_id))).price_per_kg
              : Number(lot.market_price_snapshot);
          if (nextStart === null || nextFloor === null) {
            const defaults = defaultLotPrices(marketPrice, nextGrade);
            nextStart = nextStart ?? defaults.start;
            nextFloor = nextFloor ?? defaults.floor;
          }
          updates.allow_donation = body.sale_mode === 'sell' ? 0 : Number(lot.donation_opened) === 1 ? 1 : 0;
          noteChange('allow_donation', lot.allow_donation, updates.allow_donation);
        }
      } else if (nextSaleMode === 'donate') {
        updates.allow_donation = 1;
      }

      if (nextSaleMode !== 'donate') {
        const marketPrice =
          lot.market_price_snapshot === null
            ? (await resolveMarketPrice(Number(lot.crop_id))).price_per_kg
            : Number(lot.market_price_snapshot);
        if (nextStart === null || nextFloor === null) {
          throw new HttpError(400, 'VALIDATION', 'กรุณาระบุราคาเริ่มและราคาต่ำสุด', {
            start_price_per_kg: 'กรุณาระบุราคาเริ่ม',
            floor_price_per_kg: 'กรุณาระบุราคาต่ำสุด',
          });
        }
        assertValidPrices(marketPrice, nextStart, nextFloor);
        if (body.start_price_per_kg !== undefined || body.sale_mode !== undefined) {
          noteChange('start_price_per_kg', lot.start_price_per_kg, nextStart);
          updates.start_price_per_kg = nextStart;
        }
        if (body.floor_price_per_kg !== undefined || body.sale_mode !== undefined) {
          noteChange('floor_price_per_kg', lot.floor_price_per_kg, nextFloor);
          updates.floor_price_per_kg = nextFloor;
        }
      } else {
        if (body.start_price_per_kg !== undefined || body.floor_price_per_kg !== undefined || body.sale_mode === 'donate') {
          noteChange('start_price_per_kg', lot.start_price_per_kg, null);
          noteChange('floor_price_per_kg', lot.floor_price_per_kg, null);
          updates.start_price_per_kg = null;
          updates.floor_price_per_kg = null;
        }
      }

      if (body.ripeness !== undefined && body.ripeness !== Number(lot.ripeness)) {
        const oldRipe = Number(lot.ripeness);
        const newRipe = body.ripeness;
        if (newRipe < oldRipe) {
          if (body.confirm_ripeness_photo !== true) {
            throw new HttpError(400, 'VALIDATION', 'ลดระดับความสุกต้องยืนยันด้วยรูปที่ประเมินแล้ว', {
              ripeness: 'ลดความสุกต้องถ่าย/อัปโหลดรูปใหม่แล้วให้ AI ประเมินก่อน',
            });
          }
          if (body.ai_ripeness === undefined || body.ai_ripeness !== newRipe) {
            throw new HttpError(400, 'VALIDATION', 'ค่าความสุกต้องตรงกับผลการประเมินจากรูป', {
              ripeness: 'ค่าความสุกต้องตรงกับผลการประเมินจากรูปใหม่',
            });
          }
          const weather = await fetchWeather(Number(lot.plot_lat), Number(lot.plot_lng));
          const shelfHours = predictShelfHours(
            Number(lot.base_shelf_days),
            newRipe,
            weather.tempC,
            weather.humidity,
          );
          const oldExpires = new Date(lot.expires_at);
          let newExpires = new Date(Date.now() + shelfHours * 60 * 60 * 1000);
          if (newExpires.getTime() > oldExpires.getTime()) {
            newExpires = oldExpires;
          }
          noteChange('ripeness', oldRipe, newRipe);
          noteChange('expires_at', oldExpires.toISOString(), newExpires.toISOString());
          noteChange('predicted_shelf_hours', lot.predicted_shelf_hours, shelfHours);
          updates.ripeness = newRipe;
          updates.expires_at = newExpires;
          updates.predicted_shelf_hours = shelfHours;
        } else {
          noteChange('ripeness', oldRipe, newRipe);
          updates.ripeness = newRipe;
        }
      }

      if (Object.keys(updates).length === 0) {
        await connection.commit();
        res.json({ lot: await presentLot(lotId) });
        return;
      }

      const setClauses = Object.keys(updates).map((key) => `${key} = ?`);
      const values = Object.values(updates);
      await connection.query(`UPDATE harvest_lots SET ${setClauses.join(', ')} WHERE id = ?`, [
        ...values,
        lotId,
      ]);
      for (const log of logs) {
        await connection.query(
          `INSERT INTO lot_edit_logs (lot_id, editor_id, field_name, old_value, new_value)
           VALUES (?, ?, ?, ?, ?)`,
          [lotId, farmerId, log.field, log.oldValue, log.newValue],
        );
      }
      await connection.commit();
      res.json({ lot: await presentLot(lotId) });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

lotsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const lotId = z.coerce.number().int().positive().parse(req.params.id);
    const farmerId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const lot = await findOwnedLotForUpdate(connection, lotId);
      if (Number(lot.farmer_id) !== farmerId) {
        throw new HttpError(403, 'FORBIDDEN', 'ลบได้เฉพาะล็อตของตนเอง');
      }
      if (lot.deleted_at !== null && lot.deleted_at !== undefined) {
        throw new HttpError(409, 'CONFLICT', 'ล็อตนี้ถูกลบแล้ว');
      }
      if (lot.status !== 'open' && lot.status !== 'partially_reserved') {
        throw new HttpError(409, 'CONFLICT', 'ลบได้เฉพาะล็อตที่ยังเปิดขาย');
      }
      const [activeOrders] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM orders WHERE lot_id = ? AND status <> 'cancelled'`,
        [lotId],
      );
      if (Number(activeOrders[0]?.total ?? 0) > 0) {
        throw new HttpError(409, 'HAS_ORDERS', 'ลบไม่ได้เพราะมีคำสั่งซื้อแล้ว');
      }
      assertLotTransition(lot.status as LotStatus, 'cancelled');
      const snapshot = {
        id: Number(lot.id),
        plot_id: Number(lot.plot_id),
        crop_id: Number(lot.crop_id),
        weight_kg: Number(lot.weight_kg),
        grade: lot.grade,
        ripeness: Number(lot.ripeness),
        sale_mode: lot.sale_mode,
        status: lot.status,
        start_price_per_kg:
          lot.start_price_per_kg === null ? null : Number(lot.start_price_per_kg),
        floor_price_per_kg:
          lot.floor_price_per_kg === null ? null : Number(lot.floor_price_per_kg),
        expires_at: new Date(lot.expires_at).toISOString(),
      };
      await connection.query(
        `UPDATE harvest_lots SET status = 'cancelled', deleted_at = UTC_TIMESTAMP() WHERE id = ?`,
        [lotId],
      );
      await connection.query(
        `INSERT INTO lot_delete_logs (lot_id, farmer_id, reason, snapshot_json)
         VALUES (?, ?, ?, ?)`,
        [lotId, farmerId, 'seller_soft_delete', JSON.stringify(snapshot)],
      );
      await connection.commit();
      res.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

function resolveCreatePrices(input: {
  saleMode: 'sell' | 'donate' | 'sell_then_donate';
  grade: ProduceGrade;
  marketPricePerKg: number;
  start?: number | null;
  floor?: number | null;
}): { start: number | null; floor: number | null } {
  if (input.saleMode === 'donate') {
    if (
      (input.start !== undefined && input.start !== null && input.start > 0) ||
      (input.floor !== undefined && input.floor !== null && input.floor > 0)
    ) {
      throw new HttpError(400, 'VALIDATION', 'โหมดบริจาคต้องไม่มีราคาซื้อ', {
        sale_mode: 'โหมดบริจาคต้องไม่มีราคาซื้อ',
        start_price_per_kg: 'โหมดบริจาคต้องเว้นราคาเริ่ม',
        floor_price_per_kg: 'โหมดบริจาคต้องเว้นราคาต่ำสุด',
      });
    }
    return { start: null, floor: null };
  }
  const defaults = defaultLotPrices(input.marketPricePerKg, input.grade);
  const start = input.start === undefined || input.start === null ? defaults.start : input.start;
  const floor = input.floor === undefined || input.floor === null ? defaults.floor : input.floor;
  assertValidPrices(input.marketPricePerKg, start, floor);
  return { start, floor };
}

function assertValidPrices(marketPricePerKg: number, start: number, floor: number): void {
  const result = validateSellerPrices({
    marketPricePerKg,
    startPricePerKg: start,
    floorPricePerKg: floor,
  });
  if (!result.ok) {
    const fields: Record<string, string> = {};
    if (result.error === 'start_above_market') {
      fields.start_price_per_kg = result.message;
    } else if (result.error === 'floor_above_start') {
      fields.floor_price_per_kg = result.message;
    } else {
      fields.floor_price_per_kg = result.message;
      fields.sale_mode = 'ราคาต่ำเกินไป — ลองโหมดบริจาค';
    }
    throw new HttpError(400, result.error.toUpperCase(), result.message, fields);
  }
}

async function nearbySameCropMedianPrice(input: {
  cropId: number;
  lat: number;
  lng: number;
}): Promise<number | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT h.start_price_per_kg, h.floor_price_per_kg, h.sale_mode, h.expires_at,
            c.base_shelf_days, p.lat, p.lng
     FROM harvest_lots h
     JOIN crops c ON c.id = h.crop_id
     JOIN plots p ON p.id = h.plot_id
     WHERE h.crop_id = ? AND h.status IN ('open', 'partially_reserved') AND h.expires_at > UTC_TIMESTAMP()
       AND h.deleted_at IS NULL
       AND h.sale_mode <> 'donate'
       AND h.start_price_per_kg IS NOT NULL AND h.floor_price_per_kg IS NOT NULL`,
    [input.cropId],
  );
  const now = Date.now();
  const prices: number[] = [];
  for (const row of rows) {
    const distanceKm = haversineKm(
      { lat: input.lat, lng: input.lng },
      { lat: Number(row.lat), lng: Number(row.lng) },
    );
    if (distanceKm > PRICING_CONFIG.medianRadiusKm) {
      continue;
    }
    const hoursLeft = (new Date(row.expires_at).getTime() - now) / (60 * 60 * 1000);
    if (hoursLeft <= 0) {
      continue;
    }
    prices.push(
      lotPricePerKg({
        startPricePerKg: Number(row.start_price_per_kg),
        floorPricePerKg: Number(row.floor_price_per_kg),
        baseShelfHours: Number(row.base_shelf_days) * 24,
        hoursLeft,
      }),
    );
  }
  if (prices.length < PRICING_CONFIG.medianMinLots) {
    return null;
  }
  return median(prices);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 100) / 100;
  }
  return sorted[mid]!;
}

async function findCrop(cropId: number): Promise<CropRow> {
  const [rows] = await pool.query<CropRow[]>(
    `SELECT id, name_th, base_shelf_days, market_price_per_kg,
            normal_features_th, defect_examples_th
     FROM crops WHERE id = ?`,
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

async function findOwnedLotForUpdate(
  connection: import('mysql2/promise').PoolConnection,
  lotId: number,
): Promise<OwnedLotRow> {
  const [rows] = await connection.query<OwnedLotRow[]>(
    `SELECT h.id, h.plot_id, h.crop_id, h.weight_kg, h.split_allowed, h.min_order_kg, h.order_step_kg,
            h.grade, h.ripeness, h.photo_url,
            h.allow_donation, h.donation_audience, h.start_price_per_kg, h.floor_price_per_kg,
            h.sale_mode, h.donation_opened, h.market_price_snapshot, h.market_price_is_estimate,
            h.market_price_as_of, h.predicted_shelf_hours, h.expires_at, h.status, h.deleted_at,
            p.farmer_id, p.lat AS plot_lat, p.lng AS plot_lng, c.base_shelf_days
     FROM harvest_lots h
     JOIN plots p ON p.id = h.plot_id
     JOIN crops c ON c.id = h.crop_id
     WHERE h.id = ?
     FOR UPDATE`,
    [lotId],
  );
  const lot = rows[0];
  if (lot === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
  }
  return lot;
}

interface MineLotRow extends RowDataPacket {
  id: number;
  plot_id: number;
  crop_id: number;
  weight_kg: number;
  split_allowed: number;
  min_order_kg: number;
  order_step_kg: number;
  grade: ProduceGrade;
  ripeness: number;
  photo_url: string | null;
  allow_donation: number;
  donation_audience: string;
  start_price_per_kg: number | null;
  floor_price_per_kg: number | null;
  sale_mode: string;
  donation_opened: number;
  predicted_shelf_hours: number;
  expires_at: Date;
  status: string;
  created_at: Date;
  crop_name_th: string;
  plot_name: string;
  base_shelf_days: number;
}

async function listMine(farmerId: number): Promise<object[]> {
  const [rows] = await pool.query<MineLotRow[]>(
    `SELECT h.id, h.plot_id, h.crop_id, h.weight_kg, h.split_allowed, h.min_order_kg, h.order_step_kg,
            h.grade, h.ripeness, h.photo_url,
            h.allow_donation, h.donation_audience, h.start_price_per_kg, h.floor_price_per_kg,
            h.sale_mode, h.donation_opened, h.predicted_shelf_hours, h.expires_at, h.status, h.created_at,
            c.name_th AS crop_name_th, c.base_shelf_days, p.name AS plot_name
     FROM harvest_lots h
     JOIN plots p ON p.id = h.plot_id
     JOIN crops c ON c.id = h.crop_id
     WHERE p.farmer_id = ? AND h.deleted_at IS NULL
     ORDER BY h.id`,
    [farmerId],
  );
  return mapMineLots(rows);
}

async function presentLot(lotId: number): Promise<object> {
  const [rows] = await pool.query<MineLotRow[]>(
    `SELECT h.id, h.plot_id, h.crop_id, h.weight_kg, h.split_allowed, h.min_order_kg, h.order_step_kg,
            h.grade, h.ripeness, h.photo_url,
            h.allow_donation, h.donation_audience, h.start_price_per_kg, h.floor_price_per_kg,
            h.sale_mode, h.donation_opened, h.predicted_shelf_hours, h.expires_at, h.status, h.created_at,
            c.name_th AS crop_name_th, c.base_shelf_days, p.name AS plot_name
     FROM harvest_lots h
     JOIN plots p ON p.id = h.plot_id
     JOIN crops c ON c.id = h.crop_id
     WHERE h.id = ?`,
    [lotId],
  );
  const lot = (await mapMineLots(rows))[0];
  if (lot === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
  }
  return lot;
}

async function mapMineLots(rows: MineLotRow[]): Promise<object[]> {
  const now = Date.now();
  const result: object[] = [];
  for (const row of rows) {
    const hoursLeft = (new Date(row.expires_at).getTime() - now) / (60 * 60 * 1000);
    const saleMode = String(row.sale_mode);
    const pricePerKg =
      saleMode === 'donate' || row.start_price_per_kg === null || row.floor_price_per_kg === null
        ? 0
        : lotPricePerKg({
            startPricePerKg: Number(row.start_price_per_kg),
            floorPricePerKg: Number(row.floor_price_per_kg),
            baseShelfHours: Number(row.base_shelf_days) * 24,
            hoursLeft,
          });
    const [reservedRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(quantity_kg), 0) AS total
       FROM orders WHERE lot_id = ? AND status IN ('reserved', 'picked', 'delivered')`,
      [row.id],
    );
    const reserved = Number(reservedRows[0]?.total ?? 0);
    const weightKg = Number(row.weight_kg);
    const [bookings] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.quantity_kg, o.agreed_price_per_kg, o.is_donation, o.status, o.created_at, u.name AS buyer_name
       FROM orders o
       JOIN users u ON u.id = o.buyer_id
       WHERE o.lot_id = ? AND o.status <> 'cancelled'
       ORDER BY o.id`,
      [row.id],
    );
    result.push({
      id: Number(row.id),
      plot_id: Number(row.plot_id),
      crop_id: Number(row.crop_id),
      weight_kg: weightKg,
      split_allowed: Number(row.split_allowed) === 1,
      min_order_kg: Number(row.min_order_kg),
      order_step_kg: Number(row.order_step_kg),
      remaining_kg: remainingLotKg(weightKg, reserved),
      grade: row.grade,
      ripeness: Number(row.ripeness),
      photo_url: row.photo_url,
      sale_mode: saleMode,
      allow_donation: lotAcceptsDonation(saleMode, row.donation_opened),
      donation_audience: row.donation_audience,
      donation_opened: Number(row.donation_opened) === 1,
      start_price_per_kg:
        row.start_price_per_kg === null ? null : Number(row.start_price_per_kg),
      floor_price_per_kg:
        row.floor_price_per_kg === null ? null : Number(row.floor_price_per_kg),
      predicted_shelf_hours: Number(row.predicted_shelf_hours),
      expires_at: new Date(row.expires_at).toISOString(),
      status: row.status,
      created_at: new Date(row.created_at).toISOString(),
      crop_name_th: row.crop_name_th,
      plot_name: row.plot_name,
      price_per_kg: pricePerKg,
      bookings: bookings.map((b) => ({
        order_id: Number(b.id),
        buyer_name: String(b.buyer_name),
        quantity_kg: Number(b.quantity_kg),
        agreed_price_per_kg: Number(b.agreed_price_per_kg),
        is_donation: Number(b.is_donation) === 1,
        status: String(b.status),
        created_at: new Date(b.created_at as string).toISOString(),
      })),
    });
  }
  return result;
}
