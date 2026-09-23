import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import * as vision from '../../src/ai/vision';
import { bearer, insertCrop, registerUser, testApp } from '../helpers';
import { installWeatherSuccess } from '../weatherMock';

describe('POST /api/lots/assess-photo and AI lot creation', () => {
  const app = testApp();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the mocked assessment for a farmer', async () => {
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const owner = await registerUser(app, { role: 'farmer', name: 'เกษตรกร AI' });
    jest.spyOn(vision, 'assessRipenessFromPhoto').mockResolvedValue({
      available: true,
      subject_match: true,
      ripeness: 3,
      confidence: 0.91,
      defects: ['แผลเล็ก'],
      note_th: 'สุกมาก',
      low_confidence: false,
      model: 'test-model',
    });

    const response = await request(app)
      .post('/api/lots/assess-photo')
      .set(bearer(owner.token))
      .send({
        crop_id: cropId,
        image_base64: Buffer.from('tiny').toString('base64'),
        mime: 'image/jpeg',
      });
    expect(response.status).toBe(200);
    expect(response.body.available).toBe(true);
    expect(response.body.ripeness).toBe(3);
    expect(vision.assessRipenessFromPhoto).toHaveBeenCalled();
  });

  it('forwards subject_match false from the vision client', async () => {
    const cropId = await insertCrop('กล้วยน้ำว้า', 4, 25);
    const owner = await registerUser(app, { role: 'farmer', name: 'รูปไม่ตรงพืช' });
    jest.spyOn(vision, 'assessRipenessFromPhoto').mockResolvedValue({
      available: true,
      subject_match: false,
    });

    const response = await request(app)
      .post('/api/lots/assess-photo')
      .set(bearer(owner.token))
      .send({
        crop_id: cropId,
        image_base64: Buffer.from('tiny').toString('base64'),
        mime: 'image/jpeg',
      });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ available: true, subject_match: false });
    expect(response.body.ripeness).toBeUndefined();
  });

  it('stores method model when the farmer keeps the AI ripeness', async () => {
    installWeatherSuccess(32, 75);
    const cropId = await insertCrop('กล้วย', 4, 25);
    const owner = await registerUser(app, { role: 'farmer', name: 'ใช้ค่า AI' });
    const plot = await request(app).post('/api/plots').set(bearer(owner.token)).send({
      name: 'แปลง AI',
      lat: 13.67,
      lng: 100.63,
      area_rai: 1,
    });
    const created = await request(app).post('/api/lots').set(bearer(owner.token)).send({
      plot_id: plot.body.plot.id,
      crop_id: cropId,
      weight_kg: 10,
      grade: 'substandard',
      ripeness: 2,
      allow_donation: false,
      ai_ripeness: 2,
      ai_confidence: 0.88,
      ai_model: 'test-model',
    });
    expect(created.status).toBe(201);
    expect(created.body.assessment.method).toBe('model');
    expect(created.body.assessment.ai_ripeness).toBe(2);
    expect(created.body.assessment.ai_confidence).toBe(0.88);
    expect(created.body.assessment.ai_model).toBe('test-model');
  });

  it('stores method rule but keeps AI fields when the farmer edits ripeness', async () => {
    installWeatherSuccess(32, 75);
    const cropId = await insertCrop('มะเขือเทศ', 6, 30);
    const owner = await registerUser(app, { role: 'farmer', name: 'แก้ค่า AI' });
    const plot = await request(app).post('/api/plots').set(bearer(owner.token)).send({
      name: 'แปลงแก้',
      lat: 13.67,
      lng: 100.63,
      area_rai: 1,
    });
    const created = await request(app).post('/api/lots').set(bearer(owner.token)).send({
      plot_id: plot.body.plot.id,
      crop_id: cropId,
      weight_kg: 8,
      grade: 'normal',
      ripeness: 1,
      allow_donation: false,
      ai_ripeness: 3,
      ai_confidence: 0.7,
      ai_model: 'test-model',
    });
    expect(created.status).toBe(201);
    expect(created.body.assessment.method).toBe('rule');
    expect(created.body.assessment.ripeness).toBe(1);
    expect(created.body.assessment.ai_ripeness).toBe(3);

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT method, ai_ripeness, ai_confidence, ai_model FROM quality_assessments WHERE id = ?',
      [created.body.assessment.id],
    );
    expect(rows[0]).toMatchObject({
      method: 'rule',
      ai_ripeness: 3,
      ai_model: 'test-model',
    });
  });
});
