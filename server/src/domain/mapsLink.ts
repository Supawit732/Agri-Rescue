export interface LatLng {
  lat: number;
  lng: number;
}

/** Rough Thailand bounding box used for UX warnings. */
export const THAILAND_BOUNDS = {
  latMin: 5,
  latMax: 21,
  lngMin: 97,
  lngMax: 106,
} as const;

const GOOGLE_MAPS_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.maps.google.com',
  'google.com',
  'www.google.com',
  'google.co.th',
  'www.google.co.th',
  'maps.google.co.th',
  'www.maps.google.co.th',
]);

export function isInThailandApprox(lat: number, lng: number): boolean {
  return (
    lat >= THAILAND_BOUNDS.latMin &&
    lat <= THAILAND_BOUNDS.latMax &&
    lng >= THAILAND_BOUNDS.lngMin &&
    lng <= THAILAND_BOUNDS.lngMax
  );
}

export function isAllowedGoogleMapsHost(hostname: string): boolean {
  return GOOGLE_MAPS_HOSTS.has(hostname.toLowerCase());
}

export function isShortGoogleMapsUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    if (host === 'maps.app.goo.gl') {
      return true;
    }
    if (host === 'goo.gl' && url.pathname.startsWith('/maps')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function validPair(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

/**
 * Extract lat/lng from a full Google Maps URL or pasted fragment.
 * Supports @lat,lng, ?q=lat,lng, !3d..!4d.., ll=, and /search/lat,lng.
 */
export function parseCoordsFromMapsUrl(raw: string): LatLng | null {
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }

  const atMatch = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const pair = validPair(Number(atMatch[1]), Number(atMatch[2]));
    if (pair !== null) {
      return pair;
    }
  }

  const bangMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bangMatch) {
    const pair = validPair(Number(bangMatch[1]), Number(bangMatch[2]));
    if (pair !== null) {
      return pair;
    }
  }

  const qMatch = text.match(/[?&]q=(-?\d+(?:\.\d+)?)[,+\s]+(-?\d+(?:\.\d+)?)/i);
  if (qMatch) {
    const pair = validPair(Number(qMatch[1]), Number(qMatch[2]));
    if (pair !== null) {
      return pair;
    }
  }

  const llMatch = text.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (llMatch) {
    const pair = validPair(Number(llMatch[1]), Number(llMatch[2]));
    if (pair !== null) {
      return pair;
    }
  }

  const searchMatch = text.match(/\/maps\/search\/(-?\d+(?:\.\d+)?)[,+\s]+(-?\d+(?:\.\d+)?)/i);
  if (searchMatch) {
    const pair = validPair(Number(searchMatch[1]), Number(searchMatch[2]));
    if (pair !== null) {
      return pair;
    }
  }

  return null;
}
