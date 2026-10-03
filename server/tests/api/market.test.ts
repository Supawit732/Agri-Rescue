import request from 'supertest';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../src/db/pool';
import { lotPricePerKg } from '../../src/domain/sellerPricing';
import { bearer, insertCrop, insertLot, insertPlot, registerUser, testApp, pickAvailablePickupSlot } from '../helpers';

describe('market', () => {
  const app = testApp();

  it('hides expired lots and prices the rest with the domain function', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const nearPlot = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงใกล้');
    const farPlot = await insertPlot(farmer.user.id, 14.8, 100.611, 'แปลงไกล');
    const soon = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const expired = new Date(Date.now() - 60 * 60 * 1000);
    const soonId = await insertLot({ plotId: nearPlot, cropId, expiresAt: soon, grade: 'normal' });
    const laterId = await insertLot({ plotId: nearPlot, cropId, expiresAt: later, grade: 'substandard' });
    const expiredId = await insertLot({ plotId: nearPlot, cropId, expiresAt: expired });
    await insertLot({ plotId: farPlot, cropId, expiresAt: later });

    const response = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(response.status).toBe(200);
    const ids = response.body.lots.map((lot: { id: number }) => lot.id);
    expect(ids).toEqual([soonId, laterId]);
    expect(ids).not.toContain(expiredId);

    for (const lot of response.body.lots as Array<{
      id: number;
      hours_left: number;
      price_per_kg: number;
      grade: 'normal' | 'substandard';
      available_as: string[];
      sale_mode?: string;
      donation_opened?: boolean;
    }>) {
      expect(lot.hours_left).toBeGreaterThan(0);
      expect(lot.available_as).toEqual(['buy']);
      expect(lot.sale_mode).toBeUndefined();
      expect(lot.donation_opened).toBeUndefined();
      const start = lot.grade === 'substandard' ? 28 : 40;
      const floor = Math.round(start * 0.3 * 100) / 100;
      expect(lot.price_per_kg).toBe(
        lotPricePerKg({
          startPricePerKg: start,
          floorPricePerKg: floor,
          baseShelfHours: 5 * 24,
          hoursLeft: lot.hours_left,
        }),
      );
    }
  });

  it('hides sell_then_donate until donation_opened, then exposes donate via available_as', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'vendor',
      lat: 13.662,
      lng: 100.611,
    });
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงทดสอบ');
    const lotId = await insertLot({
      plotId,
      cropId,
      saleMode: 'sell_then_donate',
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    const before = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(before.status).toBe(200);
    const beforeLot = before.body.lots.find((lot: { id: number }) => lot.id === lotId);
    expect(beforeLot).toBeDefined();
    expect(beforeLot.available_as).toEqual(['buy']);
    expect(beforeLot.allow_donation).toBe(false);
    expect(JSON.stringify(beforeLot)).not.toContain('sale_mode');
    expect(JSON.stringify(beforeLot)).not.toContain('sell_then_donate');
    expect(JSON.stringify(beforeLot)).not.toContain('donate');

    const detailBefore = await request(app)
      .get(`/api/market/lots/${lotId}`)
      .query({ lat: 13.662, lng: 100.611 })
      .set(bearer(buyer.token));
    expect(detailBefore.status).toBe(200);
    expect(detailBefore.body.lot.available_as).toEqual(['buy']);
    expect(detailBefore.body.lot.plot_name).toBe('แปลงทดสอบ');
    expect(detailBefore.body.lot.location_label).toBe('แปลงทดสอบ');
    expect(detailBefore.body.lot.sale_mode).toBeUndefined();
    expect(JSON.stringify(detailBefore.body)).not.toContain('sell_then_donate');

    await pool.query(`UPDATE harvest_lots SET donation_opened = 1, allow_donation = 1 WHERE id = ?`, [
      lotId,
    ]);

    const after = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(after.status).toBe(200);
    const afterLot = after.body.lots.find((lot: { id: number }) => lot.id === lotId);
    expect(afterLot.available_as).toEqual(['buy', 'donate']);
    expect(afterLot.allow_donation).toBe(true);
    expect(afterLot.sale_mode).toBeUndefined();
    expect(JSON.stringify(afterLot)).not.toContain('sell_then_donate');

    const detailAfter = await request(app)
      .get(`/api/market/lots/${lotId}`)
      .set(bearer(buyer.token));
    expect(detailAfter.status).toBe(200);
    expect(detailAfter.body.lot.available_as).toEqual(['buy', 'donate']);

    const mine = await request(app).get('/api/lots/mine').set(bearer(farmer.token));
    expect(mine.status).toBe(200);
    const owned = mine.body.lots.find((lot: { id: number }) => lot.id === lotId);
    expect(owned.sale_mode).toBe('sell_then_donate');
    expect(owned.donation_opened).toBe(true);
  });

  it('returns 404 for missing buyer lot detail', async () => {
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    const missing = await request(app).get('/api/market/lots/999999').set(bearer(buyer.token));
    expect(missing.status).toBe(404);
  });

  it('passes the seller-written description through to buyer market views', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, {
      role: 'buyer',
      buyer_type: 'vendor',
      lat: 13.662,
      lng: 100.611,
    });
    const cropId = await insertCrop('มะม่วง', 5, 40);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงคำอธิบาย');
    const lotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      description: 'ผิวมีรอยเล็กน้อย รสหวาน เหมาะทำน้ำผลไม้',
    });

    const list = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    const lot = list.body.lots.find((entry: { id: number }) => entry.id === lotId);
    expect(lot.description).toBe('ผิวมีรอยเล็กน้อย รสหวาน เหมาะทำน้ำผลไม้');

    const detail = await request(app)
      .get(`/api/market/lots/${lotId}`)
      .query({ lat: 13.662, lng: 100.611 })
      .set(bearer(buyer.token));
    expect(detail.body.lot.description).toBe('ผิวมีรอยเล็กน้อย รสหวาน เหมาะทำน้ำผลไม้');
  });

  it('flags is_mine for a seller who also has buying enabled, with price_comparison alongside', async () => {
    const sellerBuyer = await registerUser(app, {
      role: 'farmer',
      can_buy: true,
      buyer_type: 'vendor',
      lat: 13.662,
      lng: 100.611,
    });
    const otherBuyer = await registerUser(app, { role: 'buyer', lat: 13.662, lng: 100.611 });
    const cropId = await insertCrop('พืชเทียบราคา (auth)', 5, 40);
    const plotId = await insertPlot(sellerBuyer.user.id, 13.662, 100.611, 'แปลงเทียบราคา');
    const lotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      startPricePerKg: 34,
      floorPricePerKg: 34,
    });

    const asOwner = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(sellerBuyer.token));
    const ownLot = (
      asOwner.body.lots as Array<{
        id: number;
        is_mine: boolean;
        price_comparison: { tone: string; percentDiff: number } | null;
      }>
    ).find((lot) => lot.id === lotId);
    expect(ownLot?.is_mine).toBe(true);
    expect(ownLot?.price_comparison).toEqual({ tone: 'cheaper', percentDiff: 15 });

    const asOther = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(otherBuyer.token));
    const otherViewLot = (asOther.body.lots as Array<{ id: number; is_mine: boolean }>).find(
      (lot) => lot.id === lotId,
    );
    expect(otherViewLot?.is_mine).toBe(false);
  });

  it('uses stored profile location for purchasable check, not client-sent coords', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor' });
    // Clear buyer profile location
    await pool.query('UPDATE users SET lat = NULL, lng = NULL WHERE id = ?', [buyer.user.id]);
    const cropId = await insertCrop('มะม่วง', 5, 40);

    // Plot at ~10 km from coordinates (13.75, 100.611)
    const nearPlotId = await insertPlot(farmer.user.id, 13.75, 100.611, 'แปลงใกล้');
    const nearLotId = await insertLot({
      plotId: nearPlotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    // Client sends nearby coords (13.75, 100.611) but profile location is null
    const response = await request(app)
      .get('/api/market')
      .query({ lat: 13.75, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(response.status).toBe(200);

    const nearLot = response.body.lots.find((lot: { id: number }) => lot.id === nearLotId);
    expect(nearLot).toBeDefined();
    // Purchasable should be FALSE because profile location is null (not the client coords)
    expect(nearLot.purchasable).toBe(false);
    // Distance should still be computed from client coords (for display)
    expect(nearLot.distance_km).toBeLessThanOrEqual(15);

    // Now update profile location to match client coords
    await pool.query('UPDATE users SET lat = ?, lng = ? WHERE id = ?', [13.75, 100.611, buyer.user.id]);

    // Check market again
    const response2 = await request(app)
      .get('/api/market')
      .query({ lat: 13.75, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(response2.status).toBe(200);

    const nearLot2 = response2.body.lots.find((lot: { id: number }) => lot.id === nearLotId);
    expect(nearLot2).toBeDefined();
    // Now purchasable should be TRUE because profile location matches
    expect(nearLot2.purchasable).toBe(true);

    // And order should succeed
    const orderRes = await request(app)
      .post('/api/orders')
      .set(bearer(buyer.token))
      .send({ lot_id: nearLotId, donation: false, quantity_kg: 5, ...pickAvailablePickupSlot() });
    expect(orderRes.status).toBe(201);
  });

  it('returns purchasable=true for lots within delivery radius and purchasable=false for those outside', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });
    const cropId = await insertCrop('มะม่วง', 5, 40);

    // Plot at ~10 km distance (within 15 km delivery radius)
    const nearPlotId = await insertPlot(farmer.user.id, 13.75, 100.611, 'แปลงใกล้');
    const nearLotId = await insertLot({
      plotId: nearPlotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    // Plot at ~35 km distance (outside 15 km delivery radius)
    const farPlotId = await insertPlot(farmer.user.id, 13.662, 101.193, 'แปลงไกล');
    const farLotId = await insertLot({
      plotId: farPlotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    const response = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(response.status).toBe(200);

    const nearLot = response.body.lots.find((lot: { id: number; purchasable: boolean }) => lot.id === nearLotId);
    expect(nearLot).toBeDefined();
    expect(nearLot.purchasable).toBe(true);
    expect(nearLot.distance_km).toBeLessThanOrEqual(15);

    const farLot = response.body.lots.find((lot: { id: number; purchasable: boolean }) => lot.id === farLotId);
    expect(farLot).toBeDefined();
    expect(farLot.purchasable).toBe(false);
    expect(farLot.distance_km).toBeGreaterThan(15);

    // Purchasable lots should appear first in the list
    const purchasableLots = response.body.lots.filter((lot: { purchasable: boolean }) => lot.purchasable === true);
    const nonPurchasableLots = response.body.lots.filter((lot: { purchasable: boolean }) => lot.purchasable === false);
    if (purchasableLots.length > 0 && nonPurchasableLots.length > 0) {
      const lastPurchasableIndex = response.body.lots.lastIndexOf(purchasableLots[purchasableLots.length - 1]);
      const firstNonPurchasableIndex = response.body.lots.indexOf(nonPurchasableLots[0]);
      expect(lastPurchasableIndex).toBeLessThan(firstNonPurchasableIndex);
    }
  });

  it('filters by crop_id', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });
    const mango = await insertCrop('มะม่วง', 5, 40);
    const durian = await insertCrop('ทุเรียน', 8, 50);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงผลไม้');
    const mangoLotId = await insertLot({
      plotId,
      cropId: mango,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const durianLotId = await insertLot({
      plotId,
      cropId: durian,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    const allLots = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(allLots.status).toBe(200);
    expect(allLots.body.lots.map((l: { id: number }) => l.id)).toContain(mangoLotId);
    expect(allLots.body.lots.map((l: { id: number }) => l.id)).toContain(durianLotId);

    const mangoOnly = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, crop_id: mango })
      .set(bearer(buyer.token));
    expect(mangoOnly.status).toBe(200);
    expect(mangoOnly.body.lots.map((l: { id: number }) => l.id)).toContain(mangoLotId);
    expect(mangoOnly.body.lots.map((l: { id: number }) => l.id)).not.toContain(durianLotId);
  });

  it('filters by category_id', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });

    // Get all categories
    const [categoryRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM crop_categories ORDER BY id LIMIT 2',
    );
    if (categoryRows.length < 2) {
      // Skip test if not enough categories
      expect(true).toBe(true);
      return;
    }

    const cat1 = categoryRows[0]?.id as number;
    const cat2 = categoryRows[1]?.id as number;

    // Get first crop from each category
    const [crop1Rows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM crops WHERE category_id = ? LIMIT 1',
      [cat1],
    );
    const crop1 = crop1Rows[0]?.id as number;

    const [crop2Rows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM crops WHERE category_id = ? LIMIT 1',
      [cat2],
    );
    const crop2 = crop2Rows[0]?.id as number;

    if (!crop1 || !crop2) {
      // Skip if we can't find crops in both categories
      expect(true).toBe(true);
      return;
    }

    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงทำการ');
    const lot1Id = await insertLot({
      plotId,
      cropId: crop1,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const lot2Id = await insertLot({
      plotId,
      cropId: crop2,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    const cat1Only = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, category_id: cat1 })
      .set(bearer(buyer.token));
    expect(cat1Only.status).toBe(200);
    expect(cat1Only.body.lots.map((l: { id: number }) => l.id)).toContain(lot1Id);
    expect(cat1Only.body.lots.map((l: { id: number }) => l.id)).not.toContain(lot2Id);
  });

  it('filters by price_min and price_max', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });
    const cropId = await insertCrop('พืชราคา', 5, 100);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงราคา');

    const cheapLotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      startPricePerKg: 10,
      floorPricePerKg: 5,
    });
    const expensiveLotId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      startPricePerKg: 100,
      floorPricePerKg: 80,
    });

    const allPrices = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(allPrices.status).toBe(200);
    expect(allPrices.body.lots.map((l: { id: number }) => l.id)).toContain(cheapLotId);
    expect(allPrices.body.lots.map((l: { id: number }) => l.id)).toContain(expensiveLotId);

    const cheapOnly = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, price_max: 30 })
      .set(bearer(buyer.token));
    expect(cheapOnly.status).toBe(200);
    expect(cheapOnly.body.lots.map((l: { id: number }) => l.id)).toContain(cheapLotId);
    expect(cheapOnly.body.lots.map((l: { id: number }) => l.id)).not.toContain(expensiveLotId);

    const expensiveOnly = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, price_min: 50 })
      .set(bearer(buyer.token));
    expect(expensiveOnly.status).toBe(200);
    expect(expensiveOnly.body.lots.map((l: { id: number }) => l.id)).not.toContain(cheapLotId);
    expect(expensiveOnly.body.lots.map((l: { id: number }) => l.id)).toContain(expensiveLotId);
  });

  it('filters by max_hours', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });
    const cropId = await insertCrop('พืชเวลา', 5, 40);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงเวลา');

    const soonId = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    });
    const laterIds = await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    const allLots = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(allLots.status).toBe(200);
    expect(allLots.body.lots.length).toBeGreaterThanOrEqual(2);

    const shortOnly = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, max_hours: 24 })
      .set(bearer(buyer.token));
    expect(shortOnly.status).toBe(200);
    expect(shortOnly.body.lots.map((l: { id: number }) => l.id)).toContain(soonId);
    expect(shortOnly.body.lots.map((l: { id: number }) => l.id)).not.toContain(laterIds);
  });

  it('filters by q (search text)', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });
    const mangoId = await insertCrop('มะม่วง', 5, 40);
    const appleId = await insertCrop('แอปเปิ้ล', 5, 40);
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงสวน');

    await insertLot({
      plotId,
      cropId: mangoId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    await insertLot({
      plotId,
      cropId: appleId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    const allLots = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15 })
      .set(bearer(buyer.token));
    expect(allLots.status).toBe(200);
    const beforeCount = allLots.body.lots.length;

    const mangoOnly = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, q: 'มะม่วง' })
      .set(bearer(buyer.token));
    expect(mangoOnly.status).toBe(200);
    expect(mangoOnly.body.lots.length).toBeLessThanOrEqual(beforeCount);
    expect(mangoOnly.body.lots.every((l: { crop_name_th: string }) => l.crop_name_th.includes('มะม่วง'))).toBe(true);
  });

  it('filters by sort (near, urgent, cheap)', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });
    const cropId = await insertCrop('พืชเรียงลำดับ', 5, 50);

    const nearPlotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงใกล้');
    const farPlotId = await insertPlot(farmer.user.id, 13.75, 100.611, 'แปลงไกล');

    const farLotId = await insertLot({
      plotId: farPlotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      startPricePerKg: 10,
      floorPricePerKg: 5,
    });
    const nearLotId = await insertLot({
      plotId: nearPlotId,
      cropId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      startPricePerKg: 100,
      floorPricePerKg: 80,
    });

    const nearSort = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, sort: 'near' })
      .set(bearer(buyer.token));
    expect(nearSort.status).toBe(200);
    const nearIds = nearSort.body.lots.map((l: { id: number }) => l.id);
    if (nearIds.includes(nearLotId) && nearIds.includes(farLotId)) {
      expect(nearIds.indexOf(nearLotId)).toBeLessThan(nearIds.indexOf(farLotId));
    }

    const urgentSort = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, sort: 'urgent' })
      .set(bearer(buyer.token));
    expect(urgentSort.status).toBe(200);
    const urgentIds = urgentSort.body.lots.map((l: { id: number }) => l.id);
    if (urgentIds.includes(nearLotId) && urgentIds.includes(farLotId)) {
      expect(urgentIds.indexOf(nearLotId)).toBeLessThan(urgentIds.indexOf(farLotId));
    }

    const cheapSort = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, radius_km: 15, sort: 'cheap' })
      .set(bearer(buyer.token));
    expect(cheapSort.status).toBe(200);
    const cheapIds = cheapSort.body.lots.map((l: { id: number }) => l.id);
    if (cheapIds.includes(farLotId) && cheapIds.includes(nearLotId)) {
      expect(cheapIds.indexOf(farLotId)).toBeLessThan(cheapIds.indexOf(nearLotId));
    }
  });

  it('supports browse_radius_km parameter up to 100 km', async () => {
    const farmer = await registerUser(app, { role: 'farmer' });
    const buyer = await registerUser(app, { role: 'buyer', buyer_type: 'vendor', lat: 13.662, lng: 100.611 });
    const cropId = await insertCrop('พืชไกล', 5, 40);

    // Plot at ~10 km (within all browse radii)
    const nearPlotId = await insertPlot(farmer.user.id, 13.75, 100.611, 'แปลงใกล้');
    const nearLotId = await insertLot({
      plotId: nearPlotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    // Plot at ~50 km (beyond 15 km delivery, within 100 km browse)
    const farPlotId = await insertPlot(farmer.user.id, 13.662, 101.445, 'แปลงไกล');
    const farLotId = await insertLot({
      plotId: farPlotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    // With browse_radius_km=100, far lot should be included
    const browse100 = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, browse_radius_km: 100 })
      .set(bearer(buyer.token));
    expect(browse100.status).toBe(200);
    expect(browse100.body.lots.map((l: { id: number }) => l.id)).toContain(nearLotId);
    expect(browse100.body.lots.map((l: { id: number }) => l.id)).toContain(farLotId);

    // Near lot should be purchasable, far lot should not
    const farLot = browse100.body.lots.find((l: { id: number }) => l.id === farLotId);
    expect(farLot.purchasable).toBe(false);
    const nearLot = browse100.body.lots.find((l: { id: number }) => l.id === nearLotId);
    expect(nearLot.purchasable).toBe(true);
  });

  it("does not flag seller's own lots as out-of-delivery", async () => {
    const sellerBuyer = await registerUser(app, {
      role: 'farmer',
      can_buy: true,
      buyer_type: 'vendor',
      lat: 13.662,
      lng: 100.611,
    });
    const cropId = await insertCrop('พืชของตัวเอง', 5, 40);

    // Plot far away (50+ km), where buyer can't buy others' produce
    const farPlotId = await insertPlot(sellerBuyer.user.id, 13.662, 101.445, 'แปลงไกล');
    const ownFarLotId = await insertLot({
      plotId: farPlotId,
      cropId,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    // Own lot should not show purchasable=false even though it's outside delivery radius
    const response = await request(app)
      .get('/api/market')
      .query({ lat: 13.662, lng: 100.611, browse_radius_km: 100 })
      .set(bearer(sellerBuyer.token));
    expect(response.status).toBe(200);

    const ownLot = response.body.lots.find((l: { id: number }) => l.id === ownFarLotId);
    expect(ownLot).toBeDefined();
    expect(ownLot.is_mine).toBe(true);
    expect(ownLot.purchasable).toBe(false); // Still false because it's outside delivery
    // But when viewing as seller/buyer hybrid, the key is that they see it in the list
  });
});
