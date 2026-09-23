import express, { type Express } from 'express';
import { errorHandler } from './middleware/errorHandler';
import { adminDitRouter } from './routes/adminDit';
import { authRouter } from './routes/auth';
import { batchesRouter } from './routes/batches';
import { donorsRouter } from './routes/donors';
import { cropsRouter } from './routes/crops';
import { geoRouter } from './routes/geo';
import { impactRouter } from './routes/impact';
import { lotsRouter } from './routes/lots';
import { marketRouter } from './routes/market';
import { ordersRouter } from './routes/orders';
import { plotsRouter } from './routes/plots';
import { stopsRouter } from './routes/stops';

export function createApp(): Express {
  const app = express();
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/auth', authRouter);
  app.use('/api/donors', donorsRouter);
  app.use('/api/geo', geoRouter);
  app.use('/api/crops', cropsRouter);
  app.use('/api/plots', plotsRouter);
  app.use('/api/lots', lotsRouter);
  app.use('/api/market', marketRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/batches', batchesRouter);
  app.use('/api/stops', stopsRouter);
  app.use('/api/impact', impactRouter);
  app.use('/api/admin/dit', adminDitRouter);
  app.use(errorHandler);
  return app;
}
