import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, setUnauthorizedHandler } from '../api/client';
import { clearToken, loadToken, saveToken } from '../api/storage';
import type {
  AssessPhotoResponse,
  AuthResponse,
  Batch,
  BatchDetail,
  BuyerType,
  Crop,
  Driver,
  EstimateResponse,
  Grade,
  ImpactSummary,
  MarketLot,
  MyLot,
  Order,
  Plot,
  Stop,
  User,
  UserRole,
} from '../api/types';

interface RegisterInput {
  name: string;
  phone: string;
  password: string;
  role: 'farmer' | 'buyer';
  buyer_type?: BuyerType | null;
  lat?: number | null;
  lng?: number | null;
}

interface Api {
  getCrops: () => Promise<Crop[]>;
  getPlots: () => Promise<Plot[]>;
  estimate: (input: { crop_id: number; ripeness: number; grade: Grade; lat: number; lng: number }) => Promise<EstimateResponse>;
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
    allow_donation: boolean;
    ai_ripeness?: number | null;
    ai_confidence?: number | null;
    ai_model?: string | null;
  }) => Promise<unknown>;
  getMyLots: () => Promise<MyLot[]>;
  getMarket: (lat: number, lng: number, radiusKm: number) => Promise<MarketLot[]>;
  createOrder: (lotId: number, donation: boolean) => Promise<{ order: Order }>;
  getMyOrders: () => Promise<Order[]>;
  cancelOrder: (id: number) => Promise<unknown>;
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
}

interface AuthContextValue {
  ready: boolean;
  user: User | null;
  role: UserRole | null;
  login: (phone: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  api: Api;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadToken();
      if (active) {
        setToken(stored);
        setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    void clearToken();
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
    await saveToken(auth.token);
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

  const api = useMemo<Api>(() => {
    const authed = <T,>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> =>
      apiRequest<T>({ method, path, token, body });
    return {
      getCrops: () => authed<{ crops: Crop[] }>('GET', '/api/crops').then((r) => r.crops),
      getPlots: () => authed<{ plots: Plot[] }>('GET', '/api/plots/mine').then((r) => r.plots),
      estimate: (input) => authed<EstimateResponse>('POST', '/api/lots/estimate', input),
      assessPhoto: (input) => authed<AssessPhotoResponse>('POST', '/api/lots/assess-photo', input),
      createLot: (input) => authed('POST', '/api/lots', input),
      getMyLots: () => authed<{ lots: MyLot[] }>('GET', '/api/lots/mine').then((r) => r.lots),
      getMarket: (lat, lng, radiusKm) =>
        authed<{ lots: MarketLot[] }>('GET', `/api/market?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`).then((r) => r.lots),
      createOrder: (lotId, donation) => authed<{ order: Order }>('POST', '/api/orders', { lot_id: lotId, donation }),
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
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({ ready, user, role: user?.role ?? null, login, register, logout, api }),
    [ready, user, login, register, logout, api],
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
