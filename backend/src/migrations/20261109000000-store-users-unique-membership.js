// FILE PATH: backend/src/migrations/20261109000000-store-users-unique-membership.js
/**
 * A person could be added to the same store several times (store_users had no uniqueness rule), which doubled every one of
 * their permissions and listed them repeatedly. This adds the rule — but ONLY if the table has no duplicates yet, so no row is
 * ever deleted or changed by an upgrade. If duplicates exist it says so and leaves the table alone; remove the extra rows
 * yourself (keep one per store + user) and run `npm run db:migrate` again.
 */
export async function up(queryInterface, Sequelize, transaction) {
  const run = (sql, opts = {}) => queryInterface.sequelize.query(sql, { transaction, ...opts });
  const [[{ n }]] = await run(`SELECT COUNT(*)::int AS n FROM (SELECT store_id, user_id FROM store_users GROUP BY store_id, user_id HAVING COUNT(*) > 1) d`);
  if (n > 0) {
    console.warn(`  ⚠ store_users has ${n} person/store pair(s) listed more than once — the uniqueness rule was NOT added. Keep one row per pair, then run the migration again.`);
    return;
  }
  await run('CREATE UNIQUE INDEX IF NOT EXISTS uq_store_users_store_user ON store_users (store_id, user_id)');
}

export async function down(queryInterface, Sequelize, transaction) {
  await queryInterface.sequelize.query('DROP INDEX IF EXISTS uq_store_users_unique_membership', { transaction });
  await queryInterface.sequelize.query('DROP INDEX IF EXISTS uq_store_users_store_user', { transaction });
}
