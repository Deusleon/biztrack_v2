import pool from '../../../config/db.js';
import { businessToday, rangeOf } from '../assistant/periods.js';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default {
  id: 'getSalesForPeriod',
  name: 'Sales for a period',
  category: 'sales',
  requiredPermissions: ['ai_sales_insights'],
  description: 'Returns verified net sales, discounts, VAT, sale count and amount due for a date range. Use for yesterday, last week, last month, or any period other than today. Dates are YYYY-MM-DD.',
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
      `SELECT
         COALESCE(SUM(subtotal), 0)::numeric AS gross,
         COALESCE(SUM(total_discount), 0)::numeric AS discounts,
         COALESCE(SUM(subtotal - total_discount), 0)::numeric AS net,
         COALESCE(SUM(total_vat), 0)::numeric AS vat,
         COALESCE(SUM(amount_due), 0)::numeric AS due,
         COUNT(*)::int AS sales_count
       FROM payments
       WHERE store_id = $1
         AND sales_date::date BETWEEN $2::date AND $3::date`,
      [storeId, range.from, range.to],
    );
    const row = rows[0] || {};
    return {
      period: range,
      sales: {
        grossSales: toNumber(row.gross),
        discounts: toNumber(row.discounts),
        netSales: toNumber(row.net),
        vat: toNumber(row.vat),
        amountDue: toNumber(row.due),
        salesCount: Number(row.sales_count) || 0,
      },
    };
  },
};
