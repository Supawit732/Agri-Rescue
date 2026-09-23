import fs from 'fs';
import os from 'os';
import path from 'path';
import { toDitCandidate, type DitProductCandidate } from '../domain/ditSuggest';
import { fetchMocProducts, type FetchJson, type MocProduct } from './mocClient';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '../../.cache');
const CACHE_FILENAME = 'moc-products.json';
const PARSE_CHUNK = 250;

/** Production path — never deleted by test helpers. */
const PRODUCTION_CACHE_FILE = path.join(DEFAULT_CACHE_DIR, CACHE_FILENAME);

interface CachePayload {
  fetched_at: string;
  products: MocProduct[];
}

export type MocCatalogSnapshot = {
  products: DitProductCandidate[];
  fetched_at: string;
  from_cache: boolean;
};

let memory: { fetchedAtMs: number; products: DitProductCandidate[] } | null = null;
let hydratePromise: Promise<boolean> | null = null;

/** When set (tests only), disk read/write uses this directory instead of server/.cache. */
let testCacheDir: string | null = null;

function activeCacheDir(): string {
  return testCacheDir ?? DEFAULT_CACHE_DIR;
}

function activeCacheFile(): string {
  return path.join(activeCacheDir(), CACHE_FILENAME);
}

function sanitizeProducts(products: MocProduct[]): MocProduct[] {
  return products.filter((p) => typeof p.product_id === 'string' && p.product_id.trim() !== '');
}

function toCandidatesSync(products: MocProduct[]): DitProductCandidate[] {
  return products.map((p) =>
    toDitCandidate({
      product_id: p.product_id,
      product_name: p.product_name,
      sell_type: p.sell_type,
      category_name: p.category_name,
    }),
  );
}

