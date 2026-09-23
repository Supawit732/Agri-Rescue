import fs from 'fs';
import path from 'path';
import { toDitCandidate, type DitProductCandidate } from '../domain/ditSuggest';
import { fetchMocProducts, type FetchJson, type MocProduct } from './mocClient';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_DIR = path.resolve(__dirname, '../../.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'moc-products.json');

interface CachePayload {
  fetched_at: string;
  products: MocProduct[];
}

let memory: { fetchedAtMs: number; products: DitProductCandidate[] } | null = null;

function toCandidates(products: MocProduct[]): DitProductCandidate[] {
  return products.map((p) =>
    toDitCandidate({
      product_id: p.product_id,
      product_name: p.product_name,
      sell_type: p.sell_type,
      category_name: p.category_name,
    }),
  );
}

function readDiskCache(): CachePayload | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CachePayload;
    if (!Array.isArray(raw.products) || typeof raw.fetched_at !== 'string') {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function writeDiskCache(products: MocProduct[]): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const payload: CachePayload = { fetched_at: new Date().toISOString(), products };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload), 'utf8');
  } catch {
    // cache is best-effort
  }
}

function fromMemory(): { products: DitProductCandidate[]; fetched_at: string; from_cache: boolean } | null {
  if (memory === null) {
    return null;
  }
  return {
    products: memory.products,
    fetched_at: new Date(memory.fetchedAtMs).toISOString(),
    from_cache: true,
  };
}

function fromDisk(allowStale: boolean, nowMs: number): {
  products: DitProductCandidate[];
  fetched_at: string;
  from_cache: boolean;
} | null {
  const disk = readDiskCache();
  if (disk === null) {
    return null;
  }
  const fetchedAtMs = Date.parse(disk.fetched_at);
  if (!Number.isFinite(fetchedAtMs)) {
    return null;
  }
  if (!allowStale && nowMs - fetchedAtMs >= CACHE_TTL_MS) {
    return null;
  }
  const products = toCandidates(disk.products);
  memory = { fetchedAtMs, products };
  return { products, fetched_at: disk.fetched_at, from_cache: true };
}

/** Sync hydrate from disk so requests can use catalog immediately after process start. */
export function hydrateMocProductCacheFromDisk(): boolean {
  const loaded = fromDisk(true, Date.now());
  return loaded !== null;
}

export async function getCachedMocProducts(input?: {
  forceRefresh?: boolean;
  fetchJson?: FetchJson;
  nowMs?: number;
}): Promise<{ products: DitProductCandidate[]; fetched_at: string; from_cache: boolean }> {
  const nowMs = input?.nowMs ?? Date.now();
  if (!input?.forceRefresh && memory !== null && nowMs - memory.fetchedAtMs < CACHE_TTL_MS) {
    return fromMemory()!;
  }
  if (!input?.forceRefresh) {
    const freshDisk = fromDisk(false, nowMs);
    if (freshDisk !== null) {
      return freshDisk;
    }
  }
  try {
    const raw = await fetchMocProducts(input?.fetchJson);
    const products = toCandidates(raw);
    memory = { fetchedAtMs: nowMs, products };
    writeDiskCache(raw);
    return { products, fetched_at: new Date(nowMs).toISOString(), from_cache: false };
  } catch (error) {
    const staleMemory = fromMemory();
    if (staleMemory !== null) {
      return staleMemory;
    }
    const staleDisk = fromDisk(true, nowMs);
    if (staleDisk !== null) {
      return staleDisk;
    }
    throw error;
  }
}

/** Test helper */
export function clearMocProductCacheForTests(): void {
  memory = null;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  } catch {
    // ignore
  }
}
