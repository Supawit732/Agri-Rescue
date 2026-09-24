import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { round2 } from '../delivery/depot';

export type DashboardScope = 'admin' | 'seller';

export interface DashboardCards {
  kg_saved: number;
  co2e_kg: number;
  farmer_income: number;
  donated_kg: number;
  order_count: number;
}

export interface DashboardResponse {
  scope: DashboardScope;
  cards: DashboardCards;
  charts: {
    daily_kg: { date: string; kg: number }[];
    by_crop: { crop_name_th: string; kg: number }[];
    orders_by_status: { status: string; count: number }[];
    ai_accuracy: { total: number; matched: number; accuracy: number | null };
  };
}

interface ImpactAggRow extends RowDataPacket {
  kg_saved: number;
  co2e_kg: number;
  farmer_income: number;
  donated_kg: number;
}

interface DailyRow extends RowDataPacket {
  day: string;
  kg: number;
}

interface CropRow extends RowDataPacket {
  crop_name_th: string;
  kg: number;
}

interface StatusRow extends RowDataPacket {
  status: string;
  count: number;
}

interface AiRow extends RowDataPacket {
  total: number;
  matched: number;
}

interface CountRow extends RowDataPacket {
  total: number;
}

function formatDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function last14DaysUtc(): string[] {
  const days: string[] = [];
  const now = new Date();
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = 13; i >= 0; i -= 1) {
    days.push(formatDateUtc(new Date(utc - i * 24 * 60 * 60 * 1000)));
  }
  return days;
}

/** Seller scope joins lots/plots; admin is system-wide. */
function sellerFilter(farmerId: number | null): { join: string; where: string; params: number[] } {
  if (farmerId === null) {
    return { join: '', where: '', params: [] };
  }
  return {
    join: `JOIN harvest_lots h ON h.id = o.lot_id
           JOIN plots p ON p.id = h.plot_id`,
    where: 'WHERE p.farmer_id = ?',
    params: [farmerId],
  };
}

export async function buildDashboard(
  scope: DashboardScope,
  farmerId: number | null,
): Promise<DashboardResponse> {
  const filter = sellerFilter(farmerId);

  const [impactRows] = await pool.query<ImpactAggRow[]>(
    `SELECT
       COALESCE(SUM(i.kg_saved), 0) AS kg_saved,
       COALESCE(SUM(i.co2e_kg), 0) AS co2e_kg,
       COALESCE(SUM(CASE WHEN o.is_donation = 0 THEN i.kg_saved * o.agreed_price_per_kg ELSE 0 END), 0) AS farmer_income,
       COALESCE(SUM(CASE WHEN o.is_donation = 1 THEN i.kg_saved ELSE 0 END), 0) AS donated_kg
     FROM impact_logs i
     JOIN orders o ON o.id = i.order_id
     ${filter.join}
     ${filter.where}`,
    filter.params,
  );
  const cardsImpact = impactRows[0];

  const [orderCountRows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS total
     FROM orders o
     ${filter.join}
     ${filter.where}`,
    filter.params,
  );

  const dailyWhere =
    filter.where === ''
      ? 'WHERE i.created_at >= UTC_DATE() - INTERVAL 13 DAY'
      : `${filter.where} AND i.created_at >= UTC_DATE() - INTERVAL 13 DAY`;
  const [dailyRows] = await pool.query<DailyRow[]>(
    `SELECT DATE_FORMAT(i.created_at, '%Y-%m-%d') AS day, COALESCE(SUM(i.kg_saved), 0) AS kg
     FROM impact_logs i
     JOIN orders o ON o.id = i.order_id
     ${filter.join}
     ${dailyWhere}
     GROUP BY DATE_FORMAT(i.created_at, '%Y-%m-%d')
     ORDER BY day ASC`,
    filter.params,
  );
  const dailyMap = new Map(dailyRows.map((r) => [String(r.day), Number(r.kg)]));
  const daily_kg = last14DaysUtc().map((date) => ({
    date,
    kg: round2(dailyMap.get(date) ?? 0),
  }));

  const cropJoin =
    farmerId === null
      ? `FROM impact_logs i
         JOIN orders o ON o.id = i.order_id
         JOIN harvest_lots h ON h.id = o.lot_id
         JOIN crops c ON c.id = h.crop_id`
      : `FROM impact_logs i
         JOIN orders o ON o.id = i.order_id
         JOIN harvest_lots h ON h.id = o.lot_id
         JOIN crops c ON c.id = h.crop_id
         JOIN plots p ON p.id = h.plot_id
         WHERE p.farmer_id = ?`;
  const [cropRows] = await pool.query<CropRow[]>(
    `SELECT c.name_th AS crop_name_th, COALESCE(SUM(i.kg_saved), 0) AS kg
     ${cropJoin}
     GROUP BY c.id, c.name_th
     ORDER BY kg DESC, c.name_th ASC`,
    farmerId === null ? [] : [farmerId],
  );

  const [statusRows] = await pool.query<StatusRow[]>(
    `SELECT o.status, COUNT(*) AS count
     FROM orders o
     ${filter.join}
     ${filter.where}
     GROUP BY o.status
     ORDER BY o.status ASC`,
    filter.params,
  );

  const aiSql =
    farmerId === null
      ? `FROM quality_assessments qa
         JOIN harvest_lots h ON h.id = qa.lot_id
         WHERE qa.ai_ripeness IS NOT NULL`
      : `FROM quality_assessments qa
         JOIN harvest_lots h ON h.id = qa.lot_id
         JOIN plots p ON p.id = h.plot_id
         WHERE qa.ai_ripeness IS NOT NULL AND p.farmer_id = ?`;
  const [aiRows] = await pool.query<AiRow[]>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN qa.ai_ripeness = h.ripeness THEN 1 ELSE 0 END) AS matched
     ${aiSql}`,
    farmerId === null ? [] : [farmerId],
  );
  const total = Number(aiRows[0]?.total ?? 0);
  const matched = Number(aiRows[0]?.matched ?? 0);

  return {
    scope,
    cards: {
      kg_saved: round2(Number(cardsImpact?.kg_saved ?? 0)),
      co2e_kg: round2(Number(cardsImpact?.co2e_kg ?? 0)),
      farmer_income: round2(Number(cardsImpact?.farmer_income ?? 0)),
      donated_kg: round2(Number(cardsImpact?.donated_kg ?? 0)),
      order_count: Number(orderCountRows[0]?.total ?? 0),
    },
    charts: {
      daily_kg,
      by_crop: cropRows.map((r) => ({
        crop_name_th: String(r.crop_name_th),
        kg: round2(Number(r.kg)),
      })),
      orders_by_status: statusRows.map((r) => ({
        status: String(r.status),
        count: Number(r.count),
      })),
      ai_accuracy: {
        total,
        matched,
        accuracy: total === 0 ? null : round2(matched / total),
      },
    },
  };
}
