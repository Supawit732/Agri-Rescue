import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { signAccessToken } from '../middleware/auth';
import type { UserRole } from '../types/express';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, 'กรุณากรอกชื่อ'),
  phone: z.string().trim().regex(/^\d{9,15}$/, 'เบอร์โทรไม่ถูกต้อง'),
  password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
  role: z.enum(['farmer', 'buyer', 'driver', 'coordinator']),
  buyer_type: z.enum(['vendor', 'shop', 'charity']).nullable().optional(),
  lat: z.number().gte(-90).lte(90).nullable().optional(),
  lng: z.number().gte(-180).lte(180).nullable().optional(),
});

const loginSchema = z.object({
  phone: z.string().trim().min(1, 'กรุณากรอกเบอร์โทร'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  buyer_type: 'vendor' | 'shop' | 'charity' | null;
  lat: number | null;
  lng: number | null;
  password_hash?: string;
}

export interface PublicUser {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  buyer_type: 'vendor' | 'shop' | 'charity' | null;
  lat: number | null;
  lng: number | null;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone,
    role: row.role,
    buyer_type: row.buyer_type,
    lat: row.lat,
    lng: row.lng,
  };
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    if (body.role !== 'farmer' && body.role !== 'buyer') {
      throw new HttpError(403, 'FORBIDDEN', 'สมัครได้เฉพาะเกษตรกรและผู้ซื้อ');
    }
    if (body.role === 'buyer' && (body.buyer_type === undefined || body.buyer_type === null)) {
      throw new HttpError(400, 'VALIDATION', 'กรุณาระบุประเภทผู้ซื้อ');
    }
    if (body.role === 'farmer' && body.buyer_type !== undefined && body.buyer_type !== null) {
      throw new HttpError(400, 'VALIDATION', 'เกษตรกรไม่มีประเภทผู้ซื้อ');
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    try {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO users (name, phone, password_hash, role, buyer_type, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          body.name,
          body.phone,
          passwordHash,
          body.role,
          body.role === 'buyer' ? body.buyer_type : null,
          body.lat ?? null,
          body.lng ?? null,
        ],
      );
      const [rows] = await pool.query<UserRow[]>(
        'SELECT id, name, phone, role, buyer_type, lat, lng FROM users WHERE id = ?',
        [result.insertId],
      );
      const user = rows[0];
      if (user === undefined) {
        throw new HttpError(500, 'INTERNAL', 'เกิดข้อผิดพลาดภายในระบบ');
      }
      const publicUser = toPublicUser(user);
      res.status(201).json({ token: signAccessToken(publicUser.id, publicUser.role), user: publicUser });
    } catch (error) {
      if (isDuplicate(error)) {
        throw new HttpError(409, 'CONFLICT', 'เบอร์โทรนี้ถูกใช้แล้ว');
      }
      throw error;
    }
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, name, phone, password_hash, role, buyer_type, lat, lng FROM users WHERE phone = ?',
      [body.phone],
    );
    const user = rows[0];
    const passwordHash = user?.password_hash;
    if (user === undefined || passwordHash === undefined || !(await bcrypt.compare(body.password, passwordHash))) {
      throw new HttpError(401, 'UNAUTHORIZED', 'เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง');
    }
    const publicUser = toPublicUser(user);
    res.json({ token: signAccessToken(publicUser.id, publicUser.role), user: publicUser });
  }),
);

function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}
