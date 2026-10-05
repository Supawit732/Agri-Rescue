import fs from 'fs';
import path from 'path';
import express, { type Express } from 'express';
import { adminAudit } from './middleware/adminAudit';
import { errorHandler } from './middleware/errorHandler';
import { adminDitRouter } from './routes/adminDit';
import { authRouter } from './routes/auth';
import { donorsRouter } from './routes/donors';
import { cropsRouter } from './routes/crops';
import { dashboardRouter } from './routes/dashboard';
import { geoRouter } from './routes/geo';
import { impactRouter } from './routes/impact';
import { lotsRouter } from './routes/lots';
import { marketRouter } from './routes/market';
import { ordersRouter } from './routes/orders';
import { plotsRouter } from './routes/plots';
import { publicMarketRouter } from './routes/publicMarket';
import { shopsRouter } from './routes/shops';
import { notificationsRouter } from './routes/notifications';
import { supportRouter } from './routes/support';
import { adminConsoleRouter } from './routes/adminConsole';
import { ensurePublicUploadsDir, PUBLIC_UPLOADS_DIR } from './storage/publicUploads';

void ensurePublicUploadsDir().catch((err: unknown) => {
  console.error('Failed to ensure uploads directory', err);
});

const SEED_PHOTOS_DIR = path.resolve(__dirname, '../assets/seed-photos');

/**
 * Number of reverse-proxy hops in front of the app (nginx = 1) so req.ip is the real client
 * IP from X-Forwarded-For. TRUST_PROXY overrides: a hop count, "true"/"false", or an
 * Express trust-proxy value such as "loopback". Defaults to 1 in production, off otherwise.
 */
export function resolveTrustProxy(env: NodeJS.ProcessEnv = process.env): boolean | number | string {
  const raw = (env.TRUST_PROXY ?? '').trim();
  if (raw === '') {
    return env.NODE_ENV === 'production' ? 1 : false;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', resolveTrustProxy());
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept-Language');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '8mb' }));
  // Committed sample crop photos for a fresh seed/demo (server/assets/seed-photos), served
  // at the same /uploads/... shape as a real uploaded lot photo so the client's photo URL
  // handling doesn't need a special case. Mounted before the general uploads static so it
  // wins for this one path even though PUBLIC_UPLOADS_DIR also has a (gitignored) uploads/seed/.
  app.use('/uploads/seed', express.static(SEED_PHOTOS_DIR, { maxAge: '7d' }));
  app.use('/uploads', express.static(PUBLIC_UPLOADS_DIR, { fallthrough: true, maxAge: '1d' }));
  if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        console.log(`HTTP ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
      });
      next();
    });
  }
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', adminAudit);
  app.use('/api/auth', authRouter);
  app.use('/api/donors', donorsRouter);
  app.use('/api/geo', geoRouter);
  app.use('/api/crops', cropsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/plots', plotsRouter);
  app.use('/api/lots', lotsRouter);
  app.use('/api/public', publicMarketRouter);
  app.use('/api/shops', shopsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/support', supportRouter);
  app.use('/api/market', marketRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/impact', impactRouter);
  app.use('/api/admin/dit', adminDitRouter);
  app.use('/api/admin', adminConsoleRouter);

  const webDistDir = path.resolve(
    (process.env.WEB_DIST_DIR ?? '').trim() || path.join(__dirname, '../public'),
  );
  const webIndexPath = path.join(webDistDir, 'index.html');
  if (fs.existsSync(webIndexPath)) {
    app.use(express.static(webDistDir));
    // SPA fallback for client-side routes (e.g. /lots/123) that have no
    // matching static file — but never shadow the API/uploads/health routes
    // above, which already answered (with their own 404s) if matched.
    app.get(/.*/, (req, res, next) => {
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/uploads/') ||
        req.path === '/health'
      ) {
        next();
        return;
      }
      res.sendFile(webIndexPath);
    });
  }

  app.use(errorHandler);
  return app;
}
