import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import * as vision from '../../src/ai/vision';
import { pool } from '../../src/db/pool';
import { DONOR_TERMS_VERSION } from '../../src/domain/donorTerms';
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

  async function applyOrg(token: string): Promise<void> {
    const apply = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(token))
      .send({
        application_kind: 'organization',
        terms_version: DONOR_TERMS_VERSION,
        terms_accepted: true,
        org_name: 'มูลนิธิทดสอบ',
        org_type: 'foundation',
        registered: true,
        registration_number: '0123456789012',
        registered_address: 'กรุงเทพฯ',
        contact_name: 'พี่แดง',
        contact_title: 'ประธาน',
        contact_phone: '0891111111',
        contact_email: 'org@example.com',
        org_lat: 13.7,
        org_lng: 100.5,
        beneficiary_count: 40,
        recipient_groups: ['elderly', 'community'],
        purpose_th: 'แจกผู้สูงอายุในชุมชน',
        distribution_mode: 'redistribute',
        redistribute_place: 'ศาลาหมู่บ้าน',
        redistribute_frequency: 'สัปดาห์ละครั้ง',
        documents: [
          {
            filename: 'cert.pdf',
            mime: 'application/pdf',
            base64: Buffer.from('%PDF-1.4').toString('base64'),
            doc_category: 'registration_cert',
          },
          {
            filename: 'site1.jpg',
            mime: 'image/jpeg',
            base64: tinyPng,
            doc_category: 'site_photo',
          },
        ],
      });
    expect(apply.status).toBe(201);
  }

  it('rejects non-admin org doc download with 403', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    await applyOrg(buyer.token);
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

  it('blocks pending org, volunteer on verified_org_only, and suspended donors with 403', async () => {
    const pending = await registerUser(app, { role: 'buyer', buyer_type: 'shop', name: 'รออนุมัติ' });
    await applyOrg(pending.token);
    const orgOnly = await openDonationLot({ audience: 'verified_org_only', weightKg: 5 });
    const pendingBlocked = await request(app)
      .post('/api/orders')
      .set(bearer(pending.token))
      .send({
        lot_id: orgOnly,
        donation: true,
        quantity_kg: 5,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(pendingBlocked.status).toBe(403);
    expect(pendingBlocked.body.error.message).toContain('อนุมัติ');

    const volunteer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    await request(app).post('/api/donors/volunteer').set(bearer(volunteer.token)).send({});
    const volBlocked = await request(app)
      .post('/api/orders')
      .set(bearer(volunteer.token))
      .send({
        lot_id: orgOnly,
        donation: true,
        quantity_kg: 5,
        distribution_place: 'ตลาดชุมชน',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(volBlocked.status).toBe(403);

    await pool.query(`UPDATE buyer_profiles SET donation_suspended = 1 WHERE user_id = ?`, [volunteer.user.id]);
    const openLot = await openDonationLot({ audience: 'all_donors', weightKg: 1 });
    const suspended = await request(app)
      .post('/api/orders')
      .set(bearer(volunteer.token))
      .send({
        lot_id: openLot,
        donation: true,
        quantity_kg: 1,
        distribution_place: 'ตลาดชุมชน',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.message).toContain('ระงับ');
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
        quantity_kg: 5,
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
        quantity_kg: 5,
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
        quantity_kg: 8,
        distribution_place: 'ตลาดชุมชน',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(overCap.status).toBe(403);
    expect(overCap.body.error.message).toContain('เพดาน');
  });

  it('needs_more_info then resubmit returns to pending; reject without reason is 400', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    await applyOrg(buyer.token);
    const admin = await loginStaff(app, 'coordinator', 'แอดมินตรวจเอกสาร');

    const noReason = await request(app)
      .post(`/api/donors/admin/org-applications/${buyer.user.id}/reject`)
      .set(bearer(admin.token))
      .send({});
    expect(noReason.status).toBe(400);

    const askMore = await request(app)
      .post(`/api/donors/admin/org-applications/${buyer.user.id}/needs-more-info`)
      .set(bearer(admin.token))
      .send({ reason: 'เอกสารไม่ชัด', requested_fields: ['documents', 'org_name'] });
    expect(askMore.status).toBe(200);
    expect(askMore.body.user.org_status).toBe('needs_more_info');
    expect(askMore.body.user.org_reject_reason).toBe('เอกสารไม่ชัด');
    expect(askMore.body.user.requested_fields).toEqual(expect.arrayContaining(['documents', 'org_name']));

    const addDoc = await request(app)
      .post('/api/donors/org-applications/documents')
      .set(bearer(buyer.token))
      .send({
        documents: [
          {
            filename: 'cert2.pdf',
            mime: 'application/pdf',
            base64: Buffer.from('%PDF-1.5').toString('base64'),
            doc_category: 'registration_cert',
          },
        ],
      });
    expect(addDoc.status).toBe(201);

    const resubmit = await request(app)
      .post('/api/donors/org-applications/resubmit')
      .set(bearer(buyer.token))
      .send({});
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.user.org_status).toBe('pending');

    const listed = await request(app).get('/api/donors/admin/org-applications').set(bearer(admin.token));
    const entry = listed.body.applications.find((a: { user_id: number }) => a.user_id === buyer.user.id);
    expect(entry).toBeDefined();
    expect(entry.review_logs.length).toBeGreaterThanOrEqual(1);
    expect(entry.review_logs.some((l: { action: string }) => l.action === 'needs_more_info')).toBe(true);
    expect(entry.documents_by_category.registration_cert.length).toBeGreaterThanOrEqual(1);
  });

  it('promotes volunteer after 5 matching proofs and suspends after 3 fails', async () => {
    jest.spyOn(vision, 'assessRipenessFromPhoto').mockResolvedValue({
      available: true,
      subject_match: true,
      ripeness: 2,
      confidence: 0.9,
      defects: [],
      defects_en: [],
      note_th: 'ok',
      note_en: 'ok',
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
          quantity_kg: 1,
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
          quantity_kg: 1,
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
        quantity_kg: 1,
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

describe('donors 6.1d formal apply', () => {
  const app = testApp();
  const tinyPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('GET /terms returns version and title', async () => {
    const res = await request(app).get('/api/donors/terms');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(DONOR_TERMS_VERSION);
    expect(res.body.title).toBeTruthy();
  });

  it('draft blocks donation and charity register starts as draft', async () => {
    const charity = await registerUser(app, { role: 'buyer', buyer_type: 'charity' });
    expect(charity.user.org_status).toBe('draft');

    const farmer = await registerUser(app, { role: 'farmer' });
    const cropId = await insertCrop();
    const plotId = await insertPlot(farmer.user.id, 13.7, 100.5);
    const lotId = await insertLot({
      plotId,
      cropId,
      allowDonation: true,
      donationAudience: 'all_donors',
      weightKg: 1,
      expiresAt: new Date(Date.now() + 86400000 * 3),
    });
    const blocked = await request(app)
      .post('/api/orders')
      .set(bearer(charity.token))
      .send({
        lot_id: lotId,
        donation: true,
        quantity_kg: 1,
        distribution_place: 'จุดแจก',
        distribution_at: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toContain('กรอกคำขอ');

    const draft = await request(app)
      .post('/api/donors/org-applications/draft')
      .set(bearer(charity.token))
      .send({ application_kind: 'individual', draft_step: 1, contact_name: 'สมชาย' });
    expect(draft.status).toBe(200);
    expect(draft.body.user.org_status).toBe('draft');
    expect(draft.body.user.application_kind).toBe('individual');
    expect(draft.body.user.draft_step).toBe(1);
  });

  it('requires terms on submit and returns field errors for org apply', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const noTerms = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(buyer.token))
      .send({
        application_kind: 'organization',
        terms_version: 'old',
        terms_accepted: true,
        org_name: 'มูลนิธิ',
        org_type: 'foundation',
        registered: true,
        registered_address: 'กทม',
        contact_name: 'เอ',
        contact_title: 'ผอ',
        contact_phone: '0891111111',
        org_lat: 13.7,
        org_lng: 100.5,
        beneficiary_count: 10,
        recipient_groups: ['community'],
        distribution_mode: 'self_use',
        documents: [],
      });
    expect(noTerms.status).toBe(400);
    expect(noTerms.body.error.fields.terms_version).toBeTruthy();

    const missingDocs = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(buyer.token))
      .send({
        application_kind: 'organization',
        terms_version: DONOR_TERMS_VERSION,
        terms_accepted: true,
        org_name: 'มูลนิธิ',
        org_type: 'foundation',
        registered: true,
        registered_address: 'กทม',
        contact_name: 'เอ',
        contact_title: 'ผอ',
        contact_phone: '0891111111',
        org_lat: 13.7,
        org_lng: 100.5,
        beneficiary_count: 10,
        recipient_groups: ['community'],
        distribution_mode: 'self_use',
        documents: [
          {
            filename: 'only-cert.pdf',
            mime: 'application/pdf',
            base64: Buffer.from('%PDF').toString('base64'),
            doc_category: 'registration_cert',
          },
        ],
      });
    expect(missingDocs.status).toBe(400);
    expect(missingDocs.body.error.fields.documents).toContain('รูปสถานที่');
  });

  it('individual formal submit activates volunteer immediately', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const submit = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(buyer.token))
      .send({
        application_kind: 'individual',
        terms_version: DONOR_TERMS_VERSION,
        terms_accepted: true,
        contact_name: 'สมหญิง ใจดี',
        contact_phone: '0892222222',
        org_lat: 13.75,
        org_lng: 100.55,
        recipient_groups: ['elderly', 'temple'],
        purpose_th: 'แจกวัดใกล้บ้าน',
      });
    expect(submit.status).toBe(201);
    expect(submit.body.user.donor_tier).toBe('volunteer');
    expect(submit.body.user.org_status).toBe('approved');
    expect(submit.body.user.application_kind).toBe('individual');
    expect(submit.body.user.donor_terms_version).toBe(DONOR_TERMS_VERSION);
  });

  it('admin checklist_saved is logged', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const apply = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(buyer.token))
      .send({
        application_kind: 'organization',
        terms_version: DONOR_TERMS_VERSION,
        terms_accepted: true,
        org_name: 'วิสาหกิจชุมชนทดสอบ',
        org_type: 'community_enterprise',
        registered: false,
        registered_address: 'เชียงใหม่',
        contact_name: 'พี่เขียว',
        contact_title: 'ประธาน',
        contact_phone: '0893333333',
        org_lat: 18.7,
        org_lng: 98.9,
        beneficiary_count: 20,
        recipient_groups: ['community'],
        distribution_mode: 'self_use',
        documents: [
          {
            filename: 'comm.pdf',
            mime: 'application/pdf',
            base64: Buffer.from('%PDF-1.4').toString('base64'),
            doc_category: 'community_cert',
          },
          {
            filename: 'site.jpg',
            mime: 'image/jpeg',
            base64: tinyPng,
            doc_category: 'site_photo',
          },
        ],
      });
    expect(apply.status).toBe(201);

    const admin = await loginStaff(app, 'coordinator', 'เช็คลิสต์');
    const saved = await request(app)
      .post(`/api/donors/admin/org-applications/${buyer.user.id}/checklist`)
      .set(bearer(admin.token))
      .send({
        checklist: {
          name_matches_docs: true,
          location_matches_photos: false,
          docs_not_expired: true,
        },
      });
    expect(saved.status).toBe(200);
    expect(saved.body.checklist.name_matches_docs).toBe(true);
    expect(saved.body.review_logs.some((l: { action: string }) => l.action === 'checklist_saved')).toBe(true);
  });

  it('withdraw then re-apply works; duplicate submit returns 409 with existing_id', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const orgPayload = {
      application_kind: 'organization' as const,
      terms_version: DONOR_TERMS_VERSION,
      terms_accepted: true as const,
      org_name: 'มูลนิธิทดสอบถอน',
      org_type: 'foundation' as const,
      registered: true,
      registered_address: 'กทม',
      contact_name: 'เอ',
      contact_title: 'ผอ',
      contact_phone: '0894444444',
      org_lat: 13.7,
      org_lng: 100.5,
      beneficiary_count: 12,
      recipient_groups: ['community' as const],
      distribution_mode: 'self_use' as const,
      documents: [
        {
          filename: 'cert.pdf',
          mime: 'application/pdf' as const,
          base64: Buffer.from('%PDF').toString('base64'),
          doc_category: 'registration_cert' as const,
        },
        {
          filename: 'site.jpg',
          mime: 'image/jpeg' as const,
          base64: tinyPng,
          doc_category: 'site_photo' as const,
        },
      ],
    };
    const first = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(buyer.token))
      .send(orgPayload);
    expect(first.status).toBe(201);
    expect(first.body.user.org_status).toBe('pending');

    const dup = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(buyer.token))
      .send(orgPayload);
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain('มีคำขอที่ยังไม่ปิด');
    expect(dup.body.error.details.existing_id).toBe(buyer.user.id);

    const withdrawn = await request(app)
      .post('/api/donors/org-applications/withdraw')
      .set(bearer(buyer.token))
      .send({});
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.user.org_status).toBe('none');

    const mine = await request(app)
      .get('/api/donors/org-applications/mine')
      .set(bearer(buyer.token));
    expect(mine.status).toBe(200);
    expect(mine.body.review_logs.some((l: { action: string }) => l.action === 'withdrawn')).toBe(true);

    const again = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(buyer.token))
      .send({
        ...orgPayload,
        org_name: 'มูลนิธิรอบสอง',
        contact_phone: '0895555555',
      });
    expect(again.status).toBe(201);
    expect(again.body.user.org_status).toBe('pending');
    expect(again.body.user.org_name).toBe('มูลนิธิรอบสอง');
  });

  it('switches organization open application to individual and activates volunteer on submit', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'shop' });
    const draft = await request(app)
      .post('/api/donors/org-applications/draft')
      .set(bearer(buyer.token))
      .send({
        application_kind: 'organization',
        draft_step: 1,
        org_name: 'องค์กรจะเปลี่ยน',
        org_type: 'association',
      });
    expect(draft.status).toBe(200);
    expect(draft.body.user.application_kind).toBe('organization');

    const switched = await request(app)
      .post('/api/donors/org-applications/switch-kind')
      .set(bearer(buyer.token))
      .send({ application_kind: 'individual' });
    expect(switched.status).toBe(200);
    expect(switched.body.user.application_kind).toBe('individual');
    expect(switched.body.user.org_status).toBe('draft');
    expect(switched.body.user.org_name).toBeNull();

    const logs = await request(app)
      .get('/api/donors/org-applications/mine')
      .set(bearer(buyer.token));
    expect(logs.body.review_logs.some((l: { action: string }) => l.action === 'withdrawn')).toBe(true);

    const submit = await request(app)
      .post('/api/donors/org-applications')
      .set(bearer(buyer.token))
      .send({
        application_kind: 'individual',
        terms_version: DONOR_TERMS_VERSION,
        terms_accepted: true,
        contact_name: 'สมชาย เปลี่ยนแล้ว',
        contact_phone: '0896666666',
        org_lat: 13.8,
        org_lng: 100.6,
        recipient_groups: ['children'],
        purpose_th: 'ช่วยเด็กในชุมชน',
      });
    expect(submit.status).toBe(201);
    expect(submit.body.user.donor_tier).toBe('volunteer');
    expect(submit.body.user.org_status).toBe('approved');
    expect(submit.body.user.application_kind).toBe('individual');
  });
});
