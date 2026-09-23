import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/asyncHandler';
import { HttpError } from '../http/errors';
import { reverseGeocode } from '../geo/nominatim';
import { resolveGoogleMapsLink } from '../geo/resolveLink';
import { geoRateLimit } from '../middleware/geoRateLimit';

export const geoRouter = Router();

geoRouter.use(geoRateLimit);

const resolveSchema = z.object({
  url: z.string().trim().min(1, 'กรุณาวางลิงก์ Google Maps'),
});

const reverseQuerySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
});

geoRouter.post(
  '/resolve-link',
  asyncHandler(async (req, res) => {
    const body = resolveSchema.parse(req.body);
    const result = await resolveGoogleMapsLink(body.url);
    res.json({ lat: result.lat, lng: result.lng });
  }),
);

geoRouter.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const query = reverseQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new HttpError(400, 'VALIDATION', query.error.issues[0]?.message ?? 'พิกัดไม่ถูกต้อง');
    }
    const { lat, lng } = query.data;
    const { displayName } = await reverseGeocode(lat, lng);
    res.json({ lat, lng, display_name: displayName });
  }),
);
