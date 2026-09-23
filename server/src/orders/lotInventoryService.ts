import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { lotStatusFromRemaining, remainingLotKg, roundKg } from '../domain/lotInventory';
import { assertLotTransition, type LotStatus } from '../domain/lotStateMachine';
import { HttpError } from '../http/errors';

const ACTIVE_ORDER_SQL = `status IN ('reserved', 'picked', 'delivered')`;

export async function sumReservedQuantityKg(
  connection: PoolConnection,
  lotId: number,
  excludeOrderId?: number,
): Promise<number> {
  const [rows] = await connection.query<RowDataPacket[]>(
    excludeOrderId === undefined
      ? `SELECT COALESCE(SUM(quantity_kg), 0) AS total
         FROM orders WHERE lot_id = ? AND ${ACTIVE_ORDER_SQL}`
      : `SELECT COALESCE(SUM(quantity_kg), 0) AS total
         FROM orders WHERE lot_id = ? AND ${ACTIVE_ORDER_SQL} AND id <> ?`,
    excludeOrderId === undefined ? [lotId] : [lotId, excludeOrderId],
  );
  return roundKg(Number(rows[0]?.total ?? 0));
}

export async function syncLotBookableStatus(
  connection: PoolConnection,
  lotId: number,
  weightKg: number,
  currentStatus: LotStatus,
): Promise<LotStatus> {
  const reserved = await sumReservedQuantityKg(connection, lotId);
  const remaining = remainingLotKg(weightKg, reserved);
  const next = lotStatusFromRemaining(remaining, weightKg) as LotStatus;

  // During fulfillment (picked), keep picked until drop sync handles delivered.
  if (currentStatus === 'picked' && next === 'fully_reserved') {
    return currentStatus;
  }
  if (currentStatus === 'delivered' || currentStatus === 'expired' || currentStatus === 'cancelled') {
    return currentStatus;
  }
  if (next !== currentStatus) {
    assertLotTransition(currentStatus, next);
    await connection.query('UPDATE harvest_lots SET status = ? WHERE id = ?', [next, lotId]);
  }
  return next;
}

export async function finalizeLotIfComplete(
  connection: PoolConnection,
  lotId: number,
): Promise<LotStatus> {
  const [lots] = await connection.query<RowDataPacket[]>(
    'SELECT id, status, weight_kg FROM harvest_lots WHERE id = ? FOR UPDATE',
    [lotId],
  );
  const lot = lots[0];
  if (lot === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบล็อต');
  }
  const weightKg = Number(lot.weight_kg);
  const reserved = await sumReservedQuantityKg(connection, lotId);
  const remaining = remainingLotKg(weightKg, reserved);
  const [active] = await connection.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM orders
     WHERE lot_id = ? AND status IN ('reserved', 'picked')`,
    [lotId],
  );
  const activeCount = Number(active[0]?.c ?? 0);
  const current = lot.status as LotStatus;
  if (remaining <= 0 && activeCount === 0) {
    if (current !== 'delivered') {
      assertLotTransition(current === 'picked' ? 'picked' : current, 'delivered');
      await connection.query('UPDATE harvest_lots SET status = ? WHERE id = ?', ['delivered', lotId]);
    }
    return 'delivered';
  }
  if (activeCount > 0) {
    const [pickedOnly] = await connection.query<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN status = 'picked' THEN 1 ELSE 0 END) AS picked_c,
         SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reserved_c
       FROM orders WHERE lot_id = ? AND status IN ('reserved', 'picked')`,
      [lotId],
    );
    const reservedC = Number(pickedOnly[0]?.reserved_c ?? 0);
    if (reservedC === 0 && remaining <= 0) {
      if (current !== 'picked' && current !== 'delivered') {
        assertLotTransition(current, 'picked');
        await connection.query('UPDATE harvest_lots SET status = ? WHERE id = ?', ['picked', lotId]);
        return 'picked';
      }
      return current === 'delivered' ? current : 'picked';
    }
  }
  return syncLotBookableStatus(connection, lotId, weightKg, current);
}

/** Used by expire job: open with no bookings, or leftover-only partially_reserved past expiry. */
export async function expireOpenLots(connection: PoolConnection, now: Date): Promise<number> {
  const [result] = await connection.query<ResultSetHeader>(
    `UPDATE harvest_lots
     SET status = 'expired'
     WHERE status IN ('open', 'partially_reserved')
       AND expires_at <= ?
       AND id NOT IN (
         SELECT lot_id FROM orders WHERE status IN ('reserved', 'picked')
       )`,
    [now],
  );
  return result.affectedRows;
}
