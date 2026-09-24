import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/asyncHandler';
import { requireAuth } from '../middleware/auth';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadCount,
} from '../notifications/notificationService';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.auth?.id ?? 0;
    const query = z
      .object({
        filter: z.enum(['all', 'shop', 'order']).default('all'),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(req.query);
    const result = await listNotifications(userId, {
      filter: query.filter,
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    res.json(result);
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const userId = req.auth?.id ?? 0;
    const count = await unreadCount(userId);
    res.json({ unread_count: count });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const userId = req.auth?.id ?? 0;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const ok = await markNotificationRead(userId, id);
    res.json({
      ok,
      unread_count: await unreadCount(userId),
    });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const userId = req.auth?.id ?? 0;
    const updated = await markAllNotificationsRead(userId);
    res.json({ updated, unread_count: 0 });
  }),
);
