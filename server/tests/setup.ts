import { clearWeatherCache } from '../src/weather/openMeteo';
import { pool } from '../src/db/pool';
import { migrate } from '../src/db/migrate';
import { installWeatherSuccess } from './weatherMock';

const TEST_DB = 'agri_rescue_test';

beforeAll(async () => {
  clearWeatherCache();
  installWeatherSuccess();
  if (process.env.DB_NAME !== TEST_DB) {
    throw new Error(`Tests must use ${TEST_DB}, got ${process.env.DB_NAME ?? ''}`);
  }
  await migrate();
  await pool.query(`
    DELETE FROM impact_logs;
    DELETE FROM route_stops;
    DELETE FROM orders;
    DELETE FROM batches;
    DELETE FROM quality_assessments;
    DELETE FROM harvest_lots;
    DELETE FROM plots;
    DELETE FROM crops;
    DELETE FROM users;
  `);
});

beforeEach(() => {
  clearWeatherCache();
  installWeatherSuccess();
});

afterAll(async () => {
  await pool.end();
});
