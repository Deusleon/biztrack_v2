// FILE PATH: backend/src/migrations/20261108000000-allow-cancelled-cart-status.js
/**
 * Cancelling a pending order always failed: the code sets cart.status = 'Cancelled' but the database CHECK
 * (cart_status_check, script 011) only allowed OnProcess / Pending / Saved / Sold / OrderEdit.
 * This widens the check by ONE value. No row is changed, so no data can be lost.
 * down() puts any 'Cancelled' rows back to 'Saved' (so the old, narrower check can be restored).
 */
export async function up(queryInterface, Sequelize, transaction) {
  const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
  await run('ALTER TABLE cart DROP CONSTRAINT IF EXISTS cart_status_check');
  await run(`ALTER TABLE cart ADD CONSTRAINT cart_status_check CHECK (status IN ('OnProcess', 'Pending', 'Saved', 'Sold', 'OrderEdit', 'Cancelled'))`);
}

export async function down(queryInterface, Sequelize, transaction) {
  const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
  await run(`UPDATE cart SET status = 'Saved' WHERE status = 'Cancelled'`);
  await run('ALTER TABLE cart DROP CONSTRAINT IF EXISTS cart_status_check');
  await run(`ALTER TABLE cart ADD CONSTRAINT cart_status_check CHECK (status IN ('OnProcess', 'Pending', 'Saved', 'Sold', 'OrderEdit'))`);
}
