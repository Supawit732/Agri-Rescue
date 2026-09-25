import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { pool } from '../db/pool';
import {
  activeDonorTier,
  remainingWeeklyKg,
  weekStartBangkok,
  weeklyCapKg,
  type OrgStatus,
} from '../domain/donorRules';
import { reverseGeocode } from '../geo/nominatim';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth, requireCapability, signAccessToken } from '../middleware/auth';
import { ensureShop } from '../shops/shopService';
import { isValidThaiPhone, normalizePhone } from '../lib/normalizePhone';
import { saveAvatarPhoto } from '../storage/publicUploads';
import type { UserRole } from '../types/express';

export const authRouter = Router();

const buyerTypeSchema = z.enum(['vendor', 'shop', 'charity']);

const emailSchema = z
  .string()
  .trim()
  .email('อีเมลไม่ถูกต้อง')
  .max(255)
  .nullable()
  .optional();

/** Accepts 0XX-XXX-XXXX, spaces, +66, bare digits → stores digits only. */
const phoneInputSchema = z
  .string()
  .transform((v) => normalizePhone(v))
  .refine((v) => isValidThaiPhone(v), 'เบอร์โทรไม่ถูกต้อง');

const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'กรุณากรอกชื่อ'),
    /** Always required on register (D031 revised). */
    phone: phoneInputSchema,
    email: emailSchema,
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
  /** Phone (with or without dashes) or email identity — normalized in handler for lookup. */
  phone: z.string().trim().min(1, 'กรุณากรอกเบอร์โทรหรืออีเมล'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

const profileSchema = z
  .object({
    can_sell: z.literal(true).optional(),
    can_buy: z.literal(true).optional(),
    buyer_type: buyerTypeSchema.optional(),
    email: z.union([emailSchema, z.literal('')]).optional(),
    line_id: z.string().trim().min(1).max(64).nullable().optional(),
    lat: z.number().gte(-90).lte(90).optional(),
    lng: z.number().gte(-180).lte(180).optional(),
  })
  .refine(
    (body) =>
      body.can_sell === true ||
      body.can_buy === true ||
      body.line_id !== undefined ||
      body.email !== undefined ||
      body.lat !== undefined ||
      body.lng !== undefined,
    {
      message: 'ไม่มีข้อมูลที่จะอัปเดต',
    },
  )
  .refine((body) => (body.lat === undefined) === (body.lng === undefined), {
    message: 'ต้องส่ง lat และ lng คู่กัน',
    path: ['lat'],
  });

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: UserRole;
  can_sell: number | boolean;
  can_buy: number | boolean;
  is_admin: number | boolean;
  line_id: string | null;
  lat: number | null;
  lng: number | null;
  subdistrict_th: string | null;
  district_th: string | null;
  subdistrict_en: string | null;
  district_en: string | null;
  buyer_type: 'vendor' | 'shop' | 'charity' | null;
  charity_approved: number | boolean | null;
  donor_tier: 'volunteer' | 'trusted_volunteer' | 'verified_org' | null;
  beneficiary_count: number | null;
  distribution_mode: 'self_use' | 'redistribute' | null;
  donation_suspended: number | boolean | null;
  trusted_proof_count: number | null;
  org_status: OrgStatus | null;
  org_reject_reason: string | null;
  org_name: string | null;
  application_kind: 'individual' | 'organization' | null;
  draft_step: number | null;
  contact_email: string | null;
  purpose_th: string | null;
  recipient_groups_json: string | null;
  requested_fields_json: string | null;
  donor_terms_version: string | null;
  donor_terms_accepted_at: string | Date | null;
  org_type: string | null;
  created_at?: string | Date;
  avatar?: string | null;
  password_hash?: string;
}

export interface PublicUser {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: UserRole;
  can_sell: boolean;
  can_buy: boolean;
  is_admin: boolean;
  buyer_type: 'vendor' | 'shop' | 'charity' | null;
  charity_approved: boolean;
  donor_tier: 'volunteer' | 'trusted_volunteer' | 'verified_org' | null;
  beneficiary_count: number | null;
  distribution_mode: 'self_use' | 'redistribute' | null;
  donation_suspended: boolean;
  trusted_proof_count: number;
  org_status: OrgStatus;
  org_reject_reason: string | null;
  org_name: string | null;
  application_kind: 'individual' | 'organization' | null;
  draft_step: number | null;
  contact_email: string | null;
  purpose_th: string | null;
  recipient_groups: string[];
  requested_fields: string[];
  donor_terms_version: string | null;
  donor_terms_accepted_at: string | null;
  org_type: string | null;
  donation_weekly_cap_kg: number | null;
  donation_remaining_kg: number | null;
  line_id: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string | null;
  avatar: string | null;
  subdistrict_th: string | null;
  district_th: string | null;
  subdistrict_en: string | null;
  district_en: string | null;
}

