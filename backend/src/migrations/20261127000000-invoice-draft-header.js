// An unfinished invoice is stored on the cart. These two fields keep the sales date
// and the amount already typed, in the same text the form was showing. down() removes only the columns.
export async function up(queryInterface, Sequelize, transaction) {
  await queryInterface.sequelize.query(
    'ALTER TABLE cart ADD COLUMN IF NOT EXISTS draft_sales_date TEXT',
    { transaction },
  );
  await queryInterface.sequelize.query(
    'ALTER TABLE cart ADD COLUMN IF NOT EXISTS draft_amount_paid TEXT',
    { transaction },
  );
}

export async function down(queryInterface, Sequelize, transaction) {
  await queryInterface.sequelize.query(
    'ALTER TABLE cart DROP COLUMN IF EXISTS draft_amount_paid',
    { transaction },
  );
  await queryInterface.sequelize.query(
    'ALTER TABLE cart DROP COLUMN IF EXISTS draft_sales_date',
    { transaction },
  );
}
