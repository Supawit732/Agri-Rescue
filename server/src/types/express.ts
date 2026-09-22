export type UserRole = 'farmer' | 'buyer' | 'driver' | 'coordinator';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        id: number;
        role: UserRole;
      };
    }
  }
}
