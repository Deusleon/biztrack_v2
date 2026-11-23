// Stock transfers get sequential per-store numbers (TR-00001, TR-00002 ...) like the other
// documents. Older transfers keep the reference they already have. down() removes only the column.
export async function up(queryInterface, Sequelize, transaction) {
  await queryInterface.sequelize.query(
    'ALTER TABLE store_invoice_counters ADD COLUMN IF NOT EXISTS last_transfer_number INTEGER NOT NULL DEFAULT 0',
    { transaction },
  );
}

export async function down(queryInterface, Sequelize, transaction) {
  await queryInterface.sequelize.query(
    'ALTER TABLE store_invoice_counters DROP COLUMN IF EXISTS last_transfer_number',
    { transaction },
  );
}
