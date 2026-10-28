import pool from '../../../config/db.js';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default {
  id: 'getSupplierDebts',
  name: 'Supplier debts',
  category: 'purchases',
  requiredPermissions: ['view_supplier_invoices'],
  description: 'Returns verified unpaid supplier invoice balances for the current store. Use when the user asks what the business owes suppliers.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 20 },
    },
    additionalProperties: false,
  },
  async execute({ storeId, args = {} }) {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const total = await pool.query(
      `SELECT COUNT(DISTINCT supplier_id)::int AS suppliers,
              COALESCE(SUM(balance_due), 0)::numeric AS balance
       FROM supplier_invoices
       WHERE store_id = $1
         AND balance_due > 0
         AND COALESCE(status, '') NOT IN ('draft', 'cancelled', 'void', 'rejected')`,
      [storeId],
    );
    const top = await pool.query(
      `SELECT s.name, COALESCE(SUM(si.balance_due), 0)::numeric AS balance
       FROM supplier_invoices si
       JOIN suppliers s ON s.id = si.supplier_id
       WHERE si.store_id = $1
         AND si.balance_due > 0
         AND COALESCE(si.status, '') NOT IN ('draft', 'cancelled', 'void', 'rejected')
       GROUP BY s.id, s.name
       ORDER BY balance DESC
       LIMIT $2`,
      [storeId, limit],
    );
    return {
      suppliersWithBalance: Number(total.rows[0]?.suppliers) || 0,
      totalBalance: toNumber(total.rows[0]?.balance),
      suppliers: top.rows.map((row) => ({ name: row.name, balance: toNumber(row.balance) })),
    };
  },
};
