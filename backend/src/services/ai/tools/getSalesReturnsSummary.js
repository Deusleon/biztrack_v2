import pool from '../../../config/db.js';
import { businessToday, rangeOf } from '../assistant/periods.js';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default {
  id: 'getSalesReturnsSummary',
  name: 'Sales returns',
  category: 'sales',
  requiredPermissions: ['view_sales_returns'],
  description: 'Returns verified sales-return counts and amounts for the current store and date range. Excludes rejected returns.',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Start date YYYY-MM-DD' },
      to: { type: 'string', description: 'End date YYYY-MM-DD' },
    },
    additionalProperties: false,
  },
  async execute({ storeId, args = {}, period }) {
    const range = rangeOf(args, period, businessToday());
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS returns,
              COALESCE(SUM(total_amount), 0)::numeric AS total,
              COALESCE(SUM(refund_amount), 0)::numeric AS refunded
       FROM sales_returns
       WHERE store_id = $1
         AND status <> 'rejected'
         AND created_at::date BETWEEN $2::date AND $3::date`,
      [storeId, range.from, range.to],
    );
    return {
      period: range,
      returns: Number(rows[0]?.returns) || 0,
      total: toNumber(rows[0]?.total),
      refunded: toNumber(rows[0]?.refunded),
    };
  },
};
