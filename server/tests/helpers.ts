import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../src/db/pool';
import { createApp } from '../src/app';
import type { UserRole } from '../src/types/express';

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
  org_status?: string;
  application_kind?: string | null;
  draft_step?: number | null;
  donor_tier?: string | null;
  requested_fields?: string[];
  donor_terms_version?: string | null;
  line_id: string | null;
  lat: number | null;
  lng: number | null;
}

export interface AuthBody {
  token: string;
  user: PublicUser;
}

let phoneSeq = 800000000;

export function nextPhone(): string {
  phoneSeq += 1;
  return String(phoneSeq);
}

export function testApp(): Express {
  return createApp();
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export async function registerUser(
  app: Express,
  input: {
    role?: 'farmer' | 'buyer';
    can_sell?: boolean;
    can_buy?: boolean;
    buyer_type?: 'vendor' | 'shop' | 'charity';
    lat?: number;
    lng?: number;
    name?: string;
  },
): Promise<AuthBody> {
  const canSell = input.can_sell ?? input.role === 'farmer';
  const canBuy = input.can_buy ?? input.role === 'buyer';
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      name: input.name ?? 'ผู้ใช้ทดสอบ',
      phone: nextPhone(),
      password: 'demo1234',
      can_sell: canSell === true,
      can_buy: canBuy === true,
      buyer_type: canBuy === true ? (input.buyer_type ?? 'vendor') : null,
      lat: input.lat ?? 13.65,
      lng: input.lng ?? 100.62,
    });
  if (response.status !== 201) {
    throw new Error(`register failed ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body as AuthBody;
}

export async function loginStaff(
  app: Express,
  role: 'driver' | 'coordinator',
  name: string,
): Promise<AuthBody> {
  const phone = nextPhone();
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const canBuy = role === 'driver' ? 1 : 0;
  const isAdmin = role === 'coordinator' ? 1 : 0;
  await pool.query(
    `INSERT INTO users (name, phone, password_hash, role, can_sell, can_buy, is_admin, lat, lng)
     VALUES (?, ?, ?, ?, 0, ?, ?, NULL, NULL)`,
    [name, phone, passwordHash, role, canBuy, isAdmin],
  );
  const response = await request(app).post('/api/auth/login').send({ phone, password: 'demo1234' });
  if (response.status !== 200) {
    throw new Error(`staff login failed ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body as AuthBody;
}

export async function insertCrop(name = 'มะม่วง', days = 5, price = 40): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO crops (name_th, base_shelf_days, market_price_per_kg) VALUES (?, ?, ?)',
    [name, days, price],
  );
  return result.insertId;
}

export async function insertPlot(farmerId: number, lat: number, lng: number, name = 'แปลงทดสอบ'): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO plots (farmer_id, name, lat, lng, area_rai) VALUES (?, ?, ?, ?, ?)',
    [farmerId, name, lat, lng, 1],
  );
  return result.insertId;
}

export async function insertLot(input: {
  plotId: number;
  cropId: number;
  expiresAt: Date;
  allowDonation?: boolean;
  donationAudience?: 'verified_org_only' | 'all_donors';
  grade?: 'normal' | 'substandard';
  weightKg?: number;
  splitAllowed?: boolean;
  minOrderKg?: number;
  orderStepKg?: number;
  saleMode?: 'sell' | 'donate' | 'sell_then_donate';
  startPricePerKg?: number | null;
  floorPricePerKg?: number | null;
}): Promise<number> {
  const [cropRows] = await pool.query<RowDataPacket[]>(
    'SELECT market_price_per_kg FROM crops WHERE id = ?',
    [input.cropId],
  );
  const market = Number(cropRows[0]?.market_price_per_kg ?? 40);
  const grade = input.grade ?? 'normal';
  const startDefault = Math.round(market * (grade === 'substandard' ? 0.7 : 1) * 100) / 100;
  const floorDefault = Math.round(startDefault * 0.3 * 100) / 100;
  // Legacy allowDonation:true without saleMode → sell_then_donate already open (donation_opened=1)
  const legacyOpen = input.allowDonation === true && input.saleMode === undefined;
  const saleMode = input.saleMode ?? (legacyOpen ? 'sell_then_donate' : 'sell');
  const donationOpened = legacyOpen ? 1 : 0;
  const allowDonation = saleMode === 'donate' || donationOpened === 1 ? 1 : 0;
  const start =
    saleMode === 'donate'
      ? null
      : input.startPricePerKg === undefined
        ? startDefault
        : input.startPricePerKg;
  const floor =
    saleMode === 'donate'
      ? null
      : input.floorPricePerKg === undefined
        ? floorDefault
        : input.floorPricePerKg;
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO harvest_lots (
       plot_id, crop_id, weight_kg, split_allowed, min_order_kg, order_step_kg,
       grade, ripeness, allow_donation, donation_audience,
       start_price_per_kg, floor_price_per_kg, sale_mode, donation_opened,
       market_price_snapshot, market_price_is_estimate,
       predicted_shelf_hours, expires_at, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'open')`,
    [
      input.plotId,
      input.cropId,
      input.weightKg ?? 10,
      input.splitAllowed === false ? 0 : 1,
      input.minOrderKg ?? 1,
      input.orderStepKg ?? 1,
      grade,
      2,
      allowDonation,
      input.donationAudience ?? 'verified_org_only',
      start,
      floor,
      saleMode,
      donationOpened,
      market,
      61,
      input.expiresAt,
    ],
  );
  return result.insertId;
}
