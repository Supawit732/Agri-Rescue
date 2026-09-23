import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, setUnauthorizedHandler } from '../api/client';
import { clearAppMode, clearToken, loadAppMode, loadToken, saveAppMode, saveToken } from '../api/storage';
import type {
  AppMode,
  AssessPhotoResponse,
  AuthResponse,
  Batch,
  BatchDetail,
  BuyerType,
  Crop,
  DitCropsResponse,
  DitProductSearchHit,
  DitSuggestion,
  DitSyncJob,
  DonationAudience,
  DonorTermsMeta,
  Driver,
  EstimateResponse,
  Grade,
  ImpactSummary,
  MarketLot,
  MyDonorApplication,
  MyLot,
  Order,
  OrgApplication,
  OrgChecklist,
  Plot,
  SaleMode,
  Stop,
  User,
  UserRole,
} from '../api/types';

interface RegisterInput {
  name: string;
  phone: string;
  password: string;
  can_sell: boolean;
  can_buy: boolean;
  buyer_type?: BuyerType | null;
  line_id?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface Api {
  getMe: () => Promise<User>;
  updateProfile: (input: {
    can_sell?: true;
    can_buy?: true;
    buyer_type?: BuyerType;
    line_id?: string | null;
  }) => Promise<AuthResponse>;
  getCrops: () => Promise<Crop[]>;
  getPlots: () => Promise<Plot[]>;
  createPlot: (input: { name: string; lat: number; lng: number; area_rai: number }) => Promise<Plot>;
  estimate: (input: {
    crop_id: number;
    ripeness: number;
    grade: Grade;
    lat: number;
    lng: number;
    start_price_per_kg?: number;
    floor_price_per_kg?: number;
  }) => Promise<EstimateResponse>;
  assessPhoto: (input: {
    crop_id: number;
    image_base64: string;
    mime: 'image/jpeg' | 'image/png';
  }) => Promise<AssessPhotoResponse>;
  createLot: (input: {
    plot_id: number;
    crop_id: number;
    weight_kg: number;
    grade: Grade;
    ripeness: number;
    sale_mode: SaleMode;
    donation_audience?: DonationAudience;
    start_price_per_kg?: number | null;
    floor_price_per_kg?: number | null;
    split_allowed?: boolean;
    min_order_kg?: number;
    order_step_kg?: number;
    ai_ripeness?: number | null;
    ai_confidence?: number | null;
    ai_model?: string | null;
  }) => Promise<unknown>;
  patchLot: (
    id: number,
    body: {
      weight_kg?: number;
      grade?: Grade;
      photo_url?: string | null;
      start_price_per_kg?: number | null;
      floor_price_per_kg?: number | null;
      sale_mode?: SaleMode;
      donation_audience?: DonationAudience;
      split_allowed?: boolean;
      min_order_kg?: number;
      order_step_kg?: number;
      ripeness?: number;
      ai_ripeness?: number | null;
      confirm_ripeness_photo?: boolean;
    },
  ) => Promise<unknown>;
  getMyLots: () => Promise<MyLot[]>;
  getMarket: (lat: number, lng: number, radiusKm: number) => Promise<MarketLot[]>;
  createOrder: (
    lotId: number,
    donation: boolean,
    quantityKg: number,
    extras?: { distribution_place?: string; distribution_at?: string },
  ) => Promise<{ order: Order }>;
  becomeVolunteer: () => Promise<AuthResponse>;
  getDonorTerms: () => Promise<DonorTermsMeta>;
  getMyDonorApplication: () => Promise<MyDonorApplication>;
  saveDonorDraft: (input: Record<string, unknown>) => Promise<AuthResponse>;
  applyOrg: (input: Record<string, unknown>) => Promise<AuthResponse>;
  withdrawDonorApplication: (reason?: string) => Promise<AuthResponse>;
  switchDonorApplicationKind: (application_kind: 'individual' | 'organization') => Promise<AuthResponse>;
  listOrgApplications: () => Promise<OrgApplication[]>;
  approveOrg: (userId: number) => Promise<User>;
  rejectOrg: (userId: number, reason: string) => Promise<User>;
  requestMoreOrgInfo: (userId: number, reason: string, requested_fields?: string[]) => Promise<User>;
  saveOrgChecklist: (userId: number, checklist: OrgChecklist) => Promise<{ ok: boolean; checklist: OrgChecklist }>;
  addOrgDocuments: (documents: { filename: string; mime: string; base64: string; doc_category?: string }[]) => Promise<AuthResponse>;
  resubmitOrg: () => Promise<AuthResponse>;
  unlockDonor: (userId: number) => Promise<User>;
  listDitCrops: () => Promise<DitCropsResponse>;
  mapDitCrop: (cropId: number, body: { product_code: string; unit_to_kg?: number | null }) => Promise<unknown>;
  setDitUnitFactor: (cropId: number, body: { unit_to_kg: number | null }) => Promise<unknown>;
  searchDitProducts: (q: string) => Promise<DitProductSearchHit[]>;
  refreshDitProducts: () => Promise<{ count: number; fetched_at: string }>;
  syncDitPrices: () => Promise<{ started: boolean; job: DitSyncJob }>;
  getDitSyncStatus: () => Promise<DitSyncJob>;
  suggestDit: (cropId: number) => Promise<DitSuggestion[]>;
  acceptDitSuggestion: (suggestionId: number) => Promise<unknown>;
  rejectDitSuggestion: (suggestionId: number) => Promise<unknown>;
  getDrivers: () => Promise<Driver[]>;
  getBatches: () => Promise<Batch[]>;
  createBatch: (driverId: number) => Promise<BatchDetail>;
  getBatch: (id: number) => Promise<BatchDetail>;
  confirmStop: (id: number, body: { weight_kg?: number; otp?: string }) => Promise<{
    stop: Stop;
    lot_status: string | null;
    order_status: string | null;
    batch_status: Batch['status'];
  }>;
  unlockStop: (id: number) => Promise<{ id: number; otp_attempts: number; locked: boolean }>;
  getImpact: () => Promise<ImpactSummary>;
  getMyOrders: () => Promise<Order[]>;
  cancelOrder: (id: number) => Promise<unknown>;
}

interface AuthContextValue {
  ready: boolean;
  user: User | null;
  role: UserRole | null;
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  login: (phone: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  api: Api;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function defaultMode(user: User, stored: AppMode | null): AppMode {
  if (stored === 'sell' && user.can_sell) {
    return 'sell';
  }
  if (stored === 'buy' && user.can_buy) {
    return 'buy';
  }
  if (user.can_sell) {
    return 'sell';
  }
  if (user.can_buy) {
    return 'buy';
  }
  return 'sell';
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [mode, setModeState] = useState<AppMode>('sell');

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setModeState('sell');
    void clearToken();
    void clearAppMode();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  const applyAuth = useCallback(async (auth: AuthResponse) => {
    setToken(auth.token);
    setUser(auth.user);
    const stored = await loadAppMode();
    const nextMode = defaultMode(auth.user, stored);
    setModeState(nextMode);
    await saveToken(auth.token);
    await saveAppMode(nextMode);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadToken();
      if (!active) {
        return;
      }
      if (stored === null) {
        setReady(true);
        return;
      }
      setToken(stored);
      try {
        const me = await apiRequest<{ user: User }>({ method: 'GET', path: '/api/auth/me', token: stored });
        if (!active) {
          return;
        }
        setUser(me.user);
        const savedMode = await loadAppMode();
        setModeState(defaultMode(me.user, savedMode));
      } catch {
        if (active) {
          setToken(null);
          setUser(null);
          await clearToken();
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (phone: string, password: string) => {
      const auth = await apiRequest<AuthResponse>({ method: 'POST', path: '/api/auth/login', body: { phone, password } });
      await applyAuth(auth);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const auth = await apiRequest<AuthResponse>({ method: 'POST', path: '/api/auth/register', body: input });
      await applyAuth(auth);
    },
    [applyAuth],
  );

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    void saveAppMode(next);
  }, []);

  const refreshUser = useCallback(async () => {
    if (token === null) {
      return;
    }
    const me = await apiRequest<{ user: User }>({ method: 'GET', path: '/api/auth/me', token });
    setUser(me.user);
  }, [token]);

  const updateProfile = useCallback(
    async (input: {
      can_sell?: true;
      can_buy?: true;
      buyer_type?: BuyerType;
      line_id?: string | null;
    }) => {
      const auth = await apiRequest<AuthResponse>({
        method: 'PATCH',
        path: '/api/auth/profile',
        token,
        body: input,
      });
      await applyAuth(auth);
      return auth;
    },
    [applyAuth, token],
  );

  const api = useMemo<Api>(() => {
    const authed = <T,>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> =>
      apiRequest<T>({ method, path, token, body });
    return {
      getMe: () => authed<{ user: User }>('GET', '/api/auth/me').then((r) => r.user),
      updateProfile,
      getCrops: () => authed<{ crops: Crop[] }>('GET', '/api/crops').then((r) => r.crops),
      getPlots: () => authed<{ plots: Plot[] }>('GET', '/api/plots/mine').then((r) => r.plots),
      createPlot: (input) => authed<{ plot: Plot }>('POST', '/api/plots', input).then((r) => r.plot),
      estimate: (input) => authed<EstimateResponse>('POST', '/api/lots/estimate', input),
      assessPhoto: (input) => authed<AssessPhotoResponse>('POST', '/api/lots/assess-photo', input),
      createLot: (input) => authed('POST', '/api/lots', input),
      patchLot: (id, body) => authed('PATCH', `/api/lots/${id}`, body),
      getMyLots: () => authed<{ lots: MyLot[] }>('GET', '/api/lots/mine').then((r) => r.lots),
      getMarket: (lat, lng, radiusKm) =>
        authed<{ lots: MarketLot[] }>('GET', `/api/market?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`).then((r) => r.lots),
      createOrder: (lotId, donation, quantityKg, extras) =>
        authed<{ order: Order }>('POST', '/api/orders', {
          lot_id: lotId,
          donation,
          quantity_kg: quantityKg,
          ...extras,
        }),
      becomeVolunteer: async () => {
        const res = await authed<{ user: User }>('POST', '/api/donors/volunteer', {});
        setUser(res.user);
        return { token: token ?? '', user: res.user };
      },
      getDonorTerms: () => apiRequest<DonorTermsMeta>({ method: 'GET', path: '/api/donors/terms' }),
      getMyDonorApplication: () => authed<MyDonorApplication>('GET', '/api/donors/org-applications/mine'),
      saveDonorDraft: async (input) => {
        const res = await authed<{ user: User }>('POST', '/api/donors/org-applications/draft', input);
        setUser(res.user);
        return { token: token ?? '', user: res.user };
      },
      applyOrg: async (input) => {
        const res = await authed<{ user: User }>('POST', '/api/donors/org-applications', input);
        setUser(res.user);
        return { token: token ?? '', user: res.user };
      },
      withdrawDonorApplication: async (reason) => {
        const res = await authed<{ user: User }>('POST', '/api/donors/org-applications/withdraw', {
          ...(reason !== undefined ? { reason } : {}),
        });
        setUser(res.user);
        return { token: token ?? '', user: res.user };
      },
      switchDonorApplicationKind: async (application_kind) => {
        const res = await authed<{ user: User }>('POST', '/api/donors/org-applications/switch-kind', {
          application_kind,
        });
        setUser(res.user);
        return { token: token ?? '', user: res.user };
      },
      listOrgApplications: () =>
        authed<{ applications: OrgApplication[] }>('GET', '/api/donors/admin/org-applications').then((r) => r.applications),
      approveOrg: (userId) =>
        authed<{ user: User }>('POST', `/api/donors/admin/org-applications/${userId}/approve`).then((r) => r.user),
      rejectOrg: (userId, reason) =>
        authed<{ user: User }>('POST', `/api/donors/admin/org-applications/${userId}/reject`, { reason }).then((r) => r.user),
      requestMoreOrgInfo: (userId, reason, requested_fields) =>
        authed<{ user: User }>('POST', `/api/donors/admin/org-applications/${userId}/needs-more-info`, {
          reason,
          ...(requested_fields !== undefined ? { requested_fields } : {}),
        }).then((r) => r.user),
      saveOrgChecklist: (userId, checklist) =>
        authed<{ ok: boolean; checklist: OrgChecklist }>('POST', `/api/donors/admin/org-applications/${userId}/checklist`, {
          checklist,
        }),
      addOrgDocuments: async (documents) => {
        const res = await authed<{ user: User }>('POST', '/api/donors/org-applications/documents', { documents });
        setUser(res.user);
        return { token: token ?? '', user: res.user };
      },
      resubmitOrg: async () => {
        const res = await authed<{ user: User }>('POST', '/api/donors/org-applications/resubmit', {});
        setUser(res.user);
        return { token: token ?? '', user: res.user };
      },
      unlockDonor: (userId) =>
        authed<{ user: User }>('POST', `/api/donors/admin/donors/${userId}/unlock`).then((r) => r.user),
      listDitCrops: () => authed<DitCropsResponse>('GET', '/api/admin/dit/crops'),
      mapDitCrop: (cropId, body) => authed('POST', `/api/admin/dit/crops/${cropId}/mapping`, body),
      setDitUnitFactor: (cropId, body) =>
        authed('POST', `/api/admin/dit/crops/${cropId}/unit-factor`, body),
      searchDitProducts: (q) =>
        authed<{ products: DitProductSearchHit[] }>('GET', `/api/admin/dit/products?q=${encodeURIComponent(q)}`).then(
          (r) => r.products,
        ),
      refreshDitProducts: () =>
        authed<{ count: number; fetched_at: string }>('POST', '/api/admin/dit/products/refresh', {}),
      syncDitPrices: () => authed<{ started: boolean; job: DitSyncJob }>('POST', '/api/admin/dit/sync', {}),
      getDitSyncStatus: () => authed<{ job: DitSyncJob }>('GET', '/api/admin/dit/sync/status').then((r) => r.job),
      suggestDit: (cropId) =>
        authed<{ suggestions: DitSuggestion[] }>('POST', `/api/admin/dit/crops/${cropId}/suggest`, {}).then(
          (r) => r.suggestions,
        ),
      acceptDitSuggestion: (suggestionId) =>
        authed('POST', `/api/admin/dit/suggestions/${suggestionId}/accept`, {}),
      rejectDitSuggestion: (suggestionId) =>
        authed('POST', `/api/admin/dit/suggestions/${suggestionId}/reject`, {}),
      getMyOrders: () => authed<{ orders: Order[] }>('GET', '/api/orders/mine').then((r) => r.orders),
      cancelOrder: (id) => authed('DELETE', `/api/orders/${id}`),
      getDrivers: () => authed<{ drivers: Driver[] }>('GET', '/api/batches/drivers').then((r) => r.drivers),
      getBatches: () => authed<{ batches: Batch[] }>('GET', '/api/batches').then((r) => r.batches),
      createBatch: (driverId) => authed<BatchDetail>('POST', '/api/batches', { driver_id: driverId }),
      getBatch: (id) => authed<BatchDetail>('GET', `/api/batches/${id}`),
      confirmStop: (id, body) =>
        authed<{ stop: Stop; lot_status: string | null; order_status: string | null; batch_status: Batch['status'] }>(
          'POST',
          `/api/stops/${id}/confirm`,
          body,
        ),
      unlockStop: (id) => authed<{ id: number; otp_attempts: number; locked: boolean }>('POST', `/api/stops/${id}/unlock`),
      getImpact: () => authed<{ summary: ImpactSummary }>('GET', '/api/impact/summary').then((r) => r.summary),
    };
  }, [token, updateProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      role: user?.role ?? null,
      mode,
      setMode,
      login,
      register,
      logout,
      refreshUser,
      api,
    }),
    [ready, user, mode, setMode, login, register, logout, refreshUser, api],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
