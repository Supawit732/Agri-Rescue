import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import { computePaymentDeadline } from '../domain/paymentDeadline';
import { assertPaymentTransition, type PaymentStatus } from '../domain/paymentStateMachine';
import type { LotStatus } from '../domain/lotStateMachine';
import { HttpError } from '../http/errors';
import { syncLotBookableStatus } from '../orders/lotInventoryService';

export interface PaymentRow extends RowDataPacket {
  id: number;
  order_id: number;
  amount: number;
  status: PaymentStatus;
  provider: string;
  provider_ref: string | null;
  deadline_at: Date;
  paid_at: Date | null;
  created_at: Date;
}

const PAYMENT_COLUMNS =
  'id, order_id, amount, status, provider, provider_ref, deadline_at, paid_at, created_at';

/** Insert a pending payment for a non-donation order in the same transaction. */
export async function createPendingPayment(
  connection: PoolConnection,
  input: { orderId: number; amount: number; now: Date; hoursUntilExpiry: number },
): Promise<Date> {
  const deadlineAt = computePaymentDeadline(input.now, input.hoursUntilExpiry);
  await connection.query(
    `INSERT INTO payments (order_id, amount, status, provider, deadline_at)
     VALUES (?, ?, 'pending', 'mock', ?)`,
    [input.orderId, input.amount, deadlineAt],
  );
  return deadlineAt;
}

export async function getPaymentByOrderId(
  connection: PoolConnection | typeof pool,
  orderId: number,
): Promise<PaymentRow | null> {
  const [rows] = await connection.query<PaymentRow[]>(
    `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id = ?`,
    [orderId],
  );
  return rows[0] ?? null;
}

/** Buyer-triggered mock payment (sandbox only — no real gateway). */
export async function simulatePaymentPaid(
  connection: PoolConnection,
  orderId: number,
): Promise<PaymentRow> {
  const [rows] = await connection.query<PaymentRow[]>(
    `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id = ? FOR UPDATE`,
    [orderId],
  );
  const payment = rows[0];
  if (payment === undefined) {
    throw new HttpError(404, 'NOT_FOUND', 'ไม่พบรายการชำระเงินของคำสั่งซื้อนี้');
  }
  if (payment.status !== 'pending') {
    throw new HttpError(409, 'CONFLICT', 'รายการชำระเงินนี้ไม่ได้อยู่ในสถานะรอชำระ');
  }
  assertPaymentTransition(payment.status, 'paid');
  const paidAt = new Date();
  await connection.query('UPDATE payments SET status = ?, paid_at = ? WHERE id = ?', [
    'paid',
    paidAt,
    payment.id,
  ]);
  return { ...payment, status: 'paid', paid_at: paidAt };
}

interface DuePaymentRow extends RowDataPacket {
  id: number;
  order_id: number;
  order_status: string;
  lot_id: number;
  weight_kg: number;
  lot_status: LotStatus;
}

/** Expire pending payments past their deadline: cancel the order and restore lot stock. */
export async function expireDuePayments(now: Date): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<DuePaymentRow[]>(
      `SELECT p.id, p.order_id, o.status AS order_status, o.lot_id, h.weight_kg, h.status AS lot_status
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       JOIN harvest_lots h ON h.id = o.lot_id
       WHERE p.status = 'pending' AND p.deadline_at <= ?
       FOR UPDATE`,
      [now],
    );
    for (const row of rows) {
      await connection.query('UPDATE payments SET status = ? WHERE id = ?', ['expired', row.id]);
      if (row.order_status === 'reserved') {
        await connection.query('UPDATE orders SET status = ? WHERE id = ?', [
          'cancelled',
          row.order_id,
        ]);
        await syncLotBookableStatus(connection, row.lot_id, Number(row.weight_kg), row.lot_status);
      }
    }
    await connection.commit();
    return rows.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
