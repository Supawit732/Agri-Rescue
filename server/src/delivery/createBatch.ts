import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import { haversineKm } from '../domain/geo';
import { defaultRouteSolver, type RoutableStop } from '../domain/routing';
import { HttpError } from '../http/errors';
import { depotPoint, round2 } from './depot';
import { toBatchJson, toStopJson, type BatchRow, type StopRow } from './present';

interface ReservedOrder extends RowDataPacket {
  id: number;
  lot_id: number;
  buyer_id: number;
  plot_lat: number;
  plot_lng: number;
  buyer_lat: number | null;
  buyer_lng: number | null;
}

interface DraftStop {
  key: string;
  stopType: 'pickup' | 'drop';
  lotId: number | null;
  buyerId: number;
  lat: number;
  lng: number;
}

export async function createBatch(): Promise<{ batch: ReturnType<typeof toBatchJson>; stops: ReturnType<typeof toStopJson>[] }> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.query<ReservedOrder[]>(
      `SELECT o.id, o.lot_id, o.buyer_id, p.lat AS plot_lat, p.lng AS plot_lng,
              u.lat AS buyer_lat, u.lng AS buyer_lng
       FROM orders o
       JOIN harvest_lots h ON h.id = o.lot_id
       JOIN plots p ON p.id = h.plot_id
       JOIN users u ON u.id = o.buyer_id
       WHERE o.status = 'reserved' AND o.batch_id IS NULL
       ORDER BY o.id
       FOR UPDATE`,
    );
    if (orders.length === 0) {
      throw new HttpError(409, 'EMPTY_BATCH', 'ไม่มีคำสั่งซื้อที่รอจัดรอบ');
    }
    const drafts = draftStops(orders);
    const depot = depotPoint();
    const routable: RoutableStop[] = drafts.map((stop) => ({
      id: stop.key,
      kind: stop.stopType,
      buyerId: String(stop.buyerId),
      lat: stop.lat,
      lng: stop.lng,
    }));
    const solved = defaultRouteSolver.solve(depot, routable);
    const byKey = new Map(drafts.map((stop) => [stop.key, stop]));
    let previous = depot;
    const legs = solved.map((stop) => {
      const leg = round2(haversineKm(previous, stop));
      previous = stop;
      return leg;
    });
    const plannedKm = round2(legs.reduce((sum, leg) => sum + leg, 0));
    const [batchResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO batches (driver_id, status, planned_km) VALUES (NULL, 'planned', ?)`,
      [plannedKm],
    );
    const batchId = batchResult.insertId;
    for (let index = 0; index < solved.length; index += 1) {
      const solvedStop = solved[index];
      const draft = solvedStop === undefined ? undefined : byKey.get(solvedStop.id);
      const leg = legs[index];
      if (draft === undefined || leg === undefined) {
        throw new HttpError(500, 'INTERNAL', 'เกิดข้อผิดพลาดภายในระบบ');
      }
      await connection.query(
        `INSERT INTO route_stops
           (batch_id, seq, stop_type, lot_id, buyer_id, lat, lng, leg_km, status, weight_flag)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
        [batchId, index + 1, draft.stopType, draft.lotId, draft.buyerId, draft.lat, draft.lng, leg],
      );
    }
    for (const order of orders) {
      await connection.query('UPDATE orders SET batch_id = ? WHERE id = ?', [batchId, order.id]);
    }
    const payload = await loadBatch(connection, batchId);
    await connection.commit();
    return payload;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function loadBatch(
  connection: PoolConnection,
  batchId: number,
): Promise<{ batch: ReturnType<typeof toBatchJson>; stops: ReturnType<typeof toStopJson>[] }> {
  const [batches] = await connection.query<BatchRow[]>(
    'SELECT id, driver_id, status, planned_km, created_at FROM batches WHERE id = ?',
    [batchId],
  );
  const batch = batches[0];
  if (batch === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรอบวิ่ง');
  }
  const [stops] = await connection.query<StopRow[]>(
    `SELECT id, seq, stop_type, lot_id, buyer_id, lat, lng, leg_km, status, confirmed_weight_kg, weight_flag
     FROM route_stops
     WHERE batch_id = ?
     ORDER BY seq`,
    [batchId],
  );
  return { batch: toBatchJson(batch), stops: stops.map((stop) => toStopJson(stop)) };
}

function draftStops(orders: readonly ReservedOrder[]): DraftStop[] {
  const pickups: DraftStop[] = orders.map((order) => ({
    key: `pickup:${order.lot_id}`,
    stopType: 'pickup',
    lotId: Number(order.lot_id),
    buyerId: Number(order.buyer_id),
    lat: Number(order.plot_lat),
    lng: Number(order.plot_lng),
  }));
  pickups.sort((left, right) => (left.lotId ?? 0) - (right.lotId ?? 0));
  const dropsByBuyer = new Map<number, DraftStop>();
  for (const order of orders) {
    const buyerId = Number(order.buyer_id);
    if (dropsByBuyer.has(buyerId)) {
      continue;
    }
    if (order.buyer_lat === null || order.buyer_lng === null) {
      throw new HttpError(400, 'VALIDATION', 'ผู้ซื้อยังไม่มีพิกัด');
    }
    dropsByBuyer.set(buyerId, {
      key: `drop:${buyerId}`,
      stopType: 'drop',
      lotId: null,
      buyerId,
      lat: Number(order.buyer_lat),
      lng: Number(order.buyer_lng),
    });
  }
  const drops = [...dropsByBuyer.values()].sort((left, right) => left.buyerId - right.buyerId);
  return [...pickups, ...drops];
}
