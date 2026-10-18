// One signed-in device per account, unless the developer allows more for that account.
export async function up(queryInterface, Sequelize, transaction) {
  const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_id TEXT`);
  await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_multiple_sessions BOOLEAN NOT NULL DEFAULT false`);
}

export async function down(queryInterface, Sequelize, transaction) {
  const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
  await run(`ALTER TABLE users DROP COLUMN IF EXISTS allow_multiple_sessions`);
  await run(`ALTER TABLE users DROP COLUMN IF EXISTS session_id`);
}
