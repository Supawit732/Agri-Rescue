export const NOMINATIM_MIN_INTERVAL_MS = 1000;
export const NOMINATIM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const NOMINATIM_USER_AGENT = 'Agri-Rescue/1.0 (educational; https://github.com/Supawit732/Agri-Rescue)';
export const NOMINATIM_TIMEOUT_MS = 5000;

interface CacheEntry {
  displayName: string | null;
  displayNameEn: string | null;
  subdistrictTh: string | null;
  districtTh: string | null;
  subdistrictEn: string | null;
  districtEn: string | null;
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

function pickAddressString(
  address: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!address) return null;
  for (const key of keys) {
    const v = address[key];
    if (typeof v === 'string' && v.trim() !== '') {
      return v.trim();
    }
  }
  return null;
}

export interface ReverseGeocodeResult {
  displayName: string | null;
  displayNameEn: string | null;
  subdistrictTh: string | null;
  districtTh: string | null;
  subdistrictEn: string | null;
  districtEn: string | null;
}

async function fetchOnce(
  lat: number,
  lng: number,
  acceptLanguage: string,
): Promise<{
  displayName: string | null;
  subdistrict: string | null;
  district: string | null;
}> {
  await waitForSlot();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'json');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', acceptLanguage);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': acceptLanguage,
        'User-Agent': NOMINATIM_USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new Error(`Nominatim status ${response.status}`);
    }
    const body = (await response.json()) as {
      display_name?: unknown;
      address?: Record<string, unknown>;
    };
    const displayName = typeof body.display_name === 'string' ? body.display_name : null;
    const subdistrict = pickAddressString(body.address, [
      'suburb',
      'village',
      'town',
      'neighbourhood',
      'quarter',
    ]);
    const district = pickAddressString(body.address, [
      'city_district',
      'city',
      'county',
      'state_district',
      'province',
    ]);
    return { displayName, subdistrict, district };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reverse-geocode via Nominatim with 24h cache and ≤1 request/second.
 * Fetches Thai/default labels then English (accept-language=en) for EN mode.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit !== undefined && hit.expiresAt > Date.now()) {
    return {
      displayName: hit.displayName,
      displayNameEn: hit.displayNameEn,
      subdistrictTh: hit.subdistrictTh,
      districtTh: hit.districtTh,
      subdistrictEn: hit.subdistrictEn,
      districtEn: hit.districtEn,
    };
  }

  const run = chain.then(async () => {
    const again = cache.get(key);
    if (again !== undefined && again.expiresAt > Date.now()) {
      return {
        displayName: again.displayName,
        displayNameEn: again.displayNameEn,
        subdistrictTh: again.subdistrictTh,
        districtTh: again.districtTh,
        subdistrictEn: again.subdistrictEn,
        districtEn: again.districtEn,
      } satisfies ReverseGeocodeResult;
    }
    try {
      const th = await fetchOnce(lat, lng, 'th');
      let en = { displayName: null as string | null, subdistrict: null as string | null, district: null as string | null };
      try {
        en = await fetchOnce(lat, lng, 'en');
      } catch (error) {
        console.warn('Nominatim EN reverse geocode failed', error);
      }
      const result: ReverseGeocodeResult = {
        displayName: th.displayName ?? en.displayName,
        displayNameEn: en.displayName ?? th.displayName,
        subdistrictTh: th.subdistrict,
        districtTh: th.district,
        subdistrictEn: en.subdistrict,
        districtEn: en.district,
      };
      cache.set(key, {
        displayName: result.displayName,
        displayNameEn: result.displayNameEn,
        subdistrictTh: result.subdistrictTh,
        districtTh: result.districtTh,
        subdistrictEn: result.subdistrictEn,
        districtEn: result.districtEn,
        expiresAt: Date.now() + NOMINATIM_CACHE_TTL_MS,
      });
      return result;
    } catch (error) {
      console.warn('Nominatim reverse geocode failed', error);
      const failed: ReverseGeocodeResult = {
        displayName: null,
        displayNameEn: null,
        subdistrictTh: null,
        districtTh: null,
        subdistrictEn: null,
        districtEn: null,
      };
      cache.set(key, {
        ...failed,
        expiresAt: Date.now() + NOMINATIM_CACHE_TTL_MS,
      });
      return failed;
    }
  });

  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
