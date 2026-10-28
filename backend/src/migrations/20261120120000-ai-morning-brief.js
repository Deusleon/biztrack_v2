// Stores each person's choice for the morning brief: bell, email, or SMS.
// The brief itself is built from verified store figures when they open the Dashboard
// and, when a choice is on, again each morning. down() removes only this table.
export async function up(queryInterface, Sequelize, transaction) {
  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS ai_user_settings (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      morning_brief JSONB NOT NULL DEFAULT '{"bell": false, "email": false, "sms": false}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, store_id)
    )
  `, { transaction });
}

export async function down(queryInterface, Sequelize, transaction) {
  await queryInterface.sequelize.query('DROP TABLE IF EXISTS ai_user_settings', { transaction });
}
