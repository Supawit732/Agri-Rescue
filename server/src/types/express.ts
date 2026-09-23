export type UserRole = 'farmer' | 'buyer' | 'driver' | 'coordinator';

export type Capability = 'sell' | 'buy' | 'admin';

export interface AuthCapabilities {
  can_sell: boolean;
  can_buy: boolean;
  is_admin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        id: number;
        role: UserRole;
        can_sell: boolean;
        can_buy: boolean;
        is_admin: boolean;
      };
    }
  }
}
