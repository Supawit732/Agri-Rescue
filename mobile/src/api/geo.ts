import { apiRequest } from './client';

export async function resolveMapsLink(url: string): Promise<{ lat: number; lng: number }> {
  return apiRequest<{ lat: number; lng: number }>({
    method: 'POST',
    path: '/api/geo/resolve-link',
    body: { url },
  });
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ lat: number; lng: number; display_name: string | null }> {
  return apiRequest<{ lat: number; lng: number; display_name: string | null }>({
    method: 'GET',
    path: `/api/geo/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
  });
}
