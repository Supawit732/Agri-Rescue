import { normalizeMocProductName } from '../domain/ditSuggest';
import { PRICING_CONFIG, buildMocPriceUrl, ditMidpoint } from '../domain/sellerPricing';

export interface MocProduct {
  product_id: string;
  product_name: string;
  category_name: string | null;
  sell_type: string | null;
}

export interface MocPriceDay {
  date: string;
  price_min: number;
  price_max: number;
}

export interface MocPriceResponse {
  product_id: string;
  product_name: string;
  category_name: string | null;
  group_name: string | null;
  unit: string | null;
  price_list: MocPriceDay[];
}

export type FetchJson = (url: string) => Promise<unknown>;

async function fetchOnce(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Agri-Rescue/6.1c' },
    });
    if (!response.ok) {
      throw new Error(`MOC HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Default MOC fetch: 15s timeout, 1 retry (2 attempts), logs elapsed ms. */
export async function defaultFetchJson(url: string): Promise<unknown> {
  const timeoutMs = PRICING_CONFIG.mocFetchTimeoutMs;
  const maxAttempts = 1 + PRICING_CONFIG.mocFetchRetries;
  const started = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await fetchOnce(url, timeoutMs);
      console.log(`MOC fetch ok attempt=${attempt} ms=${Date.now() - started} url=${url}`);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(
        `MOC fetch fail attempt=${attempt}/${maxAttempts} ms=${Date.now() - started} url=${url}`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchMocProducts(fetchJson: FetchJson = defaultFetchJson): Promise<MocProduct[]> {
  const raw = await fetchJson(PRICING_CONFIG.mocProductsUrl);
  if (!Array.isArray(raw)) {
    throw new Error('MOC gis-products ไม่ใช่ array');
  }
  return raw
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        product_id: String(item.product_id ?? '').trim(),
        product_name: normalizeMocProductName(String(item.product_name ?? '')),
        category_name: item.category_name === null || item.category_name === undefined ? null : String(item.category_name),
        sell_type: item.sell_type === null || item.sell_type === undefined ? null : String(item.sell_type),
      };
    })
    .filter((row) => row.product_id !== '');
}

export async function fetchMocPrices(input: {
  productId: string;
  fromDate: string;
  toDate: string;
  fetchJson?: FetchJson;
}): Promise<{ response: MocPriceResponse; sourceUrl: string }> {
  const sourceUrl = buildMocPriceUrl(input.productId, input.fromDate, input.toDate);
  const fetchJson = input.fetchJson ?? defaultFetchJson;
  const raw = (await fetchJson(sourceUrl)) as Record<string, unknown>;
  const list = Array.isArray(raw.price_list) ? raw.price_list : [];
  return {
    sourceUrl,
    response: {
      product_id: String(raw.product_id ?? input.productId),
      product_name: String(raw.product_name ?? ''),
      category_name: raw.category_name == null ? null : String(raw.category_name),
      group_name: raw.group_name == null ? null : String(raw.group_name),
      unit: raw.unit == null ? null : String(raw.unit),
      price_list: list.map((day) => {
        const row = day as Record<string, unknown>;
        return {
          date: String(row.date ?? '').slice(0, 10),
          price_min: Number(row.price_min),
          price_max: Number(row.price_max),
        };
      }),
    },
  };
}

/** Latest day midpoint from a MOC price response. */
export function latestDayMidpoint(response: MocPriceResponse): {
  date: string;
  midpoint: number;
  unit: string | null;
} | null {
  const sorted = [...response.price_list]
    .filter((d) => d.date && Number.isFinite(d.price_min) && Number.isFinite(d.price_max))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  if (last === undefined) {
    return null;
  }
  return {
    date: last.date.slice(0, 10),
    midpoint: ditMidpoint(last.price_min, last.price_max),
    unit: response.unit,
  };
}

export function isoDateOnly(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgoIso(days: number, from = new Date()): string {
  const d = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
  return isoDateOnly(d);
}