function parseJsonStringArray(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === '') {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function asBool(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

export function toPublicUser(row: UserRow): PublicUser {
  const orgStatus = (row.org_status ?? 'none') as OrgStatus;
  const donorTier = row.donor_tier ?? null;
  const active = activeDonorTier({ donor_tier: donorTier, org_status: orgStatus });
  const capKg =
    active === null ? null : weeklyCapKg(active, row.beneficiary_count === null || row.beneficiary_count === undefined ? null : Number(row.beneficiary_count));
  const termsAt = row.donor_terms_accepted_at;
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone,
    email: row.email === null || row.email === undefined ? null : String(row.email),
    role: row.role,
    can_sell: asBool(row.can_sell),
    can_buy: asBool(row.can_buy),
    is_admin: asBool(row.is_admin),
    buyer_type: row.buyer_type,
    charity_approved: asBool(row.charity_approved),
    donor_tier: donorTier,
    beneficiary_count: row.beneficiary_count === null || row.beneficiary_count === undefined ? null : Number(row.beneficiary_count),
    distribution_mode: row.distribution_mode ?? null,
    donation_suspended: asBool(row.donation_suspended),
    trusted_proof_count: Number(row.trusted_proof_count ?? 0),
    org_status: orgStatus,
    org_reject_reason: row.org_reject_reason ?? null,
    org_name: row.org_name ?? null,
    application_kind: row.application_kind ?? null,
    draft_step: row.draft_step === null || row.draft_step === undefined ? null : Number(row.draft_step),
    contact_email: row.contact_email ?? null,
    purpose_th: row.purpose_th ?? null,
    recipient_groups: parseJsonStringArray(row.recipient_groups_json),
    requested_fields: parseJsonStringArray(row.requested_fields_json),
    donor_terms_version: row.donor_terms_version ?? null,
    donor_terms_accepted_at:
      termsAt === null || termsAt === undefined ? null : new Date(termsAt as string).toISOString(),
    org_type: row.org_type ?? null,
    donation_weekly_cap_kg: capKg,
    donation_remaining_kg: capKg,
    line_id: row.line_id,
    lat: row.lat,
    lng: row.lng,
    created_at:
      row.created_at === null || row.created_at === undefined
        ? null
        : new Date(row.created_at as string).toISOString(),
    avatar: row.avatar === null || row.avatar === undefined ? null : String(row.avatar),
    subdistrict_th: row.subdistrict_th ?? null,
    district_th: row.district_th ?? null,
    subdistrict_en: row.subdistrict_en ?? null,
    district_en: row.district_en ?? null,
  };
}

const USER_SELECT = `SELECT u.id, u.name, u.phone, u.email, u.role, u.can_sell, u.can_buy, u.is_admin,
                            u.line_id, u.lat, u.lng, u.created_at, u.avatar, u.subdistrict_th, u.district_th,
                            u.subdistrict_en, u.district_en,
                            bp.buyer_type, bp.charity_approved, bp.donor_tier, bp.beneficiary_count,
                            bp.distribution_mode, bp.donation_suspended, bp.trusted_proof_count,
                            bp.org_status, bp.org_reject_reason, bp.org_name,
                            bp.application_kind, bp.draft_step, bp.contact_email, bp.purpose_th,
                            bp.recipient_groups_json, bp.requested_fields_json,
                            bp.donor_terms_version, bp.donor_terms_accepted_at, bp.org_type
                     FROM users u
                     LEFT JOIN buyer_profiles bp ON bp.user_id = u.id`;

export async function loadPublicUser(userId: number): Promise<PublicUser> {
  const [rows] = await pool.query<UserRow[]>(`${USER_SELECT} WHERE u.id = ?`, [userId]);
  const user = rows[0];
  if (user === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
  }
  const publicUser = toPublicUser(user);
  if (publicUser.donation_weekly_cap_kg !== null && !publicUser.donation_suspended) {
    const start = weekStartBangkok();
    const [usedRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(h.weight_kg), 0) AS used_kg
       FROM orders o
       JOIN harvest_lots h ON h.id = o.lot_id
       WHERE o.buyer_id = ?
         AND o.is_donation = 1
         AND o.status <> 'cancelled'
         AND o.created_at >= ?`,
      [userId, start],
    );
    const usedKg = Number(usedRows[0]?.used_kg ?? 0);
    publicUser.donation_remaining_kg = remainingWeeklyKg(publicUser.donation_weekly_cap_kg, usedKg);
  } else {
    publicUser.donation_remaining_kg = null;
  }
  return publicUser;
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
    let newUserId = 0;
    try {
      await connection.beginTransaction();
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO users (name, phone, email, password_hash, role, can_sell, can_buy, is_admin, line_id, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          body.name,
          body.phone,
          body.email ?? null,
          passwordHash,
          role,
          body.can_sell ? 1 : 0,
          body.can_buy ? 1 : 0,
          body.line_id ?? null,
          body.lat ?? null,
          body.lng ?? null,
        ],
      );
      newUserId = result.insertId;
      if (body.can_buy && body.buyer_type !== undefined && body.buyer_type !== null) {
        const isCharity = body.buyer_type === 'charity';
        await connection.query(
          `INSERT INTO buyer_profiles (
             user_id, buyer_type, charity_approved, donor_tier, org_status, draft_step
           ) VALUES (?, ?, ?, NULL, ?, ?)`,
          [
            result.insertId,
            body.buyer_type,
            charityApproved,
            isCharity ? 'draft' : 'none',
            isCharity ? 0 : null,
          ],
        );
      }
      if (body.can_sell) {
        await ensureShop(result.insertId, connection);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (isDuplicate(error)) {
        throw new HttpError(409, 'CONFLICT', 'เบอร์โทรหรืออีเมลนี้ถูกใช้แล้ว');
      }
      throw error;
    } finally {
      connection.release();
    }
    const publicUser = await loadPublicUser(newUserId);
    res.status(201).json({ token: tokenFor(publicUser), user: publicUser });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const rawIdentity = body.phone;
    const isEmail = rawIdentity.includes('@');
    const phoneNorm = isEmail ? '' : normalizePhone(rawIdentity);
    const emailNorm = isEmail ? rawIdentity.toLowerCase() : '';
    if (!isEmail && !isValidThaiPhone(phoneNorm) && phoneNorm.replace(/^0/, '').length < 9) {
      // Allow seed/test phones that may lack leading 0 (e.g. 800000001).
      // Still reject obvious garbage.
      if (!/^\d{7,15}$/.test(phoneNorm)) {
        throw new HttpError(400, 'VALIDATION', 'เบอร์โทรหรืออีเมลไม่ถูกต้อง');
      }
    }
    const [authRows] = await pool.query<UserRow[]>(
      `SELECT u.id, u.name, u.phone, u.email, u.role, u.can_sell, u.can_buy, u.is_admin,
              u.line_id, u.lat, u.lng, u.created_at, u.avatar,
              u.subdistrict_th, u.district_th, u.subdistrict_en, u.district_en, u.password_hash,
              bp.buyer_type, bp.charity_approved, bp.donor_tier, bp.beneficiary_count,
              bp.distribution_mode, bp.donation_suspended, bp.trusted_proof_count,
              bp.org_status, bp.org_reject_reason, bp.org_name,
              bp.application_kind, bp.draft_step, bp.contact_email, bp.purpose_th,
              bp.recipient_groups_json, bp.requested_fields_json,
              bp.donor_terms_version, bp.donor_terms_accepted_at, bp.org_type
       FROM users u
       LEFT JOIN buyer_profiles bp ON bp.user_id = u.id
       WHERE u.phone = ? OR u.phone = ? OR u.email = ?`,
      [rawIdentity, phoneNorm || rawIdentity, isEmail ? emailNorm : rawIdentity],
    );
    const user = authRows[0];
    const passwordHash = user?.password_hash;
    if (user === undefined || passwordHash === undefined || !(await bcrypt.compare(body.password, passwordHash))) {
      throw new HttpError(401, 'UNAUTHORIZED', 'เบอร์โทร/อีเมล หรือรหัสผ่านไม่ถูกต้อง');
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

const avatarSchema = z.object({
  base64: z.string().min(1),
  mime: z.string().min(1).max(128),
});

authRouter.post(
  '/avatar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = avatarSchema.parse(req.body);
    const userId = req.auth?.id ?? 0;
    const saved = await saveAvatarPhoto({ base64: body.base64, mime: body.mime });
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [saved.url, userId]);
    // Keep shop avatar in sync so shop header/cover fallback shows the photo.
    await pool.query('UPDATE shops SET avatar = ? WHERE user_id = ?', [saved.url, userId]);
    const user = await loadPublicUser(userId);
    res.json({ user, avatar: saved.url });
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
        `SELECT u.id, u.name, u.phone, u.email, u.role, u.can_sell, u.can_buy, u.is_admin,
                u.line_id, u.lat, u.lng, u.subdistrict_th, u.district_th,
                u.subdistrict_en, u.district_en,
                bp.buyer_type, bp.charity_approved
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
      // Segregation of duties (D032): admin must not buy or sell.
      if (asBool(current.is_admin)) {
        if (body.can_sell === true || body.can_buy === true) {
          throw new HttpError(403, 'FORBIDDEN', 'บัญชีผู้ดูแลระบบขายหรือซื้อไม่ได้');
        }
        canSell = false;
        canBuy = false;
      }
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
          const isCharity = body.buyer_type === 'charity';
          await connection.query(
            `INSERT INTO buyer_profiles (user_id, buyer_type, charity_approved, org_status, draft_step)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, body.buyer_type, approved, isCharity ? 'draft' : 'none', isCharity ? 0 : null],
          );
        } else if (body.buyer_type !== undefined && body.buyer_type !== current.buyer_type) {
          throw new HttpError(400, 'VALIDATION', 'เปลี่ยนประเภทผู้ซื้อไม่ได้ กรุณาติดต่อผู้ดูแล');
        }
      }
      const lineId = body.line_id !== undefined ? body.line_id : current.line_id;
      const email =
        body.email === undefined
          ? (current.email ?? null)
          : body.email === '' || body.email === null
            ? null
            : body.email;
      const role =
        current.role === 'driver' || current.role === 'coordinator'
          ? current.role
          : primaryRole(canSell, canBuy);
      let lat = current.lat === null || current.lat === undefined ? null : Number(current.lat);
      let lng = current.lng === null || current.lng === undefined ? null : Number(current.lng);
      let subdistrictTh = current.subdistrict_th ?? null;
      let districtTh = current.district_th ?? null;
      let subdistrictEn = current.subdistrict_en ?? null;
      let districtEn = current.district_en ?? null;
      if (body.lat !== undefined && body.lng !== undefined) {
        lat = body.lat;
        lng = body.lng;
        const geo = await reverseGeocode(body.lat, body.lng);
        subdistrictTh = geo.subdistrictTh;
        districtTh = geo.districtTh;
        subdistrictEn = geo.subdistrictEn;
        districtEn = geo.districtEn;
      }
      await connection.query(
        `UPDATE users
         SET can_sell = ?, can_buy = ?, email = ?, line_id = ?, role = ?,
             lat = ?, lng = ?, subdistrict_th = ?, district_th = ?,
             subdistrict_en = ?, district_en = ?
         WHERE id = ?`,
        [
          canSell ? 1 : 0,
          canBuy ? 1 : 0,
          email,
          lineId,
          role,
          lat,
          lng,
          subdistrictTh,
          districtTh,
          subdistrictEn,
          districtEn,
          userId,
        ],
      );
      // Seller pickup: keep plot coords/labels in sync with the profile location.
      if (body.lat !== undefined && body.lng !== undefined && canSell) {
        await connection.query(
          `UPDATE plots SET lat = ?, lng = ?, subdistrict_th = ?, district_th = ?, subdistrict_en = ?, district_en = ? WHERE farmer_id = ?`,
          [lat, lng, subdistrictTh, districtTh, subdistrictEn, districtEn, userId],
        );
      }
      if (body.can_sell === true || (canSell && !current.can_sell)) {
        await ensureShop(userId, connection);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (isDuplicate(error)) {
        throw new HttpError(409, 'CONFLICT', 'อีเมลนี้ถูกใช้แล้ว');
      }
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
      `UPDATE buyer_profiles
       SET charity_approved = 1, donor_tier = 'verified_org', org_status = 'approved',
           org_reviewed_at = UTC_TIMESTAMP(),
           distribution_mode = COALESCE(distribution_mode, 'redistribute'),
           beneficiary_count = COALESCE(beneficiary_count, 100),
           org_name = COALESCE(org_name, 'องค์กรสงเคราะห์')
       WHERE user_id = ? AND buyer_type = 'charity' AND charity_approved = 0`,
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
