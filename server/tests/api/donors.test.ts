import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import * as vision from '../../src/ai/vision';
import { pool } from '../../src/db/pool';
import { expireMissedDonationProofs } from '../../src/donors/donationService';
import { bearer, insertCrop, insertLot, insertPlot, loginStaff, registerUser, testApp } from '../helpers';

describe('donors 6.1b', () => {
  const app = testApp();
  const tinyPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function openDonationLot(opts?: {
    audience?: 'verified_org_only' | 'all_donors';
    weightKg?: number;
  }): Promise<number> {
    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61);
    return insertLot({
      plotId,
      cropId,
      allowDonation: true,
      donationAudience: opts?.audience ?? 'verified_org_only',
      weightKg: opts?.weightKg ?? 5,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
  }

  it('rejects non-admin org doc download with 403', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const apply = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(buyer.token))
      .send({
        org_name: 'มูลนิธิทดสอบ',
        org_type: 'foundation',
        contact_name: 'พี่แดง',
        contact_title: 'ประธาน',
        contact_phone: '0891111111',
        org_lat: 13.7,
        org_lng: 100.5,
        beneficiary_count: 40,
        distribution_mode: 'redistribute',
        documents: [{ filename: 'cert.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4').toString('base64') }],
      });
    expect(apply.status).toBe(201);
    const [docs] = await pool.query<RowDataPacket[]>('SELECT id FROM org_application_docs WHERE user_id = ?', [
      buyer.user.id,
    ]);
    const docId = Number(docs[0]?.id);
    const forbidden = await request(app).get(`/api/donors/admin/org-docs/${docId}`).set(bearer(buyer.token));
    expect(forbidden.status).toBe(403);

    const admin = await loginStaff(app, 'coordinator', 'แอดมินเอกสาร');
    const ok = await request(app).get(`/api/donors/admin/org-docs/${docId}`).set(bearer(admin.token));
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('application/pdf');
  });

  it('enforces weekly caps and audience by tier', async () => {
    const volunteer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    await request(app).post('/api/donors/volunteer').set(bearer(volunteer.token)).send({});
    const orgOnly = await openDonationLot({ audience: 'verified_org_only', weightKg: 5 });
    const blocked = await request(app)
      .post('/api/orders')
      .set(bearer(volunteer.token))
      .send({
        lot_id: orgOnly,
        donation: true,
        distribution_place: 'ตลาดชุมชน',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(blocked.status).toBe(403);

    const openLot = await openDonationLot({ audience: 'all_donors', weightKg: 5 });
    const ok = await request(app)
      .post('/api/orders')
      .set(bearer(volunteer.token))
      .send({
        lot_id: openLot,
        donation: true,
        distribution_place: 'ตลาดชุมชน',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(ok.status).toBe(201);

    const heavy = await openDonationLot({ audience: 'all_donors', weightKg: 8 });
    const overCap = await request(app)
      .post('/api/orders')
      .set(bearer(volunteer.token))
      .send({
        lot_id: heavy,
        donation: true,
        distribution_place: 'ตลาดชุมชน',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(overCap.status).toBe(403);
    expect(overCap.body.error.message).toContain('เพดาน');
  });

  it('promotes volunteer after 5 matching proofs and suspends after 3 fails', async () => {
    jest.spyOn(vision, 'assessRipenessFromPhoto').mockResolvedValue({
      available: true,
      subject_match: true,
      ripeness: 2,
      confidence: 0.9,
      defects: [],
      note_th: 'ok',
      low_confidence: false,
      model: 'test',
    });

    const volunteer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', name: 'จิตอาสาเลื่อนขั้น' });
    const volunteered = await request(app).post('/api/donors/volunteer').set(bearer(volunteer.token)).send({});
    expect(volunteered.body.user.donor_tier).toBe('volunteer');

    for (let i = 0; i < 5; i += 1) {
      const farmer = await registerUser(app, { role: 'farmer' });
      const cropId = await insertCrop(`พืช${i}`, 5, 40);
      const plotId = await insertPlot(farmer.user.id, 13.6 + i * 0.01, 100.6);
      const lotId = await insertLot({
        plotId,
        cropId,
        allowDonation: true,
        donationAudience: 'all_donors',
        weightKg: 1,
        expiresAt: new Date(Date.now() + 86400000 * 3),
      });
      const booked = await request(app)
        .post('/api/orders')
        .set(bearer(volunteer.token))
        .send({
          lot_id: lotId,
          donation: true,
          distribution_place: 'จุดแจก',
          distribution_at: new Date(Date.now() + 86400000).toISOString(),
        });
      expect(booked.status).toBe(201);
      await pool.query(`UPDATE orders SET status = 'delivered' WHERE id = ?`, [booked.body.order.id]);
      await pool.query(
        `INSERT INTO donation_proofs (order_id, due_at, status) VALUES (?, UTC_TIMESTAMP() + INTERVAL 1 DAY, 'pending')`,
        [booked.body.order.id],
      );
      const proof = await request(app)
        .post(`/api/donors/orders/${booked.body.order.id}/proof`)
        .set(bearer(volunteer.token))
        .send({ image_base64: tinyPng, mime: 'image/png' });
      expect(proof.status).toBe(200);
      if (i === 4) {
        expect(proof.body.promoted).toBe(true);
        expect(proof.body.user.donor_tier).toBe('trusted_volunteer');
      }
    }

    jest.spyOn(vision, 'assessRipenessFromPhoto').mockResolvedValue({
      available: true,
      subject_match: false,
    });

    const failUser = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', name: 'จะถูกระงับ' });
    await request(app).post('/api/donors/volunteer').set(bearer(failUser.token)).send({});
    for (let i = 0; i < 3; i += 1) {
      const farmer = await registerUser(app, { role: 'farmer' });
      const cropId = await insertCrop(`ล้ม${i}`, 5, 40);
      const plotId = await insertPlot(farmer.user.id, 13.5 + i * 0.01, 100.5);
      const lotId = await insertLot({
        plotId,
        cropId,
        allowDonation: true,
        donationAudience: 'all_donors',
        weightKg: 1,
        expiresAt: new Date(Date.now() + 86400000 * 3),
      });
      const booked = await request(app)
        .post('/api/orders')
        .set(bearer(failUser.token))
        .send({
          lot_id: lotId,
          donation: true,
          distribution_place: 'จุดแจก',
          distribution_at: new Date(Date.now() + 86400000).toISOString(),
        });
      await pool.query(`UPDATE orders SET status = 'delivered' WHERE id = ?`, [booked.body.order.id]);
      await pool.query(
        `INSERT INTO donation_proofs (order_id, due_at, status) VALUES (?, UTC_TIMESTAMP() + INTERVAL 1 DAY, 'pending')`,
        [booked.body.order.id],
      );
      const proof = await request(app)
        .post(`/api/donors/orders/${booked.body.order.id}/proof`)
        .set(bearer(failUser.token))
        .send({ image_base64: tinyPng, mime: 'image/png' });
      expect(proof.status).toBe(200);
      if (i === 2) {
        expect(proof.body.suspended).toBe(true);
        expect(proof.body.user.donation_suspended).toBe(true);
      }
    }

    const admin = await loginStaff(app, 'coordinator', 'ปลดล็อก');
    const unlocked = await request(app)
      .post(`/api/donors/admin/donors/${failUser.user.id}/unlock`)
      .set(bearer(admin.token));
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.user.donation_suspended).toBe(false);
  });

  it('marks overdue proofs as missed via expire job', async () => {
    const volunteer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    await request(app).post('/api/donors/volunteer').set(bearer(volunteer.token)).send({});
    const lotId = await openDonationLot({ audience: 'all_donors', weightKg: 1 });
    const booked = await request(app)
      .post('/api/orders')
      .set(bearer(volunteer.token))
      .send({
        lot_id: lotId,
        donation: true,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    await pool.query(`UPDATE orders SET status = 'delivered' WHERE id = ?`, [booked.body.order.id]);
    await pool.query(
      `INSERT INTO donation_proofs (order_id, due_at, status) VALUES (?, UTC_TIMESTAMP() - INTERVAL 1 HOUR, 'pending')`,
      [booked.body.order.id],
    );
    const n = await expireMissedDonationProofs(new Date());
    expect(n).toBeGreaterThanOrEqual(1);
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT status FROM donation_proofs WHERE order_id = ?`, [
      booked.body.order.id,
    ]);
    expect(rows[0]?.status).toBe('missed');
  });
});
