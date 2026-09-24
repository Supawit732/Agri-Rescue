import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';

export interface AdminOverview {
  users: {
    total: number;
    sellers: number;
    buyers: number;
    donors: number;
    new_7d: number;
  };
  lots: {
    open: number;
    sold: number;
    expired: number;
  };
  impact: {
    kg_saved: number;
    co2e_kg: number;
    farmer_income: number;
    donated_kg: number;
  };
  actions: {
    org_pending: number;
    support_open: number;
    weight_flags: number;
    otp_locked: number;
    donation_proof_overdue: number;
  };
  health: {
    sell_through_rate: number;
    cancelled_orders: number;
    ai_accuracy: number | null;
  };
  charts: {
    daily_kg: { date: string; kg: number }[];
    by_crop: { name: string; kg: number }[];
    top_shops: { name: string; kg: number }[];
  };
}

function n(v: unknown): number {
  return Number(v ?? 0);
}

function r2(v: unknown): number {
  return Math.round(n(v) * 100) / 100;
}

export async function buildOverview(): Promise<AdminOverview> {
  const [users] = await pool.query<RowDataPacket[]>(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(u.can_sell = 1), 0) AS sellers,
      COALESCE(SUM(u.can_buy = 1), 0) AS buyers,
      (SELECT COUNT(*) FROM buyer_profiles WHERE donor_tier IS NOT NULL AND donor_tier <> '') AS donors,
      COALESCE(SUM(u.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY), 0) AS new_7d
    FROM users u
  `);

  const [lots] = await pool.query<RowDataPacket[]>(`
    SELECT
      COALESCE(SUM(status IN ('open', 'partially_reserved') AND deleted_at IS NULL), 0) AS open_count,
      COALESCE(SUM(status = 'delivered' AND deleted_at IS NULL), 0) AS sold_count,
      COALESCE(SUM(status = 'expired' AND deleted_at IS NULL), 0) AS expired_count
    FROM harvest_lots
  `);

  const [impact] = await pool.query<RowDataPacket[]>(`
    SELECT
      COALESCE(SUM(i.kg_saved), 0) AS kg_saved,
      COALESCE(SUM(i.co2e_kg), 0) AS co2e_kg,
      COALESCE(SUM(CASE WHEN o.is_donation = 0 THEN i.kg_saved * o.agreed_price_per_kg ELSE 0 END), 0) AS farmer_income,
      COALESCE(SUM(CASE WHEN o.is_donation = 1 THEN i.kg_saved ELSE 0 END), 0) AS donated_kg
    FROM impact_logs i
    JOIN orders o ON o.id = i.order_id
  `);

  const [actions] = await pool.query<RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM buyer_profiles
        WHERE org_status IN ('pending', 'needs_more_info')
          AND application_kind = 'organization') AS org_pending,
      (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') AS support_open,
      (SELECT COUNT(*) FROM route_stops WHERE weight_flag = 1) AS weight_flags,
      (SELECT COUNT(*) FROM route_stops WHERE otp_attempts >= 5 AND status <> 'done') AS otp_locked,
      (SELECT COUNT(*) FROM donation_proofs
        WHERE status = 'pending' AND due_at < UTC_TIMESTAMP()) AS donation_proof_overdue
  `);

  const [health] = await pool.query<RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM harvest_lots
        WHERE deleted_at IS NULL AND status = 'delivered') AS delivered_lots,
      (SELECT COUNT(*) FROM harvest_lots
        WHERE deleted_at IS NULL AND status = 'expired') AS expired_lots,
      (SELECT COUNT(*) FROM orders WHERE status = 'cancelled') AS cancelled_orders,
      (SELECT COUNT(*) FROM quality_assessments WHERE method = 'model') AS ai_total,
      (SELECT COUNT(*) FROM quality_assessments
        WHERE method = 'model' AND ai_ripeness IS NOT NULL AND ai_ripeness = ripeness) AS ai_matched
  `);

  const [daily] = await pool.query<RowDataPacket[]>(`
    SELECT DATE(CONVERT_TZ(i.created_at, '+00:00', '+07:00')) AS d, SUM(i.kg_saved) AS kg
    FROM impact_logs i
    WHERE i.created_at >= UTC_TIMESTAMP() - INTERVAL 14 DAY
    GROUP BY DATE(CONVERT_TZ(i.created_at, '+00:00', '+07:00'))
    ORDER BY d ASC
  `);

  const [byCrop] = await pool.query<RowDataPacket[]>(`
    SELECT c.name_th AS name, SUM(i.kg_saved) AS kg
    FROM impact_logs i
    JOIN orders o ON o.id = i.order_id
    JOIN harvest_lots h ON h.id = o.lot_id
    JOIN crops c ON c.id = h.crop_id
    GROUP BY c.id, c.name_th
    ORDER BY kg DESC
    LIMIT 12
  `);

  const [topShops] = await pool.query<RowDataPacket[]>(`
    SELECT s.name, SUM(i.kg_saved) AS kg
    FROM impact_logs i
    JOIN orders o ON o.id = i.order_id
    JOIN harvest_lots h ON h.id = o.lot_id
    JOIN plots p ON p.id = h.plot_id
    JOIN shops s ON s.user_id = p.farmer_id
    GROUP BY s.user_id, s.name
    ORDER BY kg DESC
    LIMIT 5
  `);

  const u = users[0]!;
  const l = lots[0]!;
  const im = impact[0]!;
  const a = actions[0]!;
  const h = health[0]!;
  const delivered = n(h.delivered_lots);
  const expired = n(h.expired_lots);
  const denom = delivered + expired;
  const aiTotal = n(h.ai_total);
  const aiMatched = n(h.ai_matched);

  return {
    users: {
      total: n(u.total),
      sellers: n(u.sellers),
      buyers: n(u.buyers),
      donors: n(u.donors),
      new_7d: n(u.new_7d),
    },
    lots: {
      open: n(l.open_count),
      sold: n(l.sold_count),
      expired: n(l.expired_count),
    },
    impact: {
      kg_saved: r2(im.kg_saved),
      co2e_kg: r2(im.co2e_kg),
      farmer_income: r2(im.farmer_income),
      donated_kg: r2(im.donated_kg),
    },
    actions: {
      org_pending: n(a.org_pending),
      support_open: n(a.support_open),
      weight_flags: n(a.weight_flags),
      otp_locked: n(a.otp_locked),
      donation_proof_overdue: n(a.donation_proof_overdue),
    },
    health: {
      sell_through_rate: denom > 0 ? Math.round((delivered / denom) * 1000) / 10 : 0,
      cancelled_orders: n(h.cancelled_orders),
      ai_accuracy: aiTotal > 0 ? Math.round((aiMatched / aiTotal) * 1000) / 10 : null,
    },
    charts: {
      daily_kg: daily.map((r) => ({ date: String(r.d).slice(0, 10), kg: r2(r.kg) })),
      by_crop: byCrop.map((r) => ({ name: String(r.name), kg: r2(r.kg) })),
      top_shops: topShops.map((r) => ({ name: String(r.name), kg: r2(r.kg) })),
    },
  };
}
