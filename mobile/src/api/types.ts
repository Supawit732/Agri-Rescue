export type UserRole = 'farmer' | 'buyer' | 'driver' | 'coordinator';
export type BuyerType = 'vendor' | 'shop' | 'charity';
export type Grade = 'normal' | 'substandard';
export type AppMode = 'sell' | 'buy';
export type DonorTier = 'volunteer' | 'trusted_volunteer' | 'verified_org';
export type DonationAudience = 'verified_org_only' | 'all_donors';
export type OrgStatus = 'none' | 'draft' | 'pending' | 'approved' | 'rejected' | 'needs_more_info';
export type ApplicationKind = 'individual' | 'organization';
export type OrgType =
  | 'foundation'
  | 'association'
  | 'shelter'
  | 'community_kitchen'
  | 'community_enterprise'
  | 'other';
export type DocCategory = 'registration_cert' | 'community_cert' | 'site_photo' | 'other';
export type RecipientGroup = 'elderly' | 'children' | 'community' | 'temple' | 'other';
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
  org_status: OrgStatus;
  org_reject_reason: string | null;
  org_name: string | null;
  application_kind: ApplicationKind | null;
  draft_step: number | null;
  contact_email: string | null;
  purpose_th: string | null;
  recipient_groups: string[];
  requested_fields: string[];
  donor_terms_version: string | null;
  donor_terms_accepted_at: string | null;
  org_type: string | null;
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
  doc_category?: DocCategory | string;
  created_at: string;
}

export interface OrgReviewLog {
  id: number;
  admin_id: number;
  action: string;
  reason: string | null;
  checklist?: Record<string, unknown> | null;
  requested_fields?: string[];
  created_at: string;
  application_kind?: ApplicationKind | null;
}

export interface MyDonorApplication {
  user: User;
  documents: OrgApplicationDoc[];
  documents_by_category: Record<string, OrgApplicationDoc[]>;
  review_logs: OrgReviewLog[];
  admin_messages: OrgReviewLog[];
  sections: {
    kind: string | null;
    individual: Record<string, unknown> | null;
    organization: Record<string, unknown> | null;
    contact: Record<string, unknown>;
    beneficiaries: Record<string, unknown>;
  } | null;
}

export interface OrgChecklist {
  name_matches_docs: boolean;
  location_matches_photos: boolean;
  docs_not_expired: boolean;
}

export interface OrgApplication {
  user_id: number;
  name: string;
  phone: string;
  application_kind?: ApplicationKind | null;
  org_name: string | null;
  org_type: string | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_phone: string | null;
  contact_email?: string | null;
  org_lat: number | null;
  org_lng: number | null;
  beneficiary_count: number | null;
  distribution_mode: string | null;
  org_status?: string;
  org_reject_reason?: string | null;
  requested_fields?: string[];
  donor_terms_version?: string | null;
  created_at: string;
  sections?: {
    kind: string | null;
    individual: Record<string, unknown> | null;
    organization: Record<string, unknown> | null;
    contact: Record<string, unknown>;
    beneficiaries: Record<string, unknown>;
  };
  documents: OrgApplicationDoc[];
  documents_by_category?: Record<string, OrgApplicationDoc[]>;
  checklist?: OrgChecklist | Record<string, unknown> | null;
  review_logs?: OrgReviewLog[];
}

export interface DonorTermsMeta {
  version: string;
  title: string;
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

export interface MyLotBooking {
  order_id: number;
  quantity_kg: number;
  is_donation: boolean;
  status: string;
  agreed_price_per_kg: number;
  buyer_name?: string;
  created_at?: string;
}

export interface MyLot {
  id: number;
  plot_id: number;
  crop_id: number;
  weight_kg: number;
  remaining_kg?: number;
  split_allowed?: boolean;
  min_order_kg?: number;
  order_step_kg?: number;
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
  bookings?: MyLotBooking[];
}

export interface MarketLot {
  id: number;
  crop_name_th: string;
  crop_name_en?: string | null;
  /** Present on authenticated market; omitted on public API. */
  farmer_name?: string;
  weight_kg: number;
  remaining_kg?: number;
  split_allowed?: boolean;
  min_order_kg?: number;
  order_step_kg?: number;
  grade: Grade;
  ripeness: number;
  /** Present on owner responses; masked for buyers — prefer available_as. */
  sale_mode?: SaleMode;
  available_as?: Array<'buy' | 'donate'>;
  donation_opened?: boolean;
  allow_donation?: boolean;
  donation_audience?: DonationAudience;
  expires_at: string;
  hours_left: number;
  distance_km: number | null;
  price_per_kg: number | null;
  market_price_label?: string | null;
  start_price_per_kg?: number | null;
  floor_price_per_kg?: number | null;
  /** Present on authenticated market; omitted on public API. */
  lat?: number;
  lng?: number;
  plot_name?: string;
  area_th?: string;
  subdistrict_th?: string | null;
  district_th?: string | null;
  area_rai?: number;
  photo_url?: string | null;
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
  dit_product_name: string | null;
  dit_unit: string | null;
  dit_unit_to_kg: number | null;
  dit_match_source: 'auto' | 'manual' | null;
  dit_price_status: string | null;
  latest_ref_price: DitCropRefPrice | null;
}

export interface DitAutomationStatus {
  last_auto_at: string | null;
  last_auto_hm: string | null;
  success_saved: number;
  success_total: number;
  success_label: string;
  next_retry_hm: string | null;
  message: string | null;
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
  automation: DitAutomationStatus;
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
  quantity_kg?: number;
  agreed_price_per_kg: number;
  total?: number;
  is_donation: boolean;
  status: string;
  batch_id: number | null;
  drop_otp: string;
  created_at: string;
  crop_name_th?: string;
  grade?: Grade;
  ripeness?: number;
  photo_url?: string | null;
  plot_name?: string;
  plot_lat?: number | null;
  plot_lng?: number | null;
  lat?: number | null;
  lng?: number | null;
  expires_at?: string;
  distance_km?: number | null;
  viewer?: 'buyer' | 'seller';
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

export interface DashboardPayload {
  scope: 'admin' | 'seller';
  cards: {
    kg_saved: number;
    co2e_kg: number;
    farmer_income: number;
    donated_kg: number;
    order_count: number;
  };
  charts: {
    daily_kg: { date: string; kg: number }[];
    by_crop: { crop_name_th: string; kg: number }[];
    orders_by_status: { status: string; count: number }[];
    ai_accuracy: { total: number; matched: number; accuracy: number | null };
  };
}
