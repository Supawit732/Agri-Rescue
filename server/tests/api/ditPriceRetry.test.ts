import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import * as mocClient from '../../src/pricing/mocClient';
import { clearMocProductCacheForTests, useTempMocProductCacheForTests } from '../../src/pricing/mocProductCache';
import { resolveMarketPrice, syncCropReferencePrice, syncMissingTodayPrices } from '../../src/pricing/referencePrices';
import { resetDitJobStateForTests } from '../../src/jobs/ditPipeline';
import { insertCrop, registerUser, testApp } from '../helpers';
import request from 'supertest';
import { bearer } from '../helpers';

describe('DIT price sync status + hourly retry', () => {
  const app = testApp();

  beforeEach(() => {
    useTempMocProductCacheForTests();
    clearMocProductCacheForTests();
    resetDitJobStateForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearMocProductCacheForTests();
    resetDitJobStateForTests();
  });

  it('sets price status on API error and estimate still works', async () => {
    const cropId = await insertCrop('พืชเออเรอร์', 5, 22);
    await pool.query(`UPDATE crops SET dit_product_code = 'W-ERR', dit_unit = 'บาท/กก.' WHERE id = ?`, [cropId]);
    jest.spyOn(mocClient, 'fetchMocPrices').mockRejectedValue(new mocClient.MocApiError('aspnet', 'ASP.NET'));

    await expect(syncCropReferencePrice({ cropId, productCode: 'W-ERR' })).rejects.toBeTruthy();
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT dit_price_status FROM crops WHERE id = ?`, [cropId]);
    expect(String(rows[0]?.dit_price_status)).toContain('กระทรวง');

    const quote = await resolveMarketPrice(cropId);
    expect(quote.source).toBe('crop_fallback');
    expect(quote.price_per_kg).toBe(22);

    const farmer = await registerUser(app, { role: 'farmer' });
    const estimate = await request(app)
      .post('/api/lots/estimate')
      .set(bearer(farmer.token))
      .send({ crop_id: cropId, weight_kg: 5, grade: 'normal', ripeness: 2, lat: 13.7, lng: 100.5 });
    expect(estimate.status).toBe(200);
    expect(estimate.body.market_quote.source).toBe('crop_fallback');
  });

  it('uses unit from price response and flags non-kg without conversion', async () => {
    const cropId = await insertCrop('พืชหน่วย', 5, 25);
    await pool.query(`UPDATE crops SET dit_product_code = 'W-UNIT', dit_product_name = 'กล้วย (บาท/กก.)' WHERE id = ?`, [
      cropId,
    ]);
    jest.spyOn(mocClient, 'fetchMocPrices').mockResolvedValue({
      sourceUrl: 'https://example/moc',
      response: {
        product_id: 'W-UNIT',
        product_name: 'กล้วย',
        category_name: 'ขายส่ง',
        group_name: 'ผลไม้',
        unit: 'บาท/หวี',
        price_list: [{ date: '2026-09-23', price_min: 30, price_max: 40 }],
      },
    });
    const sync = await syncCropReferencePrice({
      cropId,
      productCode: 'W-UNIT',
      productName: 'กล้วย (บาท/กก.)',
      nameUnit: 'กก.',
    });
    expect(sync.reason).toBe('needs_unit_conversion');
    const [crops] = await pool.query<RowDataPacket[]>(`SELECT dit_unit, dit_price_status FROM crops WHERE id = ?`, [
      cropId,
    ]);
    expect(String(crops[0]?.dit_unit)).toContain('หวี');
    expect(String(crops[0]?.dit_price_status)).toContain('ตัวแปลง');
  });

  it('hourly retry skips when every mapped crop already has today price', async () => {
    await pool.query(`UPDATE crops SET dit_product_code = NULL, dit_match_source = NULL`);
    const cropId = await insertCrop('พืชครบ', 5, 30);
    await pool.query(`UPDATE crops SET dit_product_code = 'W-OK' WHERE id = ?`, [cropId]);
    const today = '2026-09-23';
    await pool.query(
      `INSERT INTO crop_reference_prices
         (crop_id, date, wholesale_price, retail_price, source, product_code, unit, source_url, fetched_at, rejected_as_outlier)
       VALUES (?, ?, 30, NULL, 'moc_dit', 'W-OK', 'บาท/กก.', 'https://example', UTC_TIMESTAMP(), 0)`,
      [cropId, today],
    );
    const spy = jest.spyOn(mocClient, 'fetchMocPrices');
    const result = await syncMissingTodayPrices(undefined, undefined, new Date('2026-09-23T12:00:00Z'));
    expect(result.skipped).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
