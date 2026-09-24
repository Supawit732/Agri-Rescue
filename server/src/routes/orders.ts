import { Router } from 'express';
import { randomInt } from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { CO2E_PER_KG } from '../db/seedData';
import { round2 } from '../delivery/depot';
import { haversineKm } from '../domain/geo';
import type { LotStatus } from '../domain/lotStateMachine';
import type { ProduceGrade } from '../domain/pricing';
import type { DonationAudience } from '../domain/donorRules';
import {
  isBookableLotStatus,
  remainingLotKg,
  validateOrderQuantity,
} from '../domain/lotInventory';
import { lotAcceptsDonation, lotPricePerKg } from '../domain/sellerPricing';
import {
  assertMayRequestDonation,
  createDonationProofForOrder,
  loadDonorProfile,
  usedDonationKgThisWeek,
} from '../donors/donationService';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';
import { finalizeLotIfComplete, sumReservedQuantityKg, syncLotBookableStatus } from '../orders/lotInventoryService';
import { notifyUser } from '../notifications/notificationService';

export const ordersRouter = Router();

const createSchema = z.object({
  lot_id: z.number().int().positive(),
  donation: z.boolean(),
  quantity_kg: z.number().positive('กรุณาระบุจำนวนกิโลกรัม'),
  distribution_place: z.string().trim().min(1).max(512).optional(),
  distribution_at: z.string().datetime().optional(),
});

interface LotLock extends RowDataPacket {
  id: number;
  status: LotStatus;
  grade: ProduceGrade;
  allow_donation: number;
  donation_audience: DonationAudience;
  start_price_per_kg: number | null;
  floor_price_per_kg: number | null;
  sale_mode: string;
  donation_opened: number;
  weight_kg: number;
  split_allowed: number;
  min_order_kg: number;
  order_step_kg: number;
  expires_at: Date;
  base_shelf_days: number;
  farmer_id: number;
}

interface OrderRow extends RowDataPacket {
  id: number;
  lot_id: number;
  buyer_id: number;
  quantity_kg: number;
  agreed_price_per_kg: number;
  is_donation: number;
  status: string;
  batch_id: number | null;
  drop_otp: string;
  distribution_place: string | null;
  distribution_at: Date | null;
  created_at: Date;
}

interface OrderDetailRow extends OrderRow {
  crop_name_th: string;
  crop_name_en: string | null;
  grade: ProduceGrade;
  ripeness: number;
  photo_url: string | null;
  expires_at: Date;
  plot_name: string;
  plot_lat: number;
  plot_lng: number;
  farmer_id: number;
  buyer_lat: number | null;
  buyer_lng: number | null;
}

ordersRouter.use(requireAuth);

