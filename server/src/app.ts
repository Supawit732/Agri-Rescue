import express, { type Express } from 'express';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { batchesRouter } from './routes/batches';
import { cropsRouter } from './routes/crops';
import { impactRouter } from './routes/impact';
import { lotsRouter } from './routes/lots';
import { marketRouter } from './routes/market';
import { ordersRouter } from './routes/orders';
import { plotsRouter } from './routes/plots';
import { stopsRouter } from './routes/stops';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/crops', cropsRouter);
  app.use('/api/plots', plotsRouter);
  app.use('/api/lots', lotsRouter);
  app.use('/api/market', marketRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/batches', batchesRouter);
  app.use('/api/stops', stopsRouter);
  app.use('/api/impact', impactRouter);
  app.use(errorHandler);
  return app;
}
