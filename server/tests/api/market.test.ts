import request from 'supertest';
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
});
