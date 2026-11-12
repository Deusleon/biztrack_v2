/**
 * Annual plans were priced at ten times the monthly fee, which is about 17% off a full year.
 * This version charges 15% off (monthly × 12 × 0.85). Only the stored annual price changes.
 * No row is deleted, and payments already taken keep the amount they were charged.
 */
export async function up(queryInterface, Sequelize, transaction) {
  await queryInterface.sequelize.query(
    `UPDATE subscription_plans
        SET annual_amount = ROUND(monthly_amount * 12 * 0.85, 2),
            updated_at = NOW()
      WHERE monthly_amount IS NOT NULL`,
    { transaction },
  );
}

export async function down(queryInterface, Sequelize, transaction) {
  await queryInterface.sequelize.query(
    `UPDATE subscription_plans
        SET annual_amount = ROUND(monthly_amount * 10, 2),
            updated_at = NOW()
      WHERE monthly_amount IS NOT NULL`,
    { transaction },
  );
}
