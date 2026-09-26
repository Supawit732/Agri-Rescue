import type { RowDataPacket } from 'mysql2';
import { pool } from '../db/pool';
import { parseUnitFromProductName, resolveDitUnit } from '../domain/ditSuggest';
import {
  PRICING_CONFIG,
  isKgUnit,
  toBahtPerKg,
  type ProduceGrade,
  suggestedFloorPrice,
  suggestedStartPrice,
} from '../domain/sellerPricing';
import { isPriceOutlier, priceOutlierRatio } from '../domain/priceSanity';
import { fallbackReferencePrice } from '../domain/seasonalPrice';
import { mapPool } from '../lib/mapPool';
import {
  daysAgoIso,
  fetchMocPrices,
  isoDateOnly,
  latestDayMidpoint,
  mocErrorReasonTh,
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
  const todayKey = isoDateOnly(today);
  const [refs] = await pool.query<RowDataPacket[]>(
    `SELECT date, wholesale_price, unit, product_code, source_url
     FROM crop_reference_prices
     WHERE crop_id = ? AND date >= ? AND wholesale_price IS NOT NULL
       AND rejected_as_outlier = 0
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
      const dayLabel = asOf === todayKey ? 'วันนี้' : `วันที่ ${asOf}`;
      return {
        price_per_kg: perKg,
        is_estimate: false,
        as_of: asOf,
        source: 'moc_dit',
        unit: ref.unit === null ? null : String(ref.unit),
        product_code: String(ref.product_code),
        source_url: String(ref.source_url),
        label_th: `ราคาตลาด${dayLabel === 'วันนี้' ? 'วันนี้' : ''} ${perKg} บาท (กรมการค้าภายใน, ${dayLabel})`,
      };
    }
  }
  const fallback = Number(crop.market_price_per_kg);
  const [factorRows] = await pool.query<RowDataPacket[]>(
    `SELECT month, factor FROM crop_season_factors WHERE crop_id = ?`,
    [cropId],
  );
  // Asia/Bangkok month: UTC+7 so offset 7 hours
  const bangkokMonth = new Date(today.getTime() + 7 * 60 * 60 * 1000).getUTCMonth() + 1;
  const factors = factorRows.map((r) => ({ month: Number(r.month), factor: Number(r.factor) }));
  const { price, seasonal } = fallbackReferencePrice(fallback, factors, bangkokMonth);
  const adjNote = seasonal ? ' (ปรับตามฤดูกาล)' : '';
  return {
    price_per_kg: price,
    is_estimate: true,
    as_of: null,
    source: 'crop_fallback',
    unit: 'บาท/กก.',
    product_code: crop.dit_product_code,
    source_url: null,
    label_th: `ราคาประมาณ ${price} บาท/กก.${adjNote}`,
  };
}

async function baselinePricePerUnit(cropId: number, marketPricePerKg: number): Promise<number> {
  const [refs] = await pool.query<RowDataPacket[]>(
    `SELECT wholesale_price
     FROM crop_reference_prices
     WHERE crop_id = ? AND wholesale_price IS NOT NULL AND rejected_as_outlier = 0
     ORDER BY date DESC, id DESC
     LIMIT 1`,
    [cropId],
  );
  if (refs[0] !== undefined) {
    return Number(refs[0].wholesale_price);
  }
  return marketPricePerKg;
}

async function setCropPriceStatus(cropId: number, status: string | null): Promise<void> {
  await pool.query(`UPDATE crops SET dit_price_status = ? WHERE id = ?`, [status, cropId]);
}

export type SyncCropPriceResult = {
  saved: boolean;
  rejected_as_outlier?: boolean;
  reason?: string;
  usable_per_kg?: boolean;
};

export async function syncCropReferencePrice(input: {
  cropId: number;
  productCode: string;
  productName?: string | null;
  nameUnit?: string | null;
  fetchJson?: FetchJson;
  today?: Date;
}): Promise<SyncCropPriceResult> {
  const today = input.today ?? new Date();
  const toDate = isoDateOnly(today);
  const fromDate = daysAgoIso(PRICING_CONFIG.referenceMaxAgeDays, today);
  try {
    const { response, sourceUrl } = await fetchMocPrices({
      productId: input.productCode,
      fromDate,
      toDate,
      fetchJson: input.fetchJson,
    });
    const latest = latestDayMidpoint(response);
    if (latest === null) {
      await setCropPriceStatus(input.cropId, 'ไม่มีรายการราคาในช่วงที่ดึง');
      return { saved: false, reason: 'no_price_list' };
    }
    const nameUnit =
      input.nameUnit ??
      (input.productName !== undefined && input.productName !== null
        ? parseUnitFromProductName(input.productName)
        : 'unknown');
    const unit = resolveDitUnit({ priceUnit: latest.unit ?? response.unit, nameUnit });
    const [cropRows] = await pool.query<RowDataPacket[]>(
      `SELECT market_price_per_kg, dit_unit_to_kg, dit_product_name FROM crops WHERE id = ?`,
      [input.cropId],
    );
    const crop = cropRows[0];
    if (crop === undefined) {
      return { saved: false, reason: 'crop_not_found' };
    }
    const baseline = await baselinePricePerUnit(input.cropId, Number(crop.market_price_per_kg));
    const outlier = isPriceOutlier(latest.midpoint, baseline);
    const ratio = priceOutlierRatio(latest.midpoint, baseline);

    const productName =
      input.productName ??
      (crop.dit_product_name === null ? response.product_name || null : String(crop.dit_product_name));

    await pool.query(
      `UPDATE crops SET dit_unit = ?, dit_product_name = COALESCE(?, dit_product_name) WHERE id = ?`,
      [unit === 'unknown' ? null : unit, productName, input.cropId],
    );
    await pool.query(
      `INSERT INTO crop_reference_prices
         (crop_id, date, wholesale_price, retail_price, source, product_code, unit, source_url, fetched_at,
          rejected_as_outlier, outlier_baseline, outlier_ratio)
       VALUES (?, ?, ?, NULL, 'moc_dit', ?, ?, ?, UTC_TIMESTAMP(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         wholesale_price = VALUES(wholesale_price),
         unit = VALUES(unit),
         source_url = VALUES(source_url),
         fetched_at = UTC_TIMESTAMP(),
         rejected_as_outlier = VALUES(rejected_as_outlier),
         outlier_baseline = VALUES(outlier_baseline),
         outlier_ratio = VALUES(outlier_ratio)`,
      [
        input.cropId,
        latest.date,
        latest.midpoint,
        input.productCode,
        unit === 'unknown' ? null : unit,
        sourceUrl,
        outlier ? 1 : 0,
        outlier ? baseline : null,
        outlier ? ratio : null,
      ],
    );
    if (outlier) {
      await setCropPriceStatus(input.cropId, 'ราคาเพี้ยน — ไม่ใช้');
      return { saved: true, rejected_as_outlier: true, reason: 'outlier', usable_per_kg: false };
    }
    if (!isKgUnit(unit)) {
      if (crop.dit_unit_to_kg === null || crop.dit_unit_to_kg === undefined) {
        await setCropPriceStatus(input.cropId, `หน่วยเป็น ${unit} ต้องใส่ตัวแปลง`);
        return { saved: true, reason: 'needs_unit_conversion', usable_per_kg: false };
      }
    }
    await setCropPriceStatus(input.cropId, null);
    return { saved: true, usable_per_kg: true };
  } catch (error) {
    await setCropPriceStatus(input.cropId, mocErrorReasonTh(error));
    throw error;
  }
}

export type SyncProgress = {
  done: number;
  total: number;
  saved: number;
  outliers: number;
  failed: number;
};

async function syncCropRows(
  rows: RowDataPacket[],
  fetchJson?: FetchJson,
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ saved: number; outliers: number; failed: number; total: number; elapsed_ms: number }> {
  const started = Date.now();
  const total = rows.length;
  let saved = 0;
  let outliers = 0;
  let failed = 0;
  let done = 0;

  await mapPool(rows, PRICING_CONFIG.mocPriceConcurrency, async (row) => {
    try {
      const result = await syncCropReferencePrice({
        cropId: Number(row.id),
        productCode: String(row.dit_product_code),
        productName: row.dit_product_name === null || row.dit_product_name === undefined ? null : String(row.dit_product_name),
        fetchJson,
      });
      if (result.rejected_as_outlier) {
        outliers += 1;
      } else if (result.saved) {
        saved += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    } finally {
      done += 1;
      onProgress?.({ done, total, saved, outliers, failed });
    }
  });

  const elapsed_ms = Date.now() - started;
  console.log(
    `DIT price sync finished elapsed_ms=${elapsed_ms} total=${total} saved=${saved} outliers=${outliers} failed=${failed}`,
  );
  return { saved, outliers, failed, total, elapsed_ms };
}

export async function syncAllMappedCropPrices(
  fetchJson?: FetchJson,
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ saved: number; outliers: number; failed: number; total: number; elapsed_ms: number }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, dit_product_code, dit_product_name FROM crops
     WHERE dit_product_code IS NOT NULL AND dit_product_code <> ''`,
  );
  return syncCropRows(rows, fetchJson, onProgress);
}

/** Crops mapped but missing a usable reference price dated today (Bangkok calendar via UTC date key of server). */
export async function listCropsMissingTodayPrice(today = new Date()): Promise<RowDataPacket[]> {
  const todayKey = isoDateOnly(today);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.dit_product_code, c.dit_product_name
     FROM crops c
     WHERE c.dit_product_code IS NOT NULL AND c.dit_product_code <> ''
       AND NOT EXISTS (
         SELECT 1 FROM crop_reference_prices r
         WHERE r.crop_id = c.id
           AND r.date = ?
           AND r.wholesale_price IS NOT NULL
           AND r.rejected_as_outlier = 0
       )`,
    [todayKey],
  );
  return rows;
}

export async function syncMissingTodayPrices(
  fetchJson?: FetchJson,
  onProgress?: (progress: SyncProgress) => void,
  today = new Date(),
): Promise<{ saved: number; outliers: number; failed: number; total: number; elapsed_ms: number; skipped: boolean }> {
  const rows = await listCropsMissingTodayPrice(today);
  if (rows.length === 0) {
    console.log('DIT hourly retry skipped — all mapped crops have today price');
    return { saved: 0, outliers: 0, failed: 0, total: 0, elapsed_ms: 0, skipped: true };
  }
  const result = await syncCropRows(rows, fetchJson, onProgress);
  return { ...result, skipped: false };
}

export function defaultLotPrices(marketPricePerKg: number, grade: ProduceGrade): {
  start: number;
  floor: number;
} {
  const start = suggestedStartPrice(marketPricePerKg, grade);
  return { start, floor: suggestedFloorPrice(start) };
}
