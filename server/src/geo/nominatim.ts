export const NOMINATIM_MIN_INTERVAL_MS = 1000;
export const NOMINATIM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const NOMINATIM_USER_AGENT = 'Agri-Rescue/1.0 (educational; https://github.com/Supawit732/Agri-Rescue)';
export const NOMINATIM_TIMEOUT_MS = 5000;

interface CacheEntry {
  displayName: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
let lastRequestAt = 0;
let chain: Promise<void> = Promise.resolve();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** Test helper — clears in-memory Nominatim cache and rate-limit clock. */
export function resetNominatimState(): void {
  cache.clear();
  lastRequestAt = 0;
  chain = Promise.resolve();
}

async function waitForSlot(): Promise<void> {
  const wait = Math.max(0, lastRequestAt + NOMINATIM_MIN_INTERVAL_MS - Date.now());
  if (wait > 0) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, wait);
    });
  }
  lastRequestAt = Date.now();
}

/**
 * Reverse-geocode via Nominatim with 24h cache and ≤1 request/second.
 * Returns null displayName when the upstream call fails.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<{ displayName: string | null }> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit !== undefined && hit.expiresAt > Date.now()) {
    return { displayName: hit.displayName };
  }

  const run = chain.then(async () => {
    const again = cache.get(key);
    if (again !== undefined && again.expiresAt > Date.now()) {
      return { displayName: again.displayName };
    }
    await waitForSlot();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'json');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('zoom', '18');
      url.searchParams.set('addressdetails', '0');

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': NOMINATIM_USER_AGENT,
        },
      });
      if (!response.ok) {
        throw new Error(`Nominatim status ${response.status}`);
      }
      const body = (await response.json()) as { display_name?: unknown };
      const displayName = typeof body.display_name === 'string' ? body.display_name : null;
      cache.set(key, { displayName, expiresAt: Date.now() + NOMINATIM_CACHE_TTL_MS });
      return { displayName };
    } catch (error) {
      console.warn('Nominatim reverse geocode failed', error);
      cache.set(key, { displayName: null, expiresAt: Date.now() + NOMINATIM_CACHE_TTL_MS });
      return { displayName: null };
    } finally {
      clearTimeout(timer);
    }
  });

  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
