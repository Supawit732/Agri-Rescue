import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability, signAccessToken } from '../middleware/auth';
import type { UserRole } from '../types/express';

export const authRouter = Router();

const buyerTypeSchema = z.enum(['vendor', 'shop', 'charity']);

const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'กรุณากรอกชื่อ'),
    phone: z.string().trim().regex(/^\d{9,15}$/, 'เบอร์โทรไม่ถูกต้อง'),
    password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
    can_sell: z.boolean(),
    can_buy: z.boolean(),
    buyer_type: buyerTypeSchema.nullable().optional(),
    line_id: z.string().trim().min(1).max(64).nullable().optional(),
    lat: z.number().gte(-90).lte(90).nullable().optional(),
    lng: z.number().gte(-180).lte(180).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    if (!body.can_sell && !body.can_buy) {
      ctx.addIssue({ code: 'custom', message: 'เลือกอย่างน้อยหนึ่งบทบาท: ขาย หรือ ซื้อ', path: ['can_sell'] });
    }
    if (body.can_buy && (body.buyer_type === undefined || body.buyer_type === null)) {
      ctx.addIssue({ code: 'custom', message: 'กรุณาระบุประเภทผู้ซื้อ', path: ['buyer_type'] });
    }
    if (!body.can_buy && body.buyer_type !== undefined && body.buyer_type !== null) {
      ctx.addIssue({ code: 'custom', message: 'ประเภทผู้ซื้อใช้ได้เฉพาะเมื่อเปิดสิทธิ์ซื้อ', path: ['buyer_type'] });
    }
  });

const loginSchema = z.object({
  phone: z.string().trim().min(1, 'กรุณากรอกเบอร์โทร'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

const profileSchema = z
  .object({
    can_sell: z.literal(true).optional(),
    can_buy: z.literal(true).optional(),
    buyer_type: buyerTypeSchema.optional(),
    line_id: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .refine((body) => body.can_sell === true || body.can_buy === true || body.line_id !== undefined, {
    message: 'ไม่มีข้อมูลที่จะอัปเดต',
  });

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  can_sell: number | boolean;
  can_buy: number | boolean;
  is_admin: number | boolean;
  line_id: string | null;
  lat: number | null;
  lng: number | null;
  buyer_type: 'vendor' | 'shop' | 'charity' | null;
  charity_approved: number | boolean | null;
  password_hash?: string;
}

export interface PublicUser {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  can_sell: boolean;
  can_buy: boolean;
  is_admin: boolean;
  buyer_type: 'vendor' | 'shop' | 'charity' | null;
  charity_approved: boolean;
  line_id: string | null;
  lat: number | null;
  lng: number | null;
}

function asBool(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone,
    role: row.role,
    can_sell: asBool(row.can_sell),
    can_buy: asBool(row.can_buy),
    is_admin: asBool(row.is_admin),
    buyer_type: row.buyer_type,
    charity_approved: asBool(row.charity_approved),
    line_id: row.line_id,
    lat: row.lat,
    lng: row.lng,
  };
}

const USER_SELECT = `SELECT u.id, u.name, u.phone, u.role, u.can_sell, u.can_buy, u.is_admin,
                            u.line_id, u.lat, u.lng,
                            bp.buyer_type, bp.charity_approved
                     FROM users u
                     LEFT JOIN buyer_profiles bp ON bp.user_id = u.id`;

export async function loadPublicUser(userId: number): Promise<PublicUser> {
  const [rows] = await pool.query<UserRow[]>(`${USER_SELECT} WHERE u.id = ?`, [userId]);
  const user = rows[0];
  if (user === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
  }
  return toPublicUser(user);
}

function primaryRole(canSell: boolean, canBuy: boolean): UserRole {
  if (canSell) {
    return 'farmer';
  }
  if (canBuy) {
    return 'buyer';
  }
  throw new HttpError(400, 'VALIDATION', 'เลือกอย่างน้อยหนึ่งบทบาท: ขาย หรือ ซื้อ');
}

function tokenFor(user: PublicUser): string {
  return signAccessToken(user.id, user.role, {
    can_sell: user.can_sell,
    can_buy: user.can_buy,
    is_admin: user.is_admin,
  });
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const role = primaryRole(body.can_sell, body.can_buy);
    const passwordHash = await bcrypt.hash(body.password, 10);
    const charityApproved = body.buyer_type === 'charity' ? 0 : 1;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO users (name, phone, password_hash, role, can_sell, can_buy, is_admin, line_id, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          body.name,
          body.phone,
          passwordHash,
          role,
          body.can_sell ? 1 : 0,
          body.can_buy ? 1 : 0,
          body.line_id ?? null,
          body.lat ?? null,
          body.lng ?? null,
        ],
      );
      if (body.can_buy && body.buyer_type !== undefined && body.buyer_type !== null) {
        await connection.query(
          `INSERT INTO buyer_profiles (user_id, buyer_type, charity_approved) VALUES (?, ?, ?)`,
          [result.insertId, body.buyer_type, charityApproved],
        );
      }
      await connection.commit();
      const publicUser = await loadPublicUser(result.insertId);
      res.status(201).json({ token: tokenFor(publicUser), user: publicUser });
    } catch (error) {
      await connection.rollback();
      if (isDuplicate(error)) {
        throw new HttpError(409, 'CONFLICT', 'เบอร์โทรนี้ถูกใช้แล้ว');
      }
      throw error;
    } finally {
      connection.release();
    }
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const [authRows] = await pool.query<UserRow[]>(
      `SELECT u.id, u.name, u.phone, u.role, u.can_sell, u.can_buy, u.is_admin,
              u.line_id, u.lat, u.lng, u.password_hash,
              bp.buyer_type, bp.charity_approved
       FROM users u
       LEFT JOIN buyer_profiles bp ON bp.user_id = u.id
       WHERE u.phone = ?`,
      [body.phone],
    );
    const user = authRows[0];
    const passwordHash = user?.password_hash;
    if (user === undefined || passwordHash === undefined || !(await bcrypt.compare(body.password, passwordHash))) {
      throw new HttpError(401, 'UNAUTHORIZED', 'เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง');
    }
    const publicUser = toPublicUser(user);
    res.json({ token: tokenFor(publicUser), user: publicUser });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadPublicUser(req.auth?.id ?? 0);
    res.json({ user });
  }),
);

