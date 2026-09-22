import type { RowDataPacket } from 'mysql2';

export interface StopRow extends RowDataPacket {
  id: number;
  seq: number;
  stop_type: 'pickup' | 'drop';
  lot_id: number | null;
  buyer_id: number | null;
  lat: number;
  lng: number;
  leg_km: number;
  status: 'pending' | 'done';
  confirmed_weight_kg: number | null;
  weight_flag: number;
}

export interface BatchRow extends RowDataPacket {
  id: number;
  driver_id: number | null;
  status: 'planned' | 'in_progress' | 'completed';
  planned_km: number;
  created_at: Date;
}

export interface StopJson {
  id: number;
  seq: number;
  stop_type: 'pickup' | 'drop';
  lot_id: number | null;
  buyer_id: number | null;
  lat: number;
  lng: number;
  leg_km: number;
  status: 'pending' | 'done';
  confirmed_weight_kg: number | null;
  weight_flag: boolean;
}

export function toStopJson(row: StopRow): StopJson {
  return {
    id: Number(row.id),
    seq: Number(row.seq),
    stop_type: row.stop_type,
    lot_id: row.lot_id === null ? null : Number(row.lot_id),
    buyer_id: row.buyer_id === null ? null : Number(row.buyer_id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    leg_km: Number(row.leg_km),
    status: row.status,
    confirmed_weight_kg: row.confirmed_weight_kg === null ? null : Number(row.confirmed_weight_kg),
    weight_flag: Number(row.weight_flag) === 1,
  };
}

export function toBatchJson(row: BatchRow): {
  id: number;
  driver_id: number | null;
  status: BatchRow['status'];
  planned_km: number;
  created_at: string;
} {
  return {
    id: Number(row.id),
    driver_id: row.driver_id === null ? null : Number(row.driver_id),
    status: row.status,
    planned_km: Number(row.planned_km),
    created_at: new Date(row.created_at).toISOString(),
  };
}
