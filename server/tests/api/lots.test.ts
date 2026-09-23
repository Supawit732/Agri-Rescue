import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { PLAN_WEATHER_FALLBACK } from '../../src/db/seedData';
import { pool } from '../../src/db/pool';
import { urgentPricePerKg } from '../../src/domain/pricing';
import { predictShelfHours } from '../../src/domain/shelfLife';
import { bearer, insertCrop, registerUser, testApp } from '../helpers';
import { installWeatherFailure, installWeatherSuccess } from '../weatherMock';

describe('lots and plots', () => {
  const app = testApp();

  it('previews price from domain helpers and keeps lots scoped to the farmer', async () => {
    installWeatherSuccess(34, 78);
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const owner = await registerUser(app, { role: 'farmer', name: 'เจ้าของแปลง' });
    const other = await registerUser(app, { role: 'farmer', name: 'เกษตรกรคนอื่น' });

    const created = await request(app).post('/api/plots').set(bearer(owner.token)).send({
      name: 'แปลงมะม่วง',
      lat: 13.67,
      lng: 100.63,
      area_rai: 1,
    });
    expect(created.status).toBe(201);
    const plotId = Number(created.body.plot.id);

    const estimate = await request(app).post('/api/lots/estimate').set(bearer(owner.token)).send({
      crop_id: cropId,
      ripeness: 2,
      grade: 'normal',
      lat: 13.67,
      lng: 100.63,
    });
    expect(estimate.status).toBe(200);
    const shelfHours = predictShelfHours(5, 2, 34, 78);
    expect(estimate.body.shelf_hours).toBe(shelfHours);
    expect(estimate.body.price_per_kg).toBe(
      urgentPricePerKg({
        marketPricePerKg: 40,
        baseShelfHours: 5 * 24,
        hoursLeft: shelfHours,
        grade: 'normal',
      }),
    );
    expect(estimate.body.temp_c).toBe(34);
    expect(estimate.body.humidity).toBe(78);
    expect(estimate.body.weather_source).toBe('live');
    expect(estimate.body.weather_basis).toBe('forecast_72h_daytime_avg');
    expect(estimate.body.shelf_hours).toBe(61);
    expect(estimate.body.price_per_kg).toBe(26);

    const [before] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM harvest_lots');
    expect(Number(before[0]?.total)).toBe(0);

    const lot = await request(app).post('/api/lots').set(bearer(owner.token)).send({
      plot_id: plotId,
      crop_id: cropId,
      weight_kg: 12,
      grade: 'substandard',
      ripeness: 2,
      allow_donation: true,
    });
    expect(lot.status).toBe(201);
    expect(lot.body.assessment.method).toBe('rule');
    expect(lot.body.lot.predicted_shelf_hours).toBe(shelfHours);

    const mine = await request(app).get('/api/lots/mine').set(bearer(owner.token));
    expect(mine.status).toBe(200);
    expect(mine.body.lots).toHaveLength(1);

    const hidden = await request(app).get('/api/lots').set(bearer(other.token));
    expect(hidden.body.lots).toHaveLength(0);
    const otherPlots = await request(app).get('/api/plots/mine').set(bearer(other.token));
    expect(otherPlots.body.plots).toHaveLength(0);

    const forbidden = await request(app).post('/api/lots').set(bearer(other.token)).send({
      plot_id: plotId,
      crop_id: cropId,
      weight_kg: 5,
      grade: 'normal',
      ripeness: 1,
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('returns weather_source fallback from /lots/estimate when Open-Meteo fails', async () => {
    installWeatherFailure();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const cropId = await insertCrop('กล้วย', 4, 20);
      const owner = await registerUser(app, { role: 'farmer', name: 'เกษตรกรอากาศสำรอง' });

      const estimate = await request(app).post('/api/lots/estimate').set(bearer(owner.token)).send({
        crop_id: cropId,
        ripeness: 1,
        grade: 'substandard',
        lat: 13.67,
        lng: 100.63,
      });
      expect(estimate.status).toBe(200);
      expect(estimate.body.temp_c).toBe(PLAN_WEATHER_FALLBACK.tempC);
      expect(estimate.body.humidity).toBe(PLAN_WEATHER_FALLBACK.humidity);
      expect(estimate.body.weather_source).toBe('fallback');
      expect(estimate.body.weather_basis).toBe('forecast_72h_daytime_avg');
      expect(estimate.body.shelf_hours).toBe(
        predictShelfHours(4, 1, PLAN_WEATHER_FALLBACK.tempC, PLAN_WEATHER_FALLBACK.humidity),
      );
      expect(estimate.body.price_per_kg).toBe(
        urgentPricePerKg({
          marketPricePerKg: 20,
          baseShelfHours: 4 * 24,
          hoursLeft: estimate.body.shelf_hours,
          grade: 'substandard',
        }),
      );
    } finally {
      warn.mockRestore();
    }
  });
});
