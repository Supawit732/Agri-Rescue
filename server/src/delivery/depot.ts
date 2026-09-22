import { DEPOT } from '../db/seedData';
import { HttpError } from '../http/errors';

export function depotPoint(): { lat: number; lng: number } {
  const lat = readCoord('DEPOT_LAT', DEPOT.lat);
  const lng = readCoord('DEPOT_LNG', DEPOT.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpError(500, 'INTERNAL', 'ระบบยังไม่ได้ตั้งค่าจุดรวบรวม');
  }
  return { lat, lng };
}

function readCoord(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  return Number(raw);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
