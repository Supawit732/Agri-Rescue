import { Router } from 'express';
import { randomInt } from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { assertLotTransition, type LotStatus } from '../domain/lotStateMachine';
import { urgentPricePerKg, type ProduceGrade } from '../domain/pricing';
import type { DonationAudience } from '../domain/donorRules';
import {
  assertMayRequestDonation,
  loadDonorProfile,
  usedDonationKgThisWeek,
} from '../donors/donationService';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability } from '../middleware/auth';

export const ordersRouter = Router();

const createSchema = z.object({
  lot_id: z.number().int().positive(),
  donation: z.boolean(),
  distribution_place: z.string().trim().min(1).max(512).optional(),
  distribution_at: z.string().datetime().optional(),
});

interface LotLock extends RowDataPacket {
  id: number;
  status: LotStatus;
  grade: ProduceGrade;
  allow_donation: number;
  donation_audience: DonationAudience;
  weight_kg: number;
  expires_at: Date;
  base_shelf_days: number;
  market_price_per_kg: number;
  farmer_id: number;
}

interface OrderRow extends RowDataPacket {
  id: number;
  lot_id: number;
  buyer_id: number;
  agreed_price_per_kg: number;
  is_donation: number;
  status: string;
  batch_id: number | null;
  drop_otp: string;
  distribution_place: string | null;
  distribution_at: Date | null;
  created_at: Date;
}

ordersRouter.use(requireAuth, requireCapability('buy'));

ordersRouter.post(
  '/',
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
        `SELECT h.id, h.status, h.grade, h.allow_donation, h.donation_audience, h.weight_kg, h.expires_at,
                c.base_shelf_days, c.market_price_per_kg, p.farmer_id
         FROM harvest_lots h
         JOIN crops c ON c.id = h.crop_id
         JOIN plots p ON p.id = h.plot_id
         WHERE h.id = ?
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
      if (lot.status !== 'open') {
        throw new HttpError(409, 'LOT_NOT_OPEN', 'ล็อตนี้ถูกจองแล้ว');
      }
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
          lotWeightKg: Number(lot.weight_kg),
          usedKg,
          allowDonation: Number(lot.allow_donation) === 1,
          distributionPlace,
          distributionAt,
        });
      } else {
        const hoursLeft = (new Date(lot.expires_at).getTime() - Date.now()) / (60 * 60 * 1000);
        agreedPrice = urgentPricePerKg({
          marketPricePerKg: Number(lot.market_price_per_kg),
          baseShelfHours: Number(lot.base_shelf_days) * 24,
          hoursLeft,
          grade: lot.grade,
        });
      }
      assertLotTransition(lot.status, 'reserved');
      await connection.query('UPDATE harvest_lots SET status = ? WHERE id = ?', ['reserved', lot.id]);
      const dropOtp = String(randomInt(0, 10000)).padStart(4, '0');
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO orders
           (lot_id, buyer_id, agreed_price_per_kg, is_donation, status, batch_id, drop_otp, distribution_place, distribution_at)
         VALUES (?, ?, ?, ?, 'reserved', NULL, ?, ?, ?)`,
        [lot.id, buyerId, agreedPrice, donation ? 1 : 0, dropOtp, distributionPlace, distributionAt],
      );
      await connection.commit();
      res.status(201).json({
        order: {
          id: result.insertId,
          lot_id: lot.id,
          agreed_price_per_kg: agreedPrice,
          is_donation: donation,
          status: 'reserved',
          batch_id: null,
          drop_otp: dropOtp,
          distribution_place: distributionPlace,
          distribution_at: distributionAt?.toISOString() ?? null,
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

ordersRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query<OrderRow[]>(
      `SELECT id, lot_id, buyer_id, agreed_price_per_kg, is_donation, status, batch_id, drop_otp,
              distribution_place, distribution_at, created_at
       FROM orders
       WHERE buyer_id = ?
       ORDER BY id`,
      [req.auth?.id ?? 0],
    );
    res.json({
      orders: rows.map((row) => ({
        id: Number(row.id),
        lot_id: Number(row.lot_id),
        agreed_price_per_kg: Number(row.agreed_price_per_kg),
        is_donation: Number(row.is_donation) === 1,
        status: row.status,
        batch_id: row.batch_id === null ? null : Number(row.batch_id),
        drop_otp: row.drop_otp,
        distribution_place: row.distribution_place,
        distribution_at: row.distribution_at === null ? null : new Date(row.distribution_at).toISOString(),
        created_at: new Date(row.created_at).toISOString(),
      })),
    });
  }),
);

ordersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const orderId = z.coerce.number().int().positive().parse(req.params.id);
    const buyerId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [orders] = await connection.query<OrderRow[]>(
        `SELECT id, lot_id, buyer_id, status, batch_id
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
        'SELECT id, status FROM harvest_lots WHERE id = ? FOR UPDATE',
        [order.lot_id],
      );
      const lot = lots[0];
      if (lot === undefined) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
      }
      assertLotTransition(lot.status, 'open');
      await connection.query('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', order.id]);
      await connection.query('UPDATE harvest_lots SET status = ? WHERE id = ?', ['open', lot.id]);
      await connection.commit();
      res.json({ status: 'cancelled', lot_status: 'open' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);
