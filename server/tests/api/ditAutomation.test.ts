import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { autoMatchUnmappedCrops, resetDitJobStateForTests } from '../../src/jobs/ditPipeline';
import { pool } from '../../src/db/pool';
import * as mocClient from '../../src/pricing/mocClient';
import { clearMocProductCacheForTests } from '../../src/pricing/mocProductCache';
import { resolveMarketPrice, syncCropReferencePrice } from '../../src/pricing/referencePrices';
import { bearer, insertCrop, loginStaff, registerUser, testApp } from '../helpers';

describe('DIT automation', () => {
  const app = testApp();

  beforeEach(() => {
    clearMocProductCacheForTests();
    resetDitJobStateForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearMocProductCacheForTests();
    resetDitJobStateForTests();
  });

  function mockCatalog(): void {
    clearMocProductCacheForTests();
    jest.spyOn(mocClient, 'fetchMocProducts').mockResolvedValue([
      {
        product_id: 'W-AUTO',
        product_name: 'มะม่วงน้ำดอกไม้ คละ (บาท/กก.)',
        category_name: 'ผลไม้',
        sell_type: 'ขายส่ง',
      },
      {
        product_id: 'P-FRUIT',
        product_name: 'ทุเรียนหมอนทอง (บาท/ผล)',
        category_name: 'ผลไม้',
        sell_type: 'ขายส่ง',
      },
      {
        product_id: 'W-ORG',
        product_name: 'มะม่วงน้ำดอกไม้ อินทรีย์ ร้านเลมอนฟาร์ม (บาท/กก.)',
        category_name: 'อินทรีย์',
        sell_type: 'ขายส่ง',
      },
    ]);
  }

  it('auto-matches unmapped kg crops and skips non-kg / organic', async () => {
    mockCatalog();
    const autoId = await insertCrop('มะม่วงน้ำดอกไม้', 5, 40);
    const noMatchId = await insertCrop('ทุเรียนหมอนทอง', 5, 80);
    const organicOnly = await insertCrop('พืชอินทรีย์เท่านั้น', 5, 10);
    await pool.query(`UPDATE crops SET name_th = 'มะม่วงน้ำดอกไม้ อินทรีย์พิเศษ' WHERE id = ?`, [organicOnly]);

    const matched = await autoMatchUnmappedCrops();
    expect(matched).toBeGreaterThanOrEqual(1);

    const [autoRows] = await pool.query<RowDataPacket[]>(
      `SELECT dit_product_code, dit_match_source FROM crops WHERE id = ?`,
      [autoId],
    );
    expect(autoRows[0]?.dit_product_code).toBe('W-AUTO');
    expect(autoRows[0]?.dit_match_source).toBe('auto');

    const [noMatch] = await pool.query<RowDataPacket[]>(
      `SELECT dit_product_code FROM crops WHERE id = ?`,
      [noMatchId],
    );
    expect(noMatch[0]?.dit_product_code).toBeNull();
  });

  it('does not overwrite manual mappings', async () => {
    mockCatalog();
    const cropId = await insertCrop('มะม่วงน้ำดอกไม้', 5, 40);
    await pool.query(
      `UPDATE crops SET dit_product_code = 'MANUAL-1', dit_match_source = 'manual', dit_unit = 'กก.' WHERE id = ?`,
      [cropId],
    );
    await autoMatchUnmappedCrops();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT dit_product_code, dit_match_source FROM crops WHERE id = ?`,
      [cropId],
    );
    expect(rows[0]?.dit_product_code).toBe('MANUAL-1');
    expect(rows[0]?.dit_match_source).toBe('manual');
  });

  it('flags outlier prices and resolveMarketPrice ignores them', async () => {
    const cropId = await insertCrop('พืชราคาเพี้ยน', 5, 20);
    await pool.query(`UPDATE crops SET dit_product_code = 'W-OUT', dit_unit = 'บาท/กก.' WHERE id = ?`, [cropId]);

    jest.spyOn(mocClient, 'fetchMocPrices').mockResolvedValue({
      sourceUrl: 'https://dataapi.moc.go.th/gis-product-prices?product_id=W-OUT',
      response: {
        product_id: 'W-OUT',
        product_name: 'พืช',
        category_name: null,
        group_name: null,
        unit: 'บาท/กก.',
        price_list: [{ date: '2026-09-20', price_min: 100, price_max: 100 }],
      },
    });

    const sync = await syncCropReferencePrice({ cropId, productCode: 'W-OUT' });
    expect(sync.rejected_as_outlier).toBe(true);

    const [refs] = await pool.query<RowDataPacket[]>(
      `SELECT rejected_as_outlier, wholesale_price FROM crop_reference_prices WHERE crop_id = ?`,
      [cropId],
    );
    expect(Number(refs[0]?.rejected_as_outlier)).toBe(1);
    expect(Number(refs[0]?.wholesale_price)).toBe(100);

    const quote = await resolveMarketPrice(cropId);
    expect(quote.source).toBe('crop_fallback');
    expect(quote.price_per_kg).toBe(20);
  });

  it('estimate reads DB only and does not call MOC', async () => {
    const fetchSpy = jest.spyOn(mocClient, 'fetchMocPrices');
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('มะม่วงประมาณ', 5, 33);
    const estimate = await request(app)
      .post('/api/lots/estimate')
      .set(bearer(farmer.token))
      .send({ crop_id: cropId, weight_kg: 10, grade: 'normal', ripeness: 2, lat: 13.7, lng: 100.5 });
    expect(estimate.status).toBe(200);
    expect(estimate.body.market_quote.price_per_kg).toBe(33);
    expect(estimate.body.market_quote.source).toBe('crop_fallback');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('admin mapping sets match_source manual and sync starts in background', async () => {
    mockCatalog();
    jest.spyOn(mocClient, 'fetchMocPrices').mockResolvedValue({
      sourceUrl: 'https://example/moc',
      response: {
        product_id: 'W-AUTO',
        product_name: 'มะม่วง',
        category_name: null,
        group_name: null,
        unit: 'บาท/กก.',
        price_list: [{ date: '2026-09-20', price_min: 40, price_max: 42 }],
      },
    });
    const admin = await loginStaff(app, 'coordinator', 'แอดมินออโต้');
    const cropId = await insertCrop('มะม่วงน้ำดอกไม้', 5, 40);
    const mapped = await request(app)
      .post(`/api/admin/dit/crops/${cropId}/mapping`)
      .set(bearer(admin.token))
      .send({ product_code: 'W-AUTO' });
    expect(mapped.status).toBe(200);
    expect(mapped.body.match_source).toBe('manual');

    const [rows] = await pool.query<RowDataPacket[]>(`SELECT dit_match_source FROM crops WHERE id = ?`, [cropId]);
    expect(rows[0]?.dit_match_source).toBe('manual');

    const sync = await request(app).post('/api/admin/dit/sync').set(bearer(admin.token));
    expect(sync.status).toBe(200);
    expect(sync.body.started).toBe(true);
    expect(sync.body.job).toBeDefined();

    const crops = await request(app).get('/api/admin/dit/crops').set(bearer(admin.token));
    expect(crops.status).toBe(200);
    const row = (crops.body.crops as Array<{ id: number; dit_match_source: string }>).find((c) => c.id === cropId);
    expect(row?.dit_match_source).toBe('manual');
    expect(row).not.toHaveProperty('suggestions');
  });
});
