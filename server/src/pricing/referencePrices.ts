import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import {
  PRICING_CONFIG,
  isKgUnit,
  toBahtPerKg,
  type ProduceGrade,
  suggestedFloorPrice,
  suggestedStartPrice,
} from '../domain/sellerPricing';
import {
  daysAgoIso,
  fetchMocPrices,
  isoDateOnly,
  latestDayMidpoint,
  type FetchJson,
} from './mocClient';

export interface MarketPriceQuote {
  price_per_kg: number;
  is_estimate: boolean;
  as_of: string | null;
  source: 'moc_dit' | 'crop_fallback';
  unit: string | null;
  product_code: string | null;
  source_url: string | null;
  label_th: string;
}

interface CropPriceRow extends RowDataPacket {
  id: number;
  market_price_per_kg: number;
  dit_product_code: string | null;
  dit_unit: string | null;
  dit_unit_to_kg: number | null;
}

export async function resolveMarketPrice(cropId: number, today = new Date()): Promise<MarketPriceQuote> {
  const [crops] = await pool.query<CropPriceRow[]>(
    `SELECT id, market_price_per_kg, dit_product_code, dit_unit, dit_unit_to_kg FROM crops WHERE id = ?`,
    [cropId],
  );
  const crop = crops[0];
  if (crop === undefined) {
    throw new Error(`crop ${cropId} not found`);
  }
  const minDate = daysAgoIso(PRICING_CONFIG.referenceMaxAgeDays, today);
  const [refs] = await pool.query<RowDataPacket[]>(
    `SELECT date, wholesale_price, unit, product_code, source_url
     FROM crop_reference_prices
     WHERE crop_id = ? AND date >= ? AND wholesale_price IS NOT NULL
     ORDER BY date DESC
     LIMIT 1`,
    [cropId, minDate],
  );
  const ref = refs[0];
  if (ref !== undefined) {
    const unitPrice = Number(ref.wholesale_price);
    const perKg = toBahtPerKg({
      unitPrice,
      unit: ref.unit === null ? crop.dit_unit : String(ref.unit),
      ditUnitToKg: crop.dit_unit_to_kg,
    });
    if (perKg !== null) {
      const asOf = String(ref.date).slice(0, 10);
      return {
        price_per_kg: perKg,
        is_estimate: false,
        as_of: asOf,
        source: 'moc_dit',
        unit: ref.unit === null ? null : String(ref.unit),
        product_code: String(ref.product_code),
        source_url: String(ref.source_url),
        label_th: `ราคาตลาดวันนี้ ${perKg} บาท (กรมการค้าภายใน, วันที่ ${asOf})`,
      };
    }
  }
  const fallback = Number(crop.market_price_per_kg);
  return {
    price_per_kg: fallback,
    is_estimate: true,
    as_of: null,
    source: 'crop_fallback',
    unit: 'บาท/กก.',
    product_code: crop.dit_product_code,
    source_url: null,
    label_th: `ราคาประมาณ ${fallback} บาท/กก.`,
  };
}

export async function syncCropReferencePrice(input: {
  cropId: number;
  productCode: string;
  fetchJson?: FetchJson;
  today?: Date;
}): Promise<{ saved: boolean; reason?: string }> {
  const today = input.today ?? new Date();
  const toDate = isoDateOnly(today);
  const fromDate = daysAgoIso(PRICING_CONFIG.referenceMaxAgeDays + 3, today);
  const { response, sourceUrl } = await fetchMocPrices({
    productId: input.productCode,
    fromDate,
    toDate,
    fetchJson: input.fetchJson,
  });
  const latest = latestDayMidpoint(response);
  if (latest === null) {
    return { saved: false, reason: 'no_price_list' };
  }
  const unit = latest.unit ?? response.unit;
  await pool.query(
    `UPDATE crops SET dit_unit = COALESCE(?, dit_unit) WHERE id = ?`,
    [unit, input.cropId],
  );
  await pool.query(
    `INSERT INTO crop_reference_prices
       (crop_id, date, wholesale_price, retail_price, source, product_code, unit, source_url, fetched_at)
     VALUES (?, ?, ?, NULL, 'moc_dit', ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       wholesale_price = VALUES(wholesale_price),
       unit = VALUES(unit),
       source_url = VALUES(source_url),
       fetched_at = UTC_TIMESTAMP()`,
    [input.cropId, latest.date, latest.midpoint, input.productCode, unit, sourceUrl],
  );
  if (!isKgUnit(unit)) {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT dit_unit_to_kg FROM crops WHERE id = ?`, [
      input.cropId,
    ]);
    if (rows[0]?.dit_unit_to_kg === null || rows[0]?.dit_unit_to_kg === undefined) {
      return { saved: true, reason: 'needs_unit_conversion' };
    }
  }
  return { saved: true };
}

export async function syncAllMappedCropPrices(fetchJson?: FetchJson): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, dit_product_code FROM crops WHERE dit_product_code IS NOT NULL AND dit_product_code <> ''`,
  );
  let n = 0;
  for (const row of rows) {
    const result = await syncCropReferencePrice({
      cropId: Number(row.id),
      productCode: String(row.dit_product_code),
      fetchJson,
    });
    if (result.saved) {
      n += 1;
    }
  }
  return n;
}

export function defaultLotPrices(marketPricePerKg: number, grade: ProduceGrade): {
  start: number;
  floor: number;
} {
  const start = suggestedStartPrice(marketPricePerKg, grade);
  return { start, floor: suggestedFloorPrice(start) };
}
