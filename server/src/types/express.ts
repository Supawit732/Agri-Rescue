export type UserRole = 'farmer' | 'buyer' | 'driver' | 'coordinator';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        id: number;
        role: UserRole;
      };
    }
  }
}