authRouter.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = profileSchema.parse(req.body);
    const userId = req.auth?.id ?? 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<UserRow[]>(
        `SELECT u.id, u.name, u.phone, u.role, u.can_sell, u.can_buy, u.is_admin,
                u.line_id, u.lat, u.lng, bp.buyer_type, bp.charity_approved
         FROM users u
         LEFT JOIN buyer_profiles bp ON bp.user_id = u.id
         WHERE u.id = ?
         FOR UPDATE`,
        [userId],
      );
      const current = rows[0];
      if (current === undefined) {
        throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
      }
      let canSell = asBool(current.can_sell);
      let canBuy = asBool(current.can_buy);
      if (body.can_sell === true) {
        canSell = true;
      }
      if (body.can_buy === true) {
        canBuy = true;
        const hasProfile = current.buyer_type !== null;
        if (!hasProfile) {
          if (body.buyer_type === undefined) {
            throw new HttpError(400, 'VALIDATION', 'กรุณาระบุประเภทผู้ซื้อ');
          }
          const approved = body.buyer_type === 'charity' ? 0 : 1;
          await connection.query(
            `INSERT INTO buyer_profiles (user_id, buyer_type, charity_approved) VALUES (?, ?, ?)`,
            [userId, body.buyer_type, approved],
          );
        } else if (body.buyer_type !== undefined && body.buyer_type !== current.buyer_type) {
          throw new HttpError(400, 'VALIDATION', 'เปลี่ยนประเภทผู้ซื้อไม่ได้ กรุณาติดต่อผู้ดูแล');
        }
      }
      const lineId = body.line_id !== undefined ? body.line_id : current.line_id;
      const role =
        current.role === 'driver' || current.role === 'coordinator'
          ? current.role
          : primaryRole(canSell, canBuy);
      await connection.query(
        `UPDATE users SET can_sell = ?, can_buy = ?, line_id = ?, role = ? WHERE id = ?`,
        [canSell ? 1 : 0, canBuy ? 1 : 0, lineId, role, userId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    const publicUser = await loadPublicUser(userId);
    res.json({ token: tokenFor(publicUser), user: publicUser });
  }),
);

authRouter.post(
  '/admin/approve-charity/:userId',
  requireAuth,
  requireCapability('admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new HttpError(400, 'VALIDATION', 'รหัสผู้ใช้ไม่ถูกต้อง');
    }
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE buyer_profiles SET charity_approved = 1
       WHERE user_id = ? AND buyer_type = 'charity'`,
      [userId],
    );
    if (result.affectedRows === 0) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบโปรไฟล์สงเคราะห์ที่รออนุมัติ');
    }
    const user = await loadPublicUser(userId);
    res.json({ user });
  }),
);

function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}