/** Yield between chunks so large catalogs do not block the event loop. */
async function toCandidatesAsync(products: MocProduct[]): Promise<DitProductCandidate[]> {
  if (products.length <= PARSE_CHUNK) {
    return toCandidatesSync(products);
  }
  const out: DitProductCandidate[] = [];
  for (let i = 0; i < products.length; i += PARSE_CHUNK) {
    const slice = products.slice(i, i + PARSE_CHUNK);
    for (const p of slice) {
      out.push(
        toDitCandidate({
          product_id: p.product_id,
          product_name: p.product_name,
          sell_type: p.sell_type,
          category_name: p.category_name,
        }),
      );
    }
    if (i + PARSE_CHUNK < products.length) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  return out;
}

function readDiskCache(): CachePayload | null {
  try {
    const file = activeCacheFile();
    if (!fs.existsSync(file)) {
      return null;
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as CachePayload;
    if (!Array.isArray(raw.products) || typeof raw.fetched_at !== 'string') {
      return null;
    }
    return { fetched_at: raw.fetched_at, products: sanitizeProducts(raw.products) };
  } catch {
    return null;
  }
}

function writeDiskCache(products: MocProduct[]): void {
  try {
    const dir = activeCacheDir();
    fs.mkdirSync(dir, { recursive: true });
    const payload: CachePayload = {
      fetched_at: new Date().toISOString(),
      products: sanitizeProducts(products),
    };
    fs.writeFileSync(activeCacheFile(), JSON.stringify(payload), 'utf8');
  } catch {
    // cache is best-effort
  }
}

function fromMemory(): MocCatalogSnapshot | null {
  if (memory === null) {
    return null;
  }
  return {
    products: memory.products,
    fetched_at: new Date(memory.fetchedAtMs).toISOString(),
    from_cache: true,
  };
}

/** Memory only — never hits MOC or disk. Safe for hot request handlers. */
export function peekMocProductCache(): MocCatalogSnapshot | null {
  return fromMemory();
}

export function getMocCatalogMeta(): { fetched_at: string | null; product_count: number; in_memory: boolean } {
  if (memory === null) {
    return { fetched_at: null, product_count: 0, in_memory: false };
  }
  return {
    fetched_at: new Date(memory.fetchedAtMs).toISOString(),
    product_count: memory.products.length,
    in_memory: true,
  };
}

/** Load disk into memory without blocking the event loop (chunked parse). */
export async function hydrateMocProductCacheFromDiskAsync(): Promise<boolean> {
  if (memory !== null) {
    return true;
  }
  if (hydratePromise !== null) {
    return hydratePromise;
  }
  hydratePromise = (async () => {
    const started = Date.now();
    const disk = readDiskCache();
    if (disk === null) {
      console.log('DIT catalog disk hydrate=miss');
      return false;
    }
    const fetchedAtMs = Date.parse(disk.fetched_at);
    if (!Number.isFinite(fetchedAtMs)) {
      return false;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    const products = await toCandidatesAsync(disk.products);
    memory = { fetchedAtMs, products };
    console.log(
      `DIT catalog disk hydrate=hit count=${products.length} parse_ms=${Date.now() - started}`,
    );
    return true;
  })().finally(() => {
    hydratePromise = null;
  });
  return hydratePromise;
}

/** Sync hydrate for tests / legacy callers. */
export function hydrateMocProductCacheFromDisk(): boolean {
  if (memory !== null) {
    return true;
  }
  const disk = readDiskCache();
  if (disk === null) {
    return false;
  }
  const fetchedAtMs = Date.parse(disk.fetched_at);
  if (!Number.isFinite(fetchedAtMs)) {
    return false;
  }
  memory = { fetchedAtMs, products: toCandidatesSync(disk.products) };
  return true;
}

export async function getCachedMocProducts(input?: {
  forceRefresh?: boolean;
  /** Default true. Set false on HTTP request paths — never wait on MOC. */
  allowNetwork?: boolean;
  fetchJson?: FetchJson;
  nowMs?: number;
}): Promise<MocCatalogSnapshot> {
  const nowMs = input?.nowMs ?? Date.now();
  const allowNetwork = input?.allowNetwork !== false;

  const serveMemoryIfOk = (): MocCatalogSnapshot | null => {
    const snap = fromMemory();
    if (snap === null || memory === null) {
      return null;
    }
    if (!allowNetwork || nowMs - memory.fetchedAtMs < CACHE_TTL_MS) {
      return snap;
    }
    return allowNetwork ? null : snap;
  };

  if (!input?.forceRefresh) {
    const hot = serveMemoryIfOk();
    if (hot !== null) {
      return hot;
    }
    if (memory === null) {
      await hydrateMocProductCacheFromDiskAsync();
      const afterDisk = serveMemoryIfOk();
      if (afterDisk !== null) {
        return afterDisk;
      }
    }
  }

  if (!allowNetwork) {
    const mem = fromMemory();
    if (mem !== null) {
      return mem;
    }
    throw new Error('MOC catalog not in cache');
  }

  try {
    const raw = await fetchMocProducts(input?.fetchJson);
    const clean = sanitizeProducts(raw);
    const products = await toCandidatesAsync(clean);
    memory = { fetchedAtMs: nowMs, products };
    writeDiskCache(clean);
    return { products, fetched_at: new Date(nowMs).toISOString(), from_cache: false };
  } catch (error) {
    const stale = fromMemory();
    if (stale !== null) {
      return stale;
    }
    await hydrateMocProductCacheFromDiskAsync();
    const diskStale = fromMemory();
    if (diskStale !== null) {
      return diskStale;
    }
    throw error;
  }
}

/**
 * Point disk cache at a fresh temp directory for the current test suite.
 * Never touches server/.cache.
 */
export function useTempMocProductCacheForTests(): string {
  memory = null;
  hydratePromise = null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-moc-cache-'));
  testCacheDir = dir;
  return dir;
}

/** Clear memory + test cache file only. Never deletes production server/.cache. */
export function clearMocProductCacheForTests(): void {
  memory = null;
  hydratePromise = null;
  if (testCacheDir === null) {
    return;
  }
  try {
    const file = activeCacheFile();
    if (file !== PRODUCTION_CACHE_FILE && fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch {
    // ignore
  }
}

/** Restore production cache path (call from afterAll if needed). */
export function resetMocProductCacheDirForTests(): void {
  memory = null;
  hydratePromise = null;
  testCacheDir = null;
}

/** Test introspection */
export function getMocProductCacheFilePathForTests(): string {
  return activeCacheFile();
}
