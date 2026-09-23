export type UserRole = 'farmer' | 'buyer' | 'driver' | 'coordinator';
export type BuyerType = 'vendor' | 'shop' | 'charity';
export type Grade = 'normal' | 'substandard';

export interface User {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  buyer_type: BuyerType | null;
  lat: number | null;
  lng: number | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Crop {
  id: number;
  name_th: string;
  base_shelf_days: number;
  market_price_per_kg: number;
}

export interface Plot {
  id: number;
  farmer_id: number;
  name: string;
  lat: number;
  lng: number;
  area_rai: number;
}

export interface EstimateResponse {
  shelf_hours: number;
  price_per_kg: number;
  temp_c: number;
  humidity: number;
  weather_source: 'live' | 'fallback';
}

export type AssessPhotoResponse =
  | {
      available: true;
      ripeness: number;
      confidence: number;
      defects: string[];
      note_th: string;
      low_confidence: boolean;
      model: string;
    }
  | {
      available: false;
      reason: string;
    };

export interface MyLot {
  id: number;
  plot_id: number;
  crop_id: number;
  weight_kg: number;
  grade: Grade;
  ripeness: number;
  photo_url: string | null;
  allow_donation: number | boolean;
  predicted_shelf_hours: number;
  expires_at: string;
  status: string;
  created_at: string;
}

export interface MarketLot {
  id: number;
  crop_name_th: string;
  farmer_name: string;
  weight_kg: number;
  grade: Grade;
  ripeness: number;
  allow_donation: boolean;
  expires_at: string;
  hours_left: number;
  distance_km: number;
  price_per_kg: number;
  lat: number;
  lng: number;
}

export interface Order {
  id: number;
  lot_id: number;
  agreed_price_per_kg: number;
  is_donation: boolean;
  status: string;
  batch_id: number | null;
  drop_otp: string;
  created_at: string;
}

export interface Driver {
  id: number;
  name: string;
  phone: string;
}

export interface Batch {
  id: number;
  driver_id: number | null;
  status: 'planned' | 'in_progress' | 'completed';
  planned_km: number;
  created_at: string;
}

export interface Stop {
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
  otp_attempts: number;
  locked: boolean;
}

export interface BatchDetail {
  batch: Batch;
  stops: Stop[];
}

export interface ImpactSummary {
  kg_saved: number;
  co2e_kg: number;
  farmer_income: number;
  donated_kg: number;
  lot_count: number;
}
