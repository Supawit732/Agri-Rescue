import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import * as mocClient from '../../src/pricing/mocClient';
import { bearer, insertCrop, insertLot, insertPlot, loginStaff, registerUser, testApp } from '../helpers';

describe('lots patch and pricing 6.1c', () => {
  const app = testApp();

  it('rejects patch by non-owner, after reserve, weight increase, and expiry extension', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const other = await registerUser(app, { role: 'farmer', name: 'คนอื่น' });
    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61);
    const lotId = await insertLot({
      plotId,
      cropId,
      weightKg: 20,
      allowDonation: false,
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const forbidden = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(other.token))
      .send({ weight_kg: 18 });
    expect(forbidden.status).toBe(403);

    const heavier = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(farmer.token))
      .send({ weight_kg: 25 });
    expect(heavier.status).toBe(400);

    const okTrim = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(farmer.token))
      .send({ weight_kg: 18 });
    expect(okTrim.status).toBe(200);
    expect(okTrim.body.lot.weight_kg).toBe(18);

    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const booked = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: lotId, donation: false });
    expect(booked.status).toBe(201);

    const afterBook = await request(app)
      .patch(`/api/lots/${lotId}`)
      .set(bearer(farmer.token))
      .send({ weight_kg: 15 });
    expect(afterBook.status).toBe(409);
  });

  it('rejects out-of-bounds seller prices with 400', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop('พืชราคา', 5, 40);
    const plotId = await insertPlot(farmer.user.id, 13.7, 100.7);
    const bad = await request(app)
      .post('/api/lots')
      .set(bearer(farmer.token))
      .send({
        plot_id: plotId,
        crop_id: cropId,
        weight_kg: 10,
        grade: 'normal',
        ripeness: 2,
        sale_mode: 'sell',
        start_price_per_kg: 50,
        floor_price_per_kg: 10,
      });
    expect(bad.status).toBe(400);
  });

  it('blocks paid booking of donate-only lots', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.71, 100.71);
    const created = await request(app)
      .post('/api/lots')
      .set(bearer(farmer.token))
      .send({
        plot_id: plotId,
        crop_id: cropId,
        weight_kg: 8,
        grade: 'normal',
        ripeness: 2,
        sale_mode: 'donate',
        donation_audience: 'all_donors',
      });
    expect(created.status).toBe(201);
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const paid = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: created.body.lot.id, donation: false });
    expect(paid.status).toBe(403);
  });
});

describe('admin DIT mapping', () => {
  const app = testApp();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps product code, stores reference price from mocked MOC, and requires unit conversion', async () => {
    jest.spyOn(mocClient, 'fetchMocPrices').mockResolvedValue({
      sourceUrl: 'https://dataapi.moc.go.th/gis-product-prices?product_id=W14009&from_date=2024-01-01&to_date=2024-01-31',
      response: {
        product_id: 'W14009',
        product_name: 'กล้วยน้ำว้า',
        category_name: 'ผลไม้',
        group_name: 'ผลไม้',
        unit: 'บาท/หวี',
        price_list: [{ date: '2024-01-15T00:00:00', price_min: 60, price_max: 70 }],
      },
    });
    jest.spyOn(mocClient, 'fetchMocProducts').mockResolvedValue([
      {
        product_id: 'W14009',
        product_name: 'กล้วยน้ำว้า',
        category_name: 'ผลไม้',
        sell_type: 'ขายส่ง',
      },
    ]);

    const admin = await loginStaff(app, 'coordinator', 'แอดมินราคา');
    const cropId = await insertCrop('กล้วยน้ำว้าทดสอบ', 4, 25);

    const mapped = await request(app)
      .post(`/api/admin/dit/crops/${cropId}/mapping`)
      .set(bearer(admin.token))
      .send({ product_code: 'W14009' });
    expect(mapped.status).toBe(200);

    const [refs] = await pool.query<RowDataPacket[]>(
      `SELECT wholesale_price, unit, product_code, source_url FROM crop_reference_prices WHERE crop_id = ?`,
      [cropId],
    );
    expect(refs[0]?.product_code).toBe('W14009');
    expect(Number(refs[0]?.wholesale_price)).toBe(65);
    expect(String(refs[0]?.unit)).toContain('หวี');
    expect(String(refs[0]?.source_url)).toContain('gis-product-prices');

    const withFactor = await request(app)
      .post(`/api/admin/dit/crops/${cropId}/mapping`)
      .set(bearer(admin.token))
      .send({ product_code: 'W14009', unit_to_kg: 0.5 });
    expect(withFactor.status).toBe(200);

    const suggest = await request(app)
      .post(`/api/admin/dit/crops/${cropId}/suggest`)
      .set(bearer(admin.token));
    expect(suggest.status).toBe(200);
    expect(Array.isArray(suggest.body.suggestions)).toBe(true);
  });
});
