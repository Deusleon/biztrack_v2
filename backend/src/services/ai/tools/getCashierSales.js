import pool from '../../../config/db.js';
import { businessToday, rangeOf } from '../assistant/periods.js';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default {
  id: 'getCashierSales',
  name: 'Sales by cashier',
  category: 'sales',
  requiredPermissions: ['view_sales_by_cashier_report'],
  description: 'Returns verified net sales and sale counts per cashier for the current store and date range. Use when the user asks who sold the most.',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Start date YYYY-MM-DD' },
      to: { type: 'string', description: 'End date YYYY-MM-DD' },
      limit: { type: 'integer', minimum: 1, maximum: 20 },
    },
    additionalProperties: false,
  },
  async execute({ storeId, args = {}, period }) {
    const range = rangeOf(args, period, businessToday());
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const { rows } = await pool.query(
      `SELECT u.name, COUNT(*)::int AS sales_count,
              COALESCE(SUM(p.subtotal - p.total_discount), 0)::numeric AS net_sales
       FROM payments p
       JOIN users u ON u.id = p.user_id
       WHERE p.store_id = $1
         AND p.sales_date::date BETWEEN $2::date AND $3::date
       GROUP BY u.id, u.name
       ORDER BY net_sales DESC
       LIMIT $4`,
      [storeId, range.from, range.to, limit],
    );
    return {
      period: range,
      cashiers: rows.map((row) => ({
        name: row.name,
        salesCount: Number(row.sales_count) || 0,
        netSales: toNumber(row.net_sales),
      })),
    };
  },
};
