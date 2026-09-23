import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pickAutoDitMatch } from '../domain/ditAutoMatch';
import { pool } from '../db/pool';
import { getCachedMocProducts, hydrateMocProductCacheFromDisk } from '../pricing/mocProductCache';
import { syncAllMappedCropPrices, type SyncProgress } from '../pricing/referencePrices';

export type DitPipelineResult = {
  matched: number;
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

/**
 * Auto-map unmapped crops to ranked #1 if unit=กก. and name match (non-store).
 * Never overwrites dit_match_source='manual' or existing product codes.
 */
export async function autoMatchUnmappedCrops(): Promise<number> {
  const cached = await getCachedMocProducts();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name_th, dit_product_code, dit_match_source
     FROM crops
     WHERE (dit_product_code IS NULL OR dit_product_code = '')
       AND (dit_match_source IS NULL OR dit_match_source <> 'manual')`,
  );
  let matched = 0;
  for (const row of rows) {
    const pick = pickAutoDitMatch(String(row.name_th), cached.products);
    if (pick === null) {
      continue;
    }
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE crops
       SET dit_product_code = ?, dit_unit = ?, dit_match_source = 'auto'
       WHERE id = ?
         AND (dit_product_code IS NULL OR dit_product_code = '')
         AND (dit_match_source IS NULL OR dit_match_source <> 'manual')`,
      [pick.product_id, pick.unit, Number(row.id)],
    );
    if (result.affectedRows > 0) {
      matched += 1;
    }
  }
  return matched;
}

export async function runDitPipeline(input?: {
  forceRefreshCatalog?: boolean;
  onPriceProgress?: (progress: SyncProgress) => void;
}): Promise<DitPipelineResult> {
  const started = Date.now();
  await getCachedMocProducts(
    input?.forceRefreshCatalog === true ? { forceRefresh: true } : undefined,
  );
  const matched = await autoMatchUnmappedCrops();
  const prices = await syncAllMappedCropPrices(undefined, input?.onPriceProgress);
  const elapsed_ms = Date.now() - started;
  console.log(
    `DIT pipeline done elapsed_ms=${elapsed_ms} matched=${matched} prices_saved=${prices.saved}`,
  );
  return { matched, prices, elapsed_ms };
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
export function startDitSyncJob(): DitSyncJobState {
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
  return runDitPipeline({ forceRefreshCatalog: true });
}

/** Call from server.ts: hydrate disk sync, then warm MOC + pipeline in background. */
export function startDitBackgroundWarm(): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  const hydrated = hydrateMocProductCacheFromDisk();
  console.log(`DIT catalog disk hydrate=${hydrated ? 'hit' : 'miss'}`);
  if (startupPipelineStarted) {
    return;
  }
  startupPipelineStarted = true;
  void (async () => {
    try {
      await getCachedMocProducts({ forceRefresh: !hydrated });
      if (process.env.MOC_SYNC_SKIP === '1') {
        return;
      }
      await runDitPipeline({ forceRefreshCatalog: false });
      lastDitJobBangkokDay = bangkokDateKey();
    } catch (error) {
      console.error('DIT background warm failed', error);
    }
  })();
}

/** Test helpers */
export function resetDitJobStateForTests(): void {
  lastDitJobBangkokDay = null;
  startupPipelineStarted = false;
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
