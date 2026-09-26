/**
 * cleanup:demo — remove non-seed test accounts and their data from the dev DB.
 *
 * Protected phones are derived from seedData.ts so this script stays in sync
 * automatically. Seed and seed:demo never create test accounts: seed uses the
 * explicit farmers/buyers/staff arrays in seedData.ts; seed:demo only adds
 * harvest_lots and orders for existing seed users (no new users created).
 *
 * Idempotent: safe to run multiple times.
 */
import type { RowDataPacket } from 'mysql2';
import { pool } from '../src/db/pool';
import { buyers, farmers, staff } from '../src/db/seedData';

const PROTECTED_PHONES = new Set<string>([
  ...farmers.map((f) => f.phone),
  ...staff.map((s) => s.phone),
  ...buyers.map((b) => b.phone),
]);

async function main(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    // Find test users (phone not in protected seed list)
    const placeholders = Array.from(PROTECTED_PHONES).map(() => '?').join(',');
    const [testUsers] = await connection.query<RowDataPacket[]>(
      `SELECT id, name, phone FROM users WHERE phone NOT IN (${placeholders}) ORDER BY id`,
      Array.from(PROTECTED_PHONES),
    );

    if (testUsers.length === 0) {
      console.log('cleanup:demo — no test accounts found, nothing to do');
      return;
    }

    console.log(`cleanup:demo — found ${testUsers.length} test account(s):`);
    for (const u of testUsers) {
      console.log(`  id=${String(u.id)} phone=${String(u.phone)} name=${String(u.name)}`);
    }

    const userIds = testUsers.map((u) => Number(u.id));
    const uPlaceholders = userIds.map(() => '?').join(',');

    await connection.beginTransaction();

    // Find plots belonging to test farmers
    const [testPlots] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM plots WHERE farmer_id IN (${uPlaceholders})`,
      userIds,
    );
    const plotIds = testPlots.map((r) => Number(r.id));

    if (plotIds.length > 0) {
      const pPlaceholders = plotIds.map(() => '?').join(',');

      // Find lots from test farmers' plots
      const [testLots] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM harvest_lots WHERE plot_id IN (${pPlaceholders})`,
        plotIds,
      );
      const lotIds = testLots.map((r) => Number(r.id));

      if (lotIds.length > 0) {
        const lPlaceholders = lotIds.map(() => '?').join(',');

        // Find orders from test lots
        const [testOrders] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM orders WHERE lot_id IN (${lPlaceholders})`,
          lotIds,
        );
        const lotOrderIds = testOrders.map((r) => Number(r.id));

        if (lotOrderIds.length > 0) {
          const oPlaceholders = lotOrderIds.map(() => '?').join(',');
          await connection.query(`DELETE FROM donation_proofs WHERE order_id IN (${oPlaceholders})`, lotOrderIds);
          await connection.query(`DELETE FROM impact_logs WHERE order_id IN (${oPlaceholders})`, lotOrderIds);
          await connection.query(`DELETE FROM orders WHERE id IN (${oPlaceholders})`, lotOrderIds);
        }

        await connection.query(`DELETE FROM quality_assessments WHERE lot_id IN (${lPlaceholders})`, lotIds);
        await connection.query(`DELETE FROM lot_edit_logs WHERE lot_id IN (${lPlaceholders})`, lotIds);
        await connection.query(`DELETE FROM lot_delete_logs WHERE lot_id IN (${lPlaceholders})`, lotIds);
        await connection.query(`DELETE FROM harvest_lots WHERE id IN (${lPlaceholders})`, lotIds);
      }

      await connection.query(`DELETE FROM plots WHERE id IN (${pPlaceholders})`, plotIds);
    }

    // Find orders where the test user is the buyer (not from their plots)
    const [buyerOrders] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM orders WHERE buyer_id IN (${uPlaceholders})`,
      userIds,
    );
    const buyerOrderIds = buyerOrders.map((r) => Number(r.id));
    if (buyerOrderIds.length > 0) {
      const oPlaceholders = buyerOrderIds.map(() => '?').join(',');
      await connection.query(`DELETE FROM donation_proofs WHERE order_id IN (${oPlaceholders})`, buyerOrderIds);
      await connection.query(`DELETE FROM impact_logs WHERE order_id IN (${oPlaceholders})`, buyerOrderIds);
      await connection.query(`DELETE FROM orders WHERE id IN (${oPlaceholders})`, buyerOrderIds);
    }

    // Delete user-referenced tables
    await connection.query(`DELETE FROM org_review_logs WHERE applicant_id IN (${uPlaceholders})`, userIds);
    await connection.query(`DELETE FROM buyer_profiles WHERE user_id IN (${uPlaceholders})`, userIds);
    await connection.query(`DELETE FROM user_follows WHERE follower_id IN (${uPlaceholders}) OR followed_id IN (${uPlaceholders})`, [...userIds, ...userIds]);
    await connection.query(`DELETE FROM notifications WHERE user_id IN (${uPlaceholders})`, userIds);
    await connection.query(`DELETE FROM push_tokens WHERE user_id IN (${uPlaceholders})`, userIds);
    await connection.query(`DELETE FROM shops WHERE user_id IN (${uPlaceholders})`, userIds);
    // Support: delete messages then contacts
    const [testContacts] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM support_contacts WHERE user_id IN (${uPlaceholders})`,
      userIds,
    );
    const contactIds = testContacts.map((r) => Number(r.id));
    if (contactIds.length > 0) {
      const cPlaceholders = contactIds.map(() => '?').join(',');
      await connection.query(`DELETE FROM support_messages WHERE support_contact_id IN (${cPlaceholders})`, contactIds);
      await connection.query(`DELETE FROM support_contacts WHERE id IN (${cPlaceholders})`, contactIds);
    }

    await connection.query(`DELETE FROM users WHERE id IN (${uPlaceholders})`, userIds);

    await connection.commit();
    console.log(`cleanup:demo — deleted ${userIds.length} test account(s) and their data`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void pool.end();
  });
