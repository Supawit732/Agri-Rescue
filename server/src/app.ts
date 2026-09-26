import express, { type Express } from 'express';
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

export function createApp(): Express {
  const app = express();
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
  app.use(errorHandler);
  return app;
}