ordersRouter.post(
  '/',
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const buyerId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [userRows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM users WHERE id = ? AND can_buy = 1 FOR UPDATE',
        [buyerId],
      );
      if (userRows[0] === undefined) {
        throw new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึง');
      }
      const [lots] = await connection.query<LotLock[]>(
        `SELECT h.id, h.status, h.grade, h.allow_donation, h.donation_audience,
                h.start_price_per_kg, h.floor_price_per_kg, h.sale_mode, h.donation_opened,
                h.weight_kg, h.split_allowed, h.min_order_kg, h.order_step_kg,
                h.expires_at, c.base_shelf_days, p.farmer_id
         FROM harvest_lots h
         JOIN crops c ON c.id = h.crop_id
         JOIN plots p ON p.id = h.plot_id
         WHERE h.id = ? AND h.deleted_at IS NULL
         FOR UPDATE`,
        [body.lot_id],
      );
      const lot = lots[0];
      if (lot === undefined) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
      }
      if (Number(lot.farmer_id) === buyerId) {
        throw new HttpError(403, 'FORBIDDEN', 'จองล็อตของตัวเองไม่ได้');
      }
      if (new Date(lot.expires_at).getTime() <= Date.now()) {
        throw new HttpError(409, 'LOT_EXPIRED', 'ล็อตนี้หมดอายุแล้ว');
      }
      if (!isBookableLotStatus(lot.status)) {
        throw new HttpError(409, 'LOT_NOT_OPEN', 'ล็อตนี้จองเพิ่มไม่ได้แล้ว', undefined, {
          lot_status: lot.status,
        });
      }
      const weightKg = Number(lot.weight_kg);
      const reservedSum = await sumReservedQuantityKg(connection, lot.id);
      const remaining = remainingLotKg(weightKg, reservedSum);
      const qtyCheck = validateOrderQuantity({
        quantityKg: body.quantity_kg,
        remainingKg: remaining,
        minOrderKg: Number(lot.min_order_kg),
        orderStepKg: Number(lot.order_step_kg),
        splitAllowed: Number(lot.split_allowed) === 1,
      });
      if (!qtyCheck.ok) {
        throw new HttpError(400, qtyCheck.error.toUpperCase(), qtyCheck.message, {
          quantity_kg: qtyCheck.message,
        });
      }
      const saleMode = String(lot.sale_mode);
      const acceptsDonation = lotAcceptsDonation(saleMode, lot.donation_opened);
      const donation = body.donation;
      let agreedPrice = 0;
      let distributionPlace: string | null = null;
      let distributionAt: Date | null = null;
      if (donation) {
        const profile = await loadDonorProfile(connection, buyerId);
        if (profile === null) {
          throw new HttpError(403, 'FORBIDDEN', 'ต้องเป็นผู้รับบริจาคที่ลงทะเบียนแล้ว');
        }
        const usedKg = await usedDonationKgThisWeek(connection, buyerId);
        distributionPlace = body.distribution_place ?? null;
        distributionAt = body.distribution_at !== undefined ? new Date(body.distribution_at) : null;
        assertMayRequestDonation({
          profile,
          audience: lot.donation_audience,
          lotWeightKg: body.quantity_kg,
          usedKg,
          allowDonation: acceptsDonation,
          distributionPlace,
          distributionAt,
        });
      } else {
        if (saleMode === 'donate') {
          throw new HttpError(403, 'FORBIDDEN', 'ล็อตนี้เปิดรับบริจาคเท่านั้น ซื้อไม่ได้');
        }
        if (lot.start_price_per_kg === null || lot.floor_price_per_kg === null) {
          throw new HttpError(409, 'CONFLICT', 'ล็อตนี้ยังไม่มีราคาขาย');
        }
        const hoursLeft = (new Date(lot.expires_at).getTime() - Date.now()) / (60 * 60 * 1000);
        agreedPrice = lotPricePerKg({
          startPricePerKg: Number(lot.start_price_per_kg),
          floorPricePerKg: Number(lot.floor_price_per_kg),
          baseShelfHours: Number(lot.base_shelf_days) * 24,
          hoursLeft,
        });
      }
      const dropOtp = String(randomInt(0, 10000)).padStart(4, '0');
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO orders
           (lot_id, buyer_id, quantity_kg, agreed_price_per_kg, is_donation, status, batch_id, drop_otp, distribution_place, distribution_at)
         VALUES (?, ?, ?, ?, ?, 'reserved', NULL, ?, ?, ?)`,
        [
          lot.id,
          buyerId,
          body.quantity_kg,
          agreedPrice,
          donation ? 1 : 0,
          dropOtp,
          distributionPlace,
          distributionAt,
        ],
      );
      const lotStatus = await syncLotBookableStatus(connection, lot.id, weightKg, lot.status);
      await connection.commit();
      res.status(201).json({
        order: {
          id: result.insertId,
          lot_id: lot.id,
          quantity_kg: body.quantity_kg,
          agreed_price_per_kg: agreedPrice,
          is_donation: donation,
          status: 'reserved',
          batch_id: null,
          drop_otp: dropOtp,
          distribution_place: distributionPlace,
          distribution_at: distributionAt?.toISOString() ?? null,
        },
        lot_status: lotStatus,
        remaining_kg: remainingLotKg(weightKg, reservedSum + body.quantity_kg),
      });
      try {
        await notifyUser(
          Number(lot.farmer_id),
          'lot_booked',
          'notif.lot_booked',
          {
            quantity_kg: body.quantity_kg,
            order_id: result.insertId,
            lot_id: lot.id,
            is_donation: donation,
          },
          `/orders/${result.insertId}`,
        );
      } catch {
        // ignore notify failure
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

ordersRouter.get(
  '/mine',
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query<(OrderRow & { crop_name_th: string; crop_name_en: string | null })[]>(
      `SELECT o.id, o.lot_id, o.buyer_id, o.quantity_kg, o.agreed_price_per_kg, o.is_donation, o.status,
              o.batch_id, o.drop_otp, o.distribution_place, o.distribution_at, o.created_at,
              c.name_th AS crop_name_th, c.name_en AS crop_name_en
       FROM orders o
       JOIN harvest_lots h ON h.id = o.lot_id
       JOIN crops c ON c.id = h.crop_id
       WHERE o.buyer_id = ?
       ORDER BY o.id`,
      [req.auth?.id ?? 0],
    );
    res.json({
      orders: rows.map((row) => {
        const quantityKg = Number(row.quantity_kg);
        const price = Number(row.agreed_price_per_kg);
        return {
          id: Number(row.id),
          lot_id: Number(row.lot_id),
          crop_name_th: row.crop_name_th,
          crop_name_en:
            row.crop_name_en === null || row.crop_name_en === '' ? null : String(row.crop_name_en),
          quantity_kg: quantityKg,
          agreed_price_per_kg: price,
          total: Math.round(quantityKg * price * 100) / 100,
          is_donation: Number(row.is_donation) === 1,
          status: row.status,
          batch_id: row.batch_id === null ? null : Number(row.batch_id),
          drop_otp: row.drop_otp,
          distribution_place: row.distribution_place,
          distribution_at:
            row.distribution_at === null ? null : new Date(row.distribution_at).toISOString(),
          created_at: new Date(row.created_at).toISOString(),
        };
      }),
    });
  }),
);

ordersRouter.get(
  '/:id',
  requireCapability('buy', 'sell'),
  asyncHandler(async (req, res) => {
    const orderId = z.coerce.number().int().positive().parse(req.params.id);
    const userId = req.auth?.id ?? 0;
    const [rows] = await pool.query<OrderDetailRow[]>(
      `SELECT o.id, o.lot_id, o.buyer_id, o.quantity_kg, o.agreed_price_per_kg, o.is_donation, o.status,
              o.batch_id, o.drop_otp, o.distribution_place, o.distribution_at, o.created_at,
              c.name_th AS crop_name_th, c.name_en AS crop_name_en, h.grade, h.ripeness, h.photo_url, h.expires_at,
              p.name AS plot_name, p.lat AS plot_lat, p.lng AS plot_lng, p.farmer_id,
              bu.lat AS buyer_lat, bu.lng AS buyer_lng
       FROM orders o
       JOIN harvest_lots h ON h.id = o.lot_id
       JOIN crops c ON c.id = h.crop_id
       JOIN plots p ON p.id = h.plot_id
       JOIN users bu ON bu.id = o.buyer_id
       WHERE o.id = ?`,
      [orderId],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อ');
    }
    const isBuyer = Number(row.buyer_id) === userId;
    const isSeller = Number(row.farmer_id) === userId;
    if (!isBuyer && !isSeller) {
      throw new HttpError(403, 'FORBIDDEN', 'ดูได้เฉพาะเจ้าของออเดอร์หรือเจ้าของล็อต');
    }
    const quantityKg = Number(row.quantity_kg);
    const price = Number(row.agreed_price_per_kg);
    const plotLat = Number(row.plot_lat);
    const plotLng = Number(row.plot_lng);
    let distanceKm: number | null = null;
    if (row.buyer_lat !== null && row.buyer_lng !== null) {
      distanceKm = haversineKm(
        { lat: Number(row.buyer_lat), lng: Number(row.buyer_lng) },
        { lat: plotLat, lng: plotLng },
      );
    }
    res.json({
      order: {
        id: Number(row.id),
        lot_id: Number(row.lot_id),
        crop_name_th: row.crop_name_th,
        crop_name_en:
          row.crop_name_en === null || row.crop_name_en === '' ? null : String(row.crop_name_en),
        grade: row.grade,
        ripeness: Number(row.ripeness),
        photo_url: row.photo_url,
        quantity_kg: quantityKg,
        agreed_price_per_kg: price,
        total: Math.round(quantityKg * price * 100) / 100,
        is_donation: Number(row.is_donation) === 1,
        status: row.status,
        batch_id: row.batch_id === null ? null : Number(row.batch_id),
        drop_otp: row.drop_otp,
        expires_at: new Date(row.expires_at).toISOString(),
        plot_name: row.plot_name,
        lat: plotLat,
        lng: plotLng,
        distance_km: distanceKm,
        distribution_place: row.distribution_place,
        distribution_at:
          row.distribution_at === null ? null : new Date(row.distribution_at).toISOString(),
        created_at: new Date(row.created_at).toISOString(),
        viewer: isSeller ? 'seller' : 'buyer',
      },
    });
  }),
);

/**
 * Direct farm pickup: seller confirms delivery with OTP + weighed kg (skips batch/driver).
 * orders table has no weight_flag column — flag is only on route_stops; impact uses weight_kg.
 */
ordersRouter.post(
  '/:id/seller-confirm',
  requireCapability('sell'),
  asyncHandler(async (req, res) => {
    const orderId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z
      .object({
        otp: z.string().length(4, 'รหัสยืนยันต้องเป็นตัวเลข 4 หลัก'),
        weight_kg: z.number().positive('กรุณากรอกน้ำหนักที่ชั่งได้'),
      })
      .parse(req.body);
    if (!/^\d{4}$/.test(body.otp)) {
      throw new HttpError(400, 'VALIDATION', 'รหัสยืนยันต้องเป็นตัวเลข 4 หลัก', {
        otp: 'รหัสยืนยันต้องเป็นตัวเลข 4 หลัก',
      });
    }
    const sellerId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<
        (OrderRow & { farmer_id: number; is_donation: number })[]
      >(
        `SELECT o.id, o.lot_id, o.buyer_id, o.quantity_kg, o.agreed_price_per_kg, o.is_donation,
                o.status, o.batch_id, o.drop_otp, p.farmer_id
         FROM orders o
         JOIN harvest_lots h ON h.id = o.lot_id
         JOIN plots p ON p.id = h.plot_id
         WHERE o.id = ?
         FOR UPDATE`,
        [orderId],
      );
      const order = rows[0];
      if (order === undefined) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อ');
      }
      if (Number(order.farmer_id) !== sellerId) {
        throw new HttpError(403, 'FORBIDDEN', 'ยืนยันได้เฉพาะเจ้าของล็อต');
      }
      if (order.status !== 'reserved') {
        throw new HttpError(409, 'CONFLICT', 'ยืนยันได้เฉพาะออเดอร์ที่จองไว้');
      }
      if (order.drop_otp !== body.otp) {
        throw new HttpError(400, 'OTP_MISMATCH', 'รหัสยืนยันไม่ถูกต้อง', {
          otp: 'รหัสยืนยันไม่ถูกต้อง',
        });
      }
      const kgSaved = body.weight_kg;
      const co2e = round2(kgSaved * CO2E_PER_KG);
      await connection.query('UPDATE orders SET status = ? WHERE id = ?', ['delivered', order.id]);
      await connection.query(
        'INSERT INTO impact_logs (order_id, kg_saved, co2e_kg) VALUES (?, ?, ?)',
        [order.id, kgSaved, co2e],
      );
      if (Number(order.is_donation) === 1) {
        await createDonationProofForOrder(connection, Number(order.id));
      }
      const lotStatus = await finalizeLotIfComplete(connection, Number(order.lot_id));
      await connection.commit();
      res.json({
        order: {
          id: Number(order.id),
          lot_id: Number(order.lot_id),
          quantity_kg: Number(order.quantity_kg),
          agreed_price_per_kg: Number(order.agreed_price_per_kg),
          is_donation: Number(order.is_donation) === 1,
          status: 'delivered',
          weight_kg: kgSaved,
        },
        lot_status: lotStatus,
      });
      try {
        await notifyUser(
          Number(order.buyer_id),
          'order_delivered',
          'notif.order_delivered',
          {
            quantity_kg: Number(order.quantity_kg),
            order_id: Number(order.id),
            is_donation: Number(order.is_donation) === 1,
            weight_kg: kgSaved,
          },
          `/orders/${Number(order.id)}`,
        );
        if (Number(order.is_donation) === 1) {
          await notifyUser(
            Number(order.buyer_id),
            'donor_proof_due',
            'notif.donor_proof_due',
            { order_id: Number(order.id) },
            `/orders/${Number(order.id)}`,
          );
        }
      } catch {
        // ignore notify failure
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

ordersRouter.delete(
  '/:id',
  requireCapability('buy'),
  asyncHandler(async (req, res) => {
    const orderId = z.coerce.number().int().positive().parse(req.params.id);
    const buyerId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [orders] = await connection.query<OrderRow[]>(
        `SELECT id, lot_id, buyer_id, quantity_kg, status, batch_id
         FROM orders
         WHERE id = ?
         FOR UPDATE`,
        [orderId],
      );
      const order = orders[0];
      if (order === undefined) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อ');
      }
      if (Number(order.buyer_id) !== buyerId) {
        throw new HttpError(403, 'FORBIDDEN', 'ยกเลิกได้เฉพาะคำสั่งซื้อของตนเอง');
      }
      if (order.batch_id !== null) {
        throw new HttpError(409, 'ORDER_IN_BATCH', 'ยกเลิกไม่ได้เพราะคำสั่งซื้ออยู่ในรอบวิ่งแล้ว');
      }
      if (order.status !== 'reserved') {
        throw new HttpError(409, 'CONFLICT', 'คำสั่งซื้อนี้ยกเลิกไม่ได้');
      }
      const [lots] = await connection.query<LotLock[]>(
        'SELECT id, status, weight_kg FROM harvest_lots WHERE id = ? FOR UPDATE',
        [order.lot_id],
      );
      const lot = lots[0];
      if (lot === undefined) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
      }
      await connection.query('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', order.id]);
      const lotStatus = await syncLotBookableStatus(
        connection,
        lot.id,
        Number(lot.weight_kg),
        lot.status,
      );
      await connection.commit();
      res.json({ status: 'cancelled', lot_status: lotStatus });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);
