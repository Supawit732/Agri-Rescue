import { HttpError } from '../http/errors';
import { isAllowedGoogleMapsHost, parseCoordsFromMapsUrl, type LatLng } from '../domain/mapsLink';

export const RESOLVE_LINK_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 10;

function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, 'VALIDATION', 'ลิงก์ไม่ถูกต้อง');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'FORBIDDEN_HOST', 'อนุญาตเฉพาะลิงก์ Google Maps');
  }
  if (!isAllowedGoogleMapsHost(url.hostname)) {
    throw new HttpError(400, 'FORBIDDEN_HOST', 'อนุญาตเฉพาะลิงก์ Google Maps');
  }
  return url;
}

/**
 * Follow Google Maps short-link redirects (allowlisted hosts only) and parse coords.
 */
export async function resolveGoogleMapsLink(rawUrl: string): Promise<LatLng & { finalUrl: string }> {
  const start = assertAllowedUrl(rawUrl);
  const fromStart = parseCoordsFromMapsUrl(start.href);
  if (fromStart !== null) {
    return { ...fromStart, finalUrl: start.href };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_LINK_TIMEOUT_MS);
  let current = start.href;

  try {
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      let response: Response;
      try {
        response = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': 'Agri-Rescue/1.0 (educational)' },
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new HttpError(504, 'TIMEOUT', 'ตามลิงก์ไม่สำเร็จภายในเวลาที่กำหนด');
        }
        throw new HttpError(502, 'RESOLVE_FAILED', 'ตามลิงก์ Google Maps ไม่สำเร็จ');
      }

      const location = response.headers.get('location');
      if (location !== null && response.status >= 300 && response.status < 400) {
        const next = new URL(location, current);
        if (!isAllowedGoogleMapsHost(next.hostname)) {
          throw new HttpError(400, 'FORBIDDEN_HOST', 'อนุญาตเฉพาะลิงก์ Google Maps');
        }
        current = next.href;
        const fromRedirect = parseCoordsFromMapsUrl(current);
        if (fromRedirect !== null) {
          return { ...fromRedirect, finalUrl: current };
        }
        continue;
      }

      const fromFinal = parseCoordsFromMapsUrl(response.url || current);
      if (fromFinal !== null) {
        return { ...fromFinal, finalUrl: response.url || current };
      }

      // Some short links return HTML with a meta refresh / embedded maps URL.
      if (response.ok) {
        const html = await response.text();
        const fromHtml = parseCoordsFromMapsUrl(html);
        if (fromHtml !== null) {
          return { ...fromHtml, finalUrl: current };
        }
      }

      throw new HttpError(422, 'COORDS_NOT_FOUND', 'ไม่พบพิกัดในลิงก์นี้');
    }
    throw new HttpError(422, 'COORDS_NOT_FOUND', 'ไม่พบพิกัดในลิงก์นี้');
  } finally {
    clearTimeout(timer);
  }
}
