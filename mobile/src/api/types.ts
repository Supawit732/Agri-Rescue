export type UserRole = 'farmer' | 'buyer' | 'driver' | 'coordinator';
export type BuyerType = 'vendor' | 'shop' | 'charity';
export type Grade = 'normal' | 'substandard';
export type AppMode = 'sell' | 'buy';
export type DonorTier = 'volunteer' | 'trusted_volunteer' | 'verified_org';
export type DonationAudience = 'verified_org_only' | 'all_donors';
export type SaleMode = 'sell' | 'donate' | 'sell_then_donate';

export interface User {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  can_sell: boolean;
  can_buy: boolean;
  is_admin: boolean;
  buyer_type: BuyerType | null;
  charity_approved: boolean;
  donor_tier: DonorTier | null;
  beneficiary_count: number | null;
  distribution_mode: 'self_use' | 'redistribute' | null;
  donation_suspended: boolean;
  trusted_proof_count: number;
  org_status: 'none' | 'pending' | 'approved' | 'rejected' | 'needs_more_info';
  org_reject_reason: string | null;
  org_name: string | null;
  donation_weekly_cap_kg: number | null;
  donation_remaining_kg: number | null;
  line_id: string | null;
  lat: number | null;
  lng: number | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface OrgApplicationDoc {
  id: number;
  original_name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
}

export interface OrgApplication {
  user_id: number;
  name: string;
  phone: string;
  org_name: string;
  org_type: string;
  contact_name: string;
  contact_title: string;
  contact_phone: string;
  org_lat: number;
  org_lng: number;
  beneficiary_count: number;
  distribution_mode: string;
  org_status?: string;
  org_reject_reason?: string | null;
  created_at: string;
  documents: OrgApplicationDoc[];
  review_logs?: { id: number; admin_id: number; action: string; reason: string | null; created_at: string }[];
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

export interface MarketQuote {
  label_th: string;
  price_per_kg: number;
  is_estimate: boolean;
  as_of: string | null;
  source: string;
}

export interface PriceForecastRow {
  hours: number;
  price_per_kg: number;
}

export interface EstimateResponse {
  shelf_hours: number;
  price_per_kg: number;
  suggested_start_price_per_kg: number;
  suggested_floor_price_per_kg: number;
  market_quote: MarketQuote;
  forecast: PriceForecastRow[];
  nearby_median_price_per_kg: number | null;
  temp_c: number;
  humidity: number;
  weather_source: 'live' | 'fallback';
  weather_basis: 'forecast_72h_daytime_avg';
}

export type AssessPhotoResponse =
  | {
      available: true;
      subject_match: true;
      ripeness: number;
      confidence: number;
      defects: string[];
      note_th: string;
      low_confidence: boolean;
      model: string;
    }
  | {
      available: true;
      subject_match: false;
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
  sale_mode: SaleMode;
  allow_donation: number | boolean;
  donation_audience?: DonationAudience;
  donation_opened: boolean;
  start_price_per_kg: number | null;
  floor_price_per_kg: number | null;
  market_price_label?: string | null;
  predicted_shelf_hours: number;
  expires_at: string;
  status: string;
  created_at: string;
  crop_name_th: string;
  plot_name: string;
  price_per_kg: number | null;
}

export interface MarketLot {
  id: number;
  crop_name_th: string;
  farmer_name: string;
  weight_kg: number;
  grade: Grade;
  ripeness: number;
  sale_mode: SaleMode;
  donation_opened: boolean;
  allow_donation: boolean;
  donation_audience?: DonationAudience;
  expires_at: string;
  hours_left: number;
  distance_km: number;
  price_per_kg: number | null;
  market_price_label?: string | null;
  start_price_per_kg?: number | null;
  floor_price_per_kg?: number | null;
  lat: number;
  lng: number;
}

export interface DitCropRefPrice {
  date: string;
  wholesale_price: number;
  unit: string | null;
  fetched_at: string | null;
  rejected_as_outlier: boolean;
  outlier_baseline: number | null;
  outlier_ratio: number | null;
  product_code: string | null;
}

export interface DitCrop {
  id: number;
  name_th: string;
  market_price_per_kg: number;
  dit_product_code: string | null;
  dit_unit: string | null;
  dit_unit_to_kg: number | null;
  dit_match_source: 'auto' | 'manual' | null;
  latest_ref_price: DitCropRefPrice | null;
}

export interface DitProductSearchHit {
  product_id: string;
  product_name: string;
  unit: string;
  sell_type: string | null;
  category_name: string | null;
}

export interface DitSyncJob {
  status: 'idle' | 'running' | 'done' | 'error';
  started_at: string | null;
  finished_at: string | null;
  matched: number;
  done: number;
  total: number;
  saved: number;
  outliers: number;
  failed: number;
  message: string | null;
  elapsed_ms: number | null;
}

export interface DitCropsResponse {
  crops: DitCrop[];
  products_fetched_at: string | null;
  products_from_cache: boolean;
  sync_job: DitSyncJob;
}

export interface DitSuggestion {
  id: number;
  crop_id: number;
  product_code: string;
  product_name: string;
  sell_type: string;
  status: 'pending' | 'accepted' | 'rejected';
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
