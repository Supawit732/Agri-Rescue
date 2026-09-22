import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../db/pool';
import { CO2E_PER_KG } from '../db/seedData';
import { assertLotTransition, InvalidLotTransitionError, type LotStatus } from '../domain/lotStateMachine';
import { HttpError } from '../http/errors';
import { round2 } from './depot';
import { loadBatch } from './createBatch';
import { toStopJson, type StopRow } from './present';

interface LockedStop extends StopRow {
  driver_id: number;
}

interface PickupContext extends RowDataPacket {
  lot_id: number;
  lot_status: LotStatus;
  weight_kg: number;
  order_id: number;
  order_status: string;
}

interface DropOrder extends RowDataPacket {
  id: number;
  lot_id: number;
  status: string;
  drop_otp: string;
  is_donation: number;
}

const ASSIGNED_ONLY = 'ดูหรือยืนยันได้เฉพาะรอบที่มอบหมายให้ตนเอง';

export async function confirmStop(
  stopId: number,
  driverId: number,
  body: { weight_kg?: number; otp?: string },
): Promise<{
  stop: ReturnType<typeof toStopJson>;
  lot_status: LotStatus | null;
  order_status: string | null;
  batch_status: 'planned' | 'in_progress' | 'completed';
}> {
  const connection = await pool.getConnection();
  let finished = false;
  try {
    await connection.beginTransaction();
    const stop = await lockStop(connection, stopId);
    if (Number(stop.driver_id) !== driverId) {
      throw new HttpError(403, 'FORBIDDEN', ASSIGNED_ONLY);
    }
    if (stop.status === 'done') {
      throw new HttpError(409, 'STOP_DONE', 'จุดนี้ยืนยันไปแล้ว');
    }
    let lotStatus: LotStatus | null = null;
    let orderStatus: string | null = null;
    if (stop.stop_type === 'pickup') {
      const confirmed = await confirmPickup(connection, stop, body.weight_kg);
      lotStatus = confirmed.lotStatus;
      orderStatus = confirmed.orderStatus;
    } else {
      const confirmed = await confirmDrop(connection, stop, body.otp);
      if (confirmed.kind === 'otp_failed') {
        await connection.commit();
        finished = true;
        throw confirmed.error;
      }
      lotStatus = confirmed.lotStatus;
      orderStatus = confirmed.orderStatus;
    }
    const batchStatus = await refreshBatchStatus(connection, Number(stop.batch_id));
    const [updatedStops] = await connection.query<StopRow[]>(
      `SELECT id, batch_id, seq, stop_type, lot_id, buyer_id, lat, lng, leg_km, status,
              confirmed_weight_kg, weight_flag, otp_attempts
       FROM route_stops WHERE id = ?`,
      [stop.id],
    );
    const updated = updatedStops[0];
    if (updated === undefined) {
      throw new HttpError(500, 'INTERNAL', 'เกิดข้อผิดพลาดภายในระบบ');
    }
    await connection.commit();
    finished = true;
    return {
      stop: toStopJson(updated),
      lot_status: lotStatus,
      order_status: orderStatus,
      batch_status: batchStatus,
    };
  } catch (error) {
    if (!finished) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function unlockStop(stopId: number): Promise<{ id: number; otp_attempts: number; locked: boolean }> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM route_stops WHERE id = ?', [stopId]);
  if (rows[0] === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบจุดแวะ');
  }
  await pool.query('UPDATE route_stops SET otp_attempts = 0 WHERE id = ?', [stopId]);
  return { id: stopId, otp_attempts: 0, locked: false };
}

async function lockStop(connection: PoolConnection, stopId: number): Promise<LockedStop> {
  const [stops] = await connection.query<LockedStop[]>(
    `SELECT s.id, s.batch_id, s.seq, s.stop_type, s.lot_id, s.buyer_id, s.lat, s.lng, s.leg_km,
            s.status, s.confirmed_weight_kg, s.weight_flag, s.otp_attempts, b.driver_id
     FROM route_stops s
     JOIN batches b ON b.id = s.batch_id
     WHERE s.id = ?
     FOR UPDATE`,
    [stopId],
  );
  const stop = stops[0];
  if (stop === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบจุดแวะ');
  }
  return stop;
}

async function confirmPickup(
  connection: PoolConnection,
  stop: LockedStop,
  weightKg: number | undefined,
): Promise<{ lotStatus: LotStatus; orderStatus: string }> {
  if (weightKg === undefined || !(weightKg > 0)) {
    throw new HttpError(400, 'VALIDATION', 'กรุณากรอกน้ำหนักที่ชั่งได้');
  }
  const [rows] = await connection.query<PickupContext[]>(
    `SELECT h.id AS lot_id, h.status AS lot_status, h.weight_kg,
            o.id AS order_id, o.status AS order_status
     FROM harvest_lots h
     JOIN orders o ON o.lot_id = h.id AND o.batch_id = ?
     WHERE h.id = ?
     FOR UPDATE`,
    [stop.batch_id, stop.lot_id],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อตของจุดรับนี้');
  }
  if (row.order_status !== 'reserved') {
    throw new HttpError(409, 'CONFLICT', 'คำสั่งซื้อนี้ยืนยันรับของไม่ได้');
  }
  try {
    assertLotTransition(row.lot_status, 'picked');
  } catch (error) {
    if (error instanceof InvalidLotTransitionError) {
      throw new HttpError(409, 'CONFLICT', 'สถานะล็อตไม่พร้อมยืนยัน');
    }
    throw error;
  }
  const planned = Number(row.weight_kg);
  const weightFlag = Math.abs(weightKg - planned) / planned > 0.1 ? 1 : 0;
  await connection.query('UPDATE harvest_lots SET status = ? WHERE id = ?', ['picked', row.lot_id]);
  await connection.query('UPDATE orders SET status = ? WHERE id = ?', ['picked', row.order_id]);
  await connection.query(
    `UPDATE route_stops
     SET status = 'done', confirmed_weight_kg = ?, weight_flag = ?, confirmed_at = ?
     WHERE id = ?`,
    [weightKg, weightFlag, new Date(), stop.id],
  );
  return { lotStatus: 'picked', orderStatus: 'picked' };
}

async function confirmDrop(
  connection: PoolConnection,
  stop: LockedStop,
  otp: string | undefined,
): Promise<
  | { kind: 'delivered'; lotStatus: LotStatus; orderStatus: string }
  | { kind: 'otp_failed'; error: HttpError }
> {
  if (otp === undefined || !/^\d{4}$/.test(otp)) {
    throw new HttpError(400, 'VALIDATION', 'รหัสยืนยันต้องเป็นตัวเลข 4 หลัก');
  }
  const [orders] = await connection.query<DropOrder[]>(
    `SELECT id, lot_id, status, drop_otp, is_donation
     FROM orders
     WHERE batch_id = ? AND buyer_id = ?
     FOR UPDATE`,
    [stop.batch_id, stop.buyer_id],
  );
  if (orders.length === 0) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบคำสั่งซื้อของจุดส่งนี้');
  }
  if (orders.some((order) => order.status === 'reserved')) {
    throw new HttpError(409, 'PICKUP_REQUIRED', 'ต้องรับสินค้าก่อนส่งมอบ');
  }
  if (Number(stop.otp_attempts) >= 5) {
    throw new HttpError(409, 'OTP_LOCKED', 'จุดนี้ถูกล็อกเพราะกรอกรหัสยืนยันผิดครบ 5 ครั้ง');
  }
  const matching = orders.filter((order) => order.status === 'picked' && order.drop_otp === otp);
  if (matching.length === 0) {
    const attempts = Number(stop.otp_attempts) + 1;
    await connection.query('UPDATE route_stops SET otp_attempts = ? WHERE id = ?', [attempts, stop.id]);
    if (attempts >= 5) {
      return {
        kind: 'otp_failed',
        error: new HttpError(409, 'OTP_LOCKED', 'จุดนี้ถูกล็อกเพราะกรอกรหัสยืนยันผิดครบ 5 ครั้ง'),
      };
    }
    return { kind: 'otp_failed', error: new HttpError(400, 'OTP_MISMATCH', 'รหัสยืนยันไม่ถูกต้อง') };
  }
  for (const order of matching) {
    const [lots] = await connection.query<RowDataPacket[]>(
      'SELECT id, status FROM harvest_lots WHERE id = ? FOR UPDATE',
      [order.lot_id],
    );
    const lot = lots[0];
    if (lot === undefined) {
      throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
    }
    try {
      assertLotTransition(lot.status as LotStatus, 'delivered');
    } catch (error) {
      if (error instanceof InvalidLotTransitionError) {
        throw new HttpError(409, 'CONFLICT', 'สถานะล็อตไม่พร้อมยืนยัน');
      }
      throw error;
    }
    const [pickups] = await connection.query<RowDataPacket[]>(
      `SELECT confirmed_weight_kg
       FROM route_stops
       WHERE batch_id = ? AND stop_type = 'pickup' AND lot_id = ? AND status = 'done'`,
      [stop.batch_id, order.lot_id],
    );
    const confirmedWeight = pickups[0]?.confirmed_weight_kg;
    if (confirmedWeight === undefined || confirmedWeight === null) {
      throw new HttpError(409, 'PICKUP_REQUIRED', 'ต้องรับสินค้าก่อนส่งมอบ');
    }
    const kgSaved = Number(confirmedWeight);
    await connection.query<ResultSetHeader>(
      'INSERT INTO impact_logs (order_id, kg_saved, co2e_kg) VALUES (?, ?, ?)',
      [order.id, kgSaved, round2(kgSaved * CO2E_PER_KG)],
    );
    await connection.query('UPDATE orders SET status = ? WHERE id = ?', ['delivered', order.id]);
    await connection.query('UPDATE harvest_lots SET status = ? WHERE id = ?', ['delivered', order.lot_id]);
  }
  const stillPicked = orders.some((order) => order.status === 'picked' && order.drop_otp !== otp);
  if (!stillPicked) {
    await connection.query('UPDATE route_stops SET status = ? , confirmed_at = ? WHERE id = ?', [
      'done',
      new Date(),
      stop.id,
    ]);
  }
  return { kind: 'delivered', lotStatus: 'delivered', orderStatus: 'delivered' };
}

async function refreshBatchStatus(
  connection: PoolConnection,
  batchId: number,
): Promise<'planned' | 'in_progress' | 'completed'> {
  const loaded = await loadBatch(connection, batchId);
  const doneCount = loaded.stops.filter((stop) => stop.status === 'done').length;
  const status = doneCount === 0 ? 'planned' : doneCount === loaded.stops.length ? 'completed' : 'in_progress';
  await connection.query('UPDATE batches SET status = ? WHERE id = ?', [status, batchId]);
  return status;
}
