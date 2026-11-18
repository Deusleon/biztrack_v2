// Adds the permission that lets an owner correct the date of a completed sale.
// New rows only. Existing sales are not changed. down() removes the permission and its assignments.
export async function up(queryInterface, Sequelize, transaction) {
  const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
  await run(`
    INSERT INTO permissions (name, description, module, submodule, display_no)
    SELECT 'correct_sale_date', 'Correct the date of a completed sale', 'Sales', 'Sales History', 19
    WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'correct_sale_date')
  `);
  await run(`
    INSERT INTO role_permissions (role_id, permission_id, store_id)
    SELECT su.role_id, p.id, su.store_id
    FROM store_users su
    JOIN roles r ON r.id = su.role_id
    JOIN permissions p ON p.name = 'correct_sale_date'
    WHERE LOWER(r.name) = 'owner' AND su.store_id IS NOT NULL
    ON CONFLICT (role_id, permission_id, store_id) DO NOTHING
  `);
}

export async function down(queryInterface, Sequelize, transaction) {
  const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
  await run(`
    DELETE FROM role_permissions
    WHERE permission_id IN (SELECT id FROM permissions WHERE name = 'correct_sale_date')
  `);
  await run(`DELETE FROM permissions WHERE name = 'correct_sale_date'`);
}
