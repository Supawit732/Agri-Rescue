import request from 'supertest';
import { pool } from '../../src/db/pool';
import { insertCrop, insertLot, insertPlot, registerUser, testApp, bearer } from '../helpers';

describe('shops & follows', () => {
  const app = testApp();

  beforeEach(async () => {
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM shop_follows');
    await pool.query('DELETE FROM shops');
  });

  it('creates shop on enable sell and returns public profile without private fields', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'ลุงร้าน' });
    const ensured = await request(app)
      .post('/api/shops/mine/ensure')
      .set(bearer(farmer.token));
    expect(ensured.status).toBe(200);
    expect(ensured.body.shop.name).toBe('ลุงร้าน');

    await request(app)
      .patch('/api/shops/mine')
      .set(bearer(farmer.token))
      .send({ name: 'สวนทดสอบPRB', description: 'มะม่วงอร่อย' });

    const pub = await request(app).get(`/api/shops/${farmer.user.id}`);
    expect(pub.status).toBe(200);
    expect(pub.body.shop.name).toBe('สวนทดสอบPRB');
    expect(pub.body.shop.description).toBe('มะม่วงอร่อย');
    expect(pub.body.shop.phone).toBeUndefined();
    expect(pub.body.shop.lat).toBeUndefined();
    expect(pub.body.shop.lng).toBeUndefined();
    expect(pub.body.shop.stats).toEqual({
      delivered_orders: expect.any(Number),
      followers: expect.any(Number),
      kg_saved: expect.any(Number),
    });
  });

  it('follows once; duplicate is idempotent; guest cannot follow', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'ร้านเป้า' });
    const buyer = await registerUser(app, { role: 'buyer' });
    await request(app)
      .post(`/api/shops/${farmer.user.id}/follow`)
      .set(bearer(farmer.token))
      .send({});

    const first = await request(app)
      .post(`/api/shops/${farmer.user.id}/follow`)
      .set(bearer(buyer.token));
    expect(first.status).toBe(201);
    expect(first.body.following).toBe(true);

    const second = await request(app)
      .post(`/api/shops/${farmer.user.id}/follow`)
      .set(bearer(buyer.token));
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('exists');

    const guest = await request(app).post(`/api/shops/${farmer.user.id}/follow`).send({});
    expect(guest.status).toBe(401);

    const followed = await request(app)
      .get('/api/shops/mine/followed')
      .set(bearer(buyer.token));
    expect(followed.status).toBe(200);
    expect(followed.body.shops).toHaveLength(1);

    const unfollow = await request(app)
      .delete(`/api/shops/${farmer.user.id}/follow`)
      .set(bearer(buyer.token));
    expect(unfollow.status).toBe(200);
    expect(unfollow.body.following).toBe(false);
  });

  it('notifies followers when farmer creates a lot', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'ร้านแจ้งเตือน' });
    const buyer = await registerUser(app, { role: 'buyer' });
    await request(app)
      .post(`/api/shops/${farmer.user.id}/follow`)
      .set(bearer(buyer.token));

    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61, 'แปลงแจ้ง');
    const cropId = await insertCrop('มะม่วงแจ้ง', 5, 40, 'Mango notify');
    const lot = await request(app)
      .post('/api/lots')
      .set(bearer(farmer.token))
      .send({
        plot_id: plotId,
        crop_id: cropId,
        weight_kg: 20,
        grade: 'normal',
        ripeness: 2,
        sale_mode: 'sell',
        start_price_per_kg: 30,
        floor_price_per_kg: 12,
      });
    expect(lot.status).toBe(201);

    const list = await request(app)
      .get('/api/notifications')
      .set(bearer(buyer.token));
    expect(list.status).toBe(200);
    expect(list.body.unread_count).toBeGreaterThan(0);
    expect(list.body.notifications[0].type).toBe('shop_new_lot');
    expect(list.body.notifications[0].title_key).toBe('notif.shop_new_lot');
  });

  it('users can only read their own notifications', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'มีแจ้งเตือน' });
    const buyer = await registerUser(app, { role: 'buyer' });
    await request(app)
      .post(`/api/shops/${farmer.user.id}/follow`)
      .set(bearer(buyer.token));
    const plotId = await insertPlot(farmer.user.id, 13.66, 100.61, 'แปลงก');
    const cropId = await insertCrop('ผักก', 2, 20);
    await request(app)
      .post('/api/lots')
      .set(bearer(farmer.token))
      .send({
        plot_id: plotId,
        crop_id: cropId,
        weight_kg: 10,
        grade: 'normal',
        ripeness: 1,
        sale_mode: 'sell',
        start_price_per_kg: 15,
        floor_price_per_kg: 6,
      });

    const farmerList = await request(app)
      .get('/api/notifications')
      .set(bearer(farmer.token));
    expect(farmerList.status).toBe(200);
    expect(farmerList.body.unread_count).toBe(0);

    const buyerList = await request(app)
      .get('/api/notifications')
      .set(bearer(buyer.token));
    expect(buyerList.body.notifications.every((n: { user_id?: number }) => n.user_id === undefined)).toBe(true);
    expect(buyerList.body.unread_count).toBe(1);

    const markOwn = await request(app)
      .post(`/api/notifications/${buyerList.body.notifications[0].id}/read`)
      .set(bearer(buyer.token));
    expect(markOwn.status).toBe(200);

    // farmer cannot mark buyer's notification
    const markOther = await request(app)
      .post(`/api/notifications/${buyerList.body.notifications[0].id}/read`)
      .set(bearer(farmer.token));
    expect(markOther.body.ok).toBe(false);
  });

  it('public market search matches shop name', async () => {
    const farmer = await registerUser(app, { role: 'farmer', name: 'เจ้าของสวนX' });
    await request(app)
      .patch('/api/shops/mine')
      .set(bearer(farmer.token))
      .send({ name: 'สวนX สุดพิเศษ' });
    const plotId = await insertPlot(farmer.user.id, 13.662, 100.611, 'แปลงx');
    const cropId = await insertCrop('กล้วยX', 4, 25, 'Banana X');
    await insertLot({
      plotId,
      cropId,
      expiresAt: new Date(Date.now() + 30 * 60 * 60 * 1000),
    });

    const byShop = await request(app).get('/api/public/market').query({ q: 'สวนX' });
    expect(byShop.status).toBe(200);
    expect(byShop.body.lots.length).toBeGreaterThan(0);
    expect(byShop.body.lots[0].shop_name).toBe('สวนX สุดพิเศษ');
    expect(byShop.body.lots[0].farmer_id).toBe(farmer.user.id);
  });
});
