import { Router } from 'express';
import { buildDashboard } from '../dashboard/dashboardService';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { requireAuth } from '../middleware/auth';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth;
    if (auth === undefined) {
      throw new HttpError(401, 'UNAUTHORIZED', 'ต้องเข้าสู่ระบบ');
    }
    if (auth.is_admin) {
      res.json(await buildDashboard('admin', null));
      return;
    }
    if (auth.can_sell) {
      res.json(await buildDashboard('seller', auth.id));
      return;
    }
    throw new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์เข้าถึงแดชบอร์ด');
  }),
);
