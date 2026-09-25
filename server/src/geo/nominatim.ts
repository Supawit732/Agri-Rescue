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

function addressString(
  address: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const v = address?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** ตำบล / แขวง / Subdistrict (not municipality or district). */
function isSubdistrictLike(value: string): boolean {
  return /ตำบล|แขวง|\bSubdistrict\b/i.test(value);
}

/** อำเภอ / เขต / District (word “District”, not “Subdistrict”). */
function isDistrictLike(value: string): boolean {
  return /อำเภอ|เขต|\bDistrict\b/i.test(value);
}

function isMunicipality(value: string): boolean {
  return /เทศบาล|\bMunicipality\b/i.test(value);
}

function isProvinceLike(value: string): boolean {
  return /จังหวัด|\bProvince\b|^Bangkok$|^กรุงเทพ/i.test(value);
}

/**
 * Pick ตำบล/แขวง from Nominatim address keys.
 * Bangkok: khwaeng is `quarter` (khet wrongly sits in `suburb`).
 * Elsewhere: ตำบล is usually `city_district` (not `town` municipality).
 */
export function pickSubdistrict(address: Record<string, unknown> | undefined): string | null {
  if (!address) return null;
  const quarter = addressString(address, 'quarter');
  if (quarter !== null && !isMunicipality(quarter) && !isDistrictLike(quarter)) {
    return quarter;
  }
  const cityDistrict = addressString(address, 'city_district');
  if (cityDistrict !== null && isSubdistrictLike(cityDistrict)) {
    return cityDistrict;
  }
  for (const key of ['neighbourhood', 'village'] as const) {
    const v = addressString(address, key);
    if (v !== null && !isMunicipality(v) && !isDistrictLike(v)) {
      return v;
    }
  }
  const suburb = addressString(address, 'suburb');
  if (suburb !== null && isSubdistrictLike(suburb)) {
    return suburb;
  }
  if (cityDistrict !== null && !isMunicipality(cityDistrict)) {
    return cityDistrict;
  }
  const town = addressString(address, 'town');
  if (town !== null && !isMunicipality(town) && !isDistrictLike(town)) {
    return town;
  }
  if (suburb !== null && !isDistrictLike(suburb) && !isMunicipality(suburb)) {
    return suburb;
  }
  return null;
}

/** Pick อำเภอ/เขต. Bangkok: khet is `suburb`; provinces: `county`. */
export function pickDistrict(
  address: Record<string, unknown> | undefined,
  subdistrict: string | null,
): string | null {
  if (!address) return null;
  const suburb = addressString(address, 'suburb');
  if (suburb !== null && isDistrictLike(suburb)) {
    return suburb;
  }
  const county = addressString(address, 'county');
  if (county !== null) {
    return county;
  }
  const cityDistrict = addressString(address, 'city_district');
  if (
    cityDistrict !== null &&
    isDistrictLike(cityDistrict) &&
    cityDistrict !== subdistrict
  ) {
    return cityDistrict;
  }
  const stateDistrict = addressString(address, 'state_district');
  if (stateDistrict !== null && stateDistrict !== subdistrict) {
    return stateDistrict;
  }
  // Same value used as subdistrict (test fixtures / identical names) still OK as district.
  if (cityDistrict !== null && !isMunicipality(cityDistrict) && !isSubdistrictLike(cityDistrict)) {
    return cityDistrict;
  }
  if (cityDistrict !== null && cityDistrict === subdistrict) {
    return cityDistrict;
  }
  const city = addressString(address, 'city');
  if (city !== null && isDistrictLike(city) && city !== subdistrict) {
    return city;
  }
  if (city !== null && !isProvinceLike(city) && city !== subdistrict && !isMunicipality(city)) {
    return city;
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
    const subdistrict = pickSubdistrict(body.address);
    const district = pickDistrict(body.address, subdistrict);
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
