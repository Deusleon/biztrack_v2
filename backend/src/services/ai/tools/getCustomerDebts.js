import pool from '../../../config/db.js';
export default {
  id: 'getCustomerDebts',
  name: 'Customer Debts',
  description: 'Returns verified customer outstanding balances and the largest debtors for the current store. Use when the user asks about customer debts, balances, receivables, or who owes the business.',
  category: 'customers',
  requiredPermissions: ['ai_customer_insights'],
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Maximum number of top debtors to return. Defaults to 10.',
      },
    },
    additionalProperties: false,
  },
  async execute({ storeId, args = {} }) {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const total = await pool.query(
      `SELECT COUNT(*) FILTER(WHERE current_balance > 0)::int AS customers,
              COALESCE(SUM(current_balance) FILTER(WHERE current_balance > 0), 0)::numeric AS outstanding
       FROM customers WHERE store_id = $1`,
      [storeId],
    );
    const top = await pool.query(
      `SELECT name, phone, current_balance::numeric AS balance,
              credit_limit::numeric AS "creditLimit", credit_due_days AS "creditDueDays"
       FROM customers
       WHERE store_id = $1 AND current_balance > 0
       ORDER BY current_balance DESC
       LIMIT $2`,
      [storeId, limit],
    );
    return {
      customersWithDebt: Number(total.rows[0].customers) || 0,
      totalOutstanding: Number(total.rows[0].outstanding) || 0,
      topDebtors: top.rows.map((row) => ({
        ...row,
        balance: Number(row.balance) || 0,
        creditLimit: Number(row.creditLimit) || 0,
      })),
    };
  },
};
