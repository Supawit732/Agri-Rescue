import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { diagnoseDitMatch, pickAutoDitMatch } from '../domain/ditAutoMatch';
import { pool } from '../db/pool';
import { getCachedMocProducts, hydrateMocProductCacheFromDiskAsync } from '../pricing/mocProductCache';
import {
  syncAllMappedCropPrices,
  syncMissingTodayPrices,
  type SyncProgress,
} from '../pricing/referencePrices';

export type DitPipelineResult = {
  matched: number;
  cleared: number;
  prices: Awaited<ReturnType<typeof syncAllMappedCropPrices>>;
  elapsed_ms: number;
};

/** Bangkok calendar date YYYY-MM-DD */
export function bangkokDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Hour 0–23 in Asia/Bangkok */
export function bangkokHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  return Number(hour ?? '0');
}

export function bangkokTimeHm(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

export type DitAutomationStatus = {
  last_auto_at: string | null;
  last_auto_hm: string | null;
  success_saved: number;
  success_total: number;
  success_label: string;
  next_retry_hm: string | null;
  message: string | null;
};

let automationStatus: DitAutomationStatus = {
  last_auto_at: null,
  last_auto_hm: null,
  success_saved: 0,
  success_total: 0,
  success_label: '—',
  next_retry_hm: null,
  message: null,
};

export function getDitAutomationStatus(): DitAutomationStatus {
  return { ...automationStatus };
}

function recordAutomationSuccess(prices: { saved: number; total: number }, now = new Date()): void {
  const hour = bangkokHour(now);
  const incomplete = prices.saved < prices.total;
  const nextHour =
    incomplete && hour < 23 ? String(hour + 1).padStart(2, '0') + ':00' : null;
  automationStatus = {
    last_auto_at: now.toISOString(),
    last_auto_hm: bangkokTimeHm(now),
    success_saved: prices.saved,
    success_total: prices.total,
    success_label: `${prices.saved}/${prices.total}`,
    next_retry_hm: nextHour,
    message: incomplete ? null : 'ราคาวันนี้ครบแล้ว',
  };
}

/** Clear previous auto matches so rematch uses the latest catalog rules. */
export async function clearAutoDitMatches(): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE crops
     SET dit_product_code = NULL,
         dit_product_name = NULL,
         dit_unit = NULL,
         dit_match_source = NULL,
         dit_price_status = NULL
     WHERE dit_match_source = 'auto'`,
  );
  console.log(`DIT cleared auto matches count=${result.affectedRows}`);
  return result.affectedRows;
}

async function waitForCatalog(minCount = 1, attempts = 8): Promise<number> {
  for (let i = 0; i < attempts; i += 1) {
    const cached = await getCachedMocProducts({ allowNetwork: i === 0 });
    if (cached.products.length >= minCount) {
      console.log(`DIT catalog ready count=${cached.products.length} attempt=${i + 1}`);
      return cached.products.length;
    }
    await getCachedMocProducts({ forceRefresh: true, allowNetwork: true }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 500));
  }
  const last = await getCachedMocProducts({ allowNetwork: false }).catch(() => null);
  const count = last?.products.length ?? 0;
  console.warn(`DIT catalog not ready count=${count}`);
  return count;
}

/**
 * Auto-map unmapped crops. Never overwrites manual.
 */
export async function autoMatchUnmappedCrops(): Promise<number> {
  let cached = await getCachedMocProducts({ allowNetwork: false }).catch(() => null);
  if (cached === null || cached.products.length === 0) {
    cached = await getCachedMocProducts({ forceRefresh: true, allowNetwork: true }).catch(() => null);
  }
  if (cached === null || cached.products.length === 0) {
    console.warn('DIT auto-match skipped — catalog empty');
    return 0;
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name_th, dit_product_code, dit_match_source
     FROM crops
     WHERE (dit_product_code IS NULL OR dit_product_code = '')
       AND (dit_match_source IS NULL OR dit_match_source <> 'manual')`,
  );
  let matched = 0;
  for (const row of rows) {
    const cropName = String(row.name_th);
    const diagnosis = diagnoseDitMatch(cropName, cached.products);
    const pick = pickAutoDitMatch(cropName, cached.products);
    if (pick === null) {
      console.log(
        `DIT auto-match none crop=${cropName} candidates=${diagnosis.length}`,
      );
      continue;
    }
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE crops
       SET dit_product_code = ?, dit_product_name = ?, dit_unit = ?, dit_match_source = 'auto', dit_price_status = NULL
       WHERE id = ?
         AND (dit_product_code IS NULL OR dit_product_code = '')
         AND (dit_match_source IS NULL OR dit_match_source <> 'manual')`,
      [pick.product_id, pick.product_name, pick.unit === 'unknown' ? null : pick.unit, Number(row.id)],
    );
    if (result.affectedRows > 0) {
      matched += 1;
      console.log(
        `DIT auto-match ok crop=${cropName} code=${pick.product_id} name=${pick.product_name} unit=${pick.unit}`,
      );
    }
  }
  return matched;
}

export async function runDitPipeline(input?: {
  forceRefreshCatalog?: boolean;
  clearAuto?: boolean;
  onPriceProgress?: (progress: SyncProgress) => void;
}): Promise<DitPipelineResult> {
  const started = Date.now();
  try {
    await getCachedMocProducts(
      input?.forceRefreshCatalog === true
        ? { forceRefresh: true, allowNetwork: true }
        : { allowNetwork: true },
    );
  } catch (error) {
    console.warn(
      'DIT catalog refresh failed — will use disk/memory if available',
      error instanceof Error ? error.message : error,
    );
  }
  await waitForCatalog(1);
  let cleared = 0;
  if (input?.clearAuto !== false) {
    cleared = await clearAutoDitMatches();
  }
  const matched = await autoMatchUnmappedCrops();
  const prices = await syncAllMappedCropPrices(undefined, input?.onPriceProgress);
  const elapsed_ms = Date.now() - started;
  recordAutomationSuccess(prices);
  console.log(
    `DIT pipeline done elapsed_ms=${elapsed_ms} cleared=${cleared} matched=${matched} prices_saved=${prices.saved}/${prices.total}`,
  );
  return { matched, cleared, prices, elapsed_ms };
}

export type DitSyncJobState = {
  status: 'idle' | 'running' | 'done' | 'error';
  started_at: string | null;
  finished_at: string | null;
  matched: number;
  done: number;
  total: number;
  saved: number;
  outliers: number;
  failed: number;
  message: string | null;
  elapsed_ms: number | null;
};

let syncJob: DitSyncJobState = {
  status: 'idle',
  started_at: null,
  finished_at: null,
  matched: 0,
  done: 0,
  total: 0,
  saved: 0,
  outliers: 0,
  failed: 0,
  message: null,
  elapsed_ms: null,
};

export function getDitSyncJobState(): DitSyncJobState {
  return { ...syncJob };
}

/** Start background match+price sync; returns current state immediately. */
export function startDitSyncJob(opts?: { clearAuto?: boolean }): DitSyncJobState {
  if (syncJob.status === 'running') {
    return getDitSyncJobState();
  }
  if (process.env.MOC_SYNC_SKIP === '1' || process.env.NODE_ENV === 'test') {
    syncJob = {
      ...syncJob,
      status: 'done',
      message: process.env.MOC_SYNC_SKIP === '1' ? 'skipped' : 'test-skip',
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      elapsed_ms: 0,
      matched: 0,
      done: 0,
      total: 0,
      saved: 0,
      outliers: 0,
      failed: 0,
    };
    return getDitSyncJobState();
  }
  syncJob = {
    status: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    matched: 0,
    done: 0,
    total: 0,
    saved: 0,
    outliers: 0,
    failed: 0,
    message: null,
    elapsed_ms: null,
  };
  void runDitPipeline({
    forceRefreshCatalog: false,
    clearAuto: opts?.clearAuto === true,
    onPriceProgress: (p) => {
      syncJob = {
        ...syncJob,
        done: p.done,
        total: p.total,
        saved: p.saved,
        outliers: p.outliers,
        failed: p.failed,
      };
    },
  })
    .then((result) => {
      syncJob = {
        ...syncJob,
        status: 'done',
        matched: result.matched,
        done: result.prices.total,
        total: result.prices.total,
        saved: result.prices.saved,
        outliers: result.prices.outliers,
        failed: result.prices.failed,
        finished_at: new Date().toISOString(),
        elapsed_ms: result.elapsed_ms,
        message: null,
      };
    })
    .catch((error: unknown) => {
      syncJob = {
        ...syncJob,
        status: 'error',
        finished_at: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
        elapsed_ms: Date.now() - Date.parse(syncJob.started_at ?? new Date().toISOString()),
      };
    });
  return getDitSyncJobState();
}

let lastDitJobBangkokDay: string | null = null;
let lastHourlyRetryKey: string | null = null;
let startupPipelineStarted = false;

export async function maybeRunDitDailyJob(now = new Date()): Promise<DitPipelineResult | null> {
  if (process.env.NODE_ENV === 'test' || process.env.MOC_SYNC_SKIP === '1') {
    return null;
  }
  if (bangkokHour(now) < 5) {
    return null;
  }
  const day = bangkokDateKey(now);
  if (lastDitJobBangkokDay === day) {
    return null;
  }
  if (syncJob.status === 'running') {
    return null;
  }
  lastDitJobBangkokDay = day;
  return runDitPipeline({ forceRefreshCatalog: true, clearAuto: true });
}

/** Hourly retry for mapped crops still missing today's price. Stops when all have today. */
export async function maybeRunHourlyPriceRetry(now = new Date()): Promise<{
  skipped: boolean;
  total: number;
  saved: number;
} | null> {
  if (process.env.NODE_ENV === 'test' || process.env.MOC_SYNC_SKIP === '1') {
    return null;
  }
  if (syncJob.status === 'running') {
    return null;
  }
  const day = bangkokDateKey(now);
  const hour = bangkokHour(now);
  const key = `${day}T${String(hour).padStart(2, '0')}`;
  if (lastHourlyRetryKey === key) {
    return null;
  }
  lastHourlyRetryKey = key;
  const result = await syncMissingTodayPrices();
  const nextHour = hour >= 23 ? null : `${String(hour + 1).padStart(2, '0')}:00`;
  automationStatus = {
    ...automationStatus,
    last_auto_at: now.toISOString(),
    last_auto_hm: bangkokTimeHm(now),
    success_saved: result.skipped ? automationStatus.success_total : result.saved,
    success_total: result.skipped
      ? automationStatus.success_total
      : Math.max(automationStatus.success_total, result.total),
    success_label: result.skipped
      ? automationStatus.success_label
      : `${result.saved}/${result.total}`,
    next_retry_hm: result.skipped ? null : nextHour,
    message: result.skipped ? 'ราคาวันนี้ครบแล้ว' : null,
  };
  console.log(
    `DIT hourly retry skipped=${result.skipped} saved=${result.saved} total=${result.total} next=${nextHour ?? 'none'}`,
  );
  return { skipped: result.skipped, total: result.total, saved: result.saved };
}

/** Call from server.ts: hydrate disk async, then warm MOC + pipeline in background. */
export function startDitBackgroundWarm(): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  if (startupPipelineStarted) {
    return;
  }
  startupPipelineStarted = true;
  lastDitJobBangkokDay = bangkokDateKey();
  void (async () => {
    try {
      console.log('DIT background warm starting');
      const hydrated = await hydrateMocProductCacheFromDiskAsync();
      await getCachedMocProducts({ forceRefresh: !hydrated, allowNetwork: true });
      await waitForCatalog(1);
      if (process.env.MOC_SYNC_SKIP === '1') {
        console.log('DIT background warm skipped (MOC_SYNC_SKIP)');
        return;
      }
      const result = await runDitPipeline({ forceRefreshCatalog: false, clearAuto: true });
      lastDitJobBangkokDay = bangkokDateKey();
      console.log(
        `DIT background warm finished matched=${result.matched} prices=${result.prices.saved}/${result.prices.total}`,
      );
    } catch (error) {
      console.error('DIT background warm failed', error);
      automationStatus = {
        ...automationStatus,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  })();
}

/** Test helpers */
export function resetDitJobStateForTests(): void {
  lastDitJobBangkokDay = null;
  lastHourlyRetryKey = null;
  startupPipelineStarted = false;
  automationStatus = {
    last_auto_at: null,
    last_auto_hm: null,
    success_saved: 0,
    success_total: 0,
    success_label: '—',
    next_retry_hm: null,
    message: null,
  };
  syncJob = {
    status: 'idle',
    started_at: null,
    finished_at: null,
    matched: 0,
    done: 0,
    total: 0,
    saved: 0,
    outliers: 0,
    failed: 0,
    message: null,
    elapsed_ms: null,
  };
}
