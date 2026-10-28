import pool from '../../../config/db.js';
import { businessToday, rangeOf } from '../assistant/periods.js';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default {
  id: 'getProfitForPeriod',
  name: 'Profit for a period',
  category: 'finance',
  requiredPermissions: ['ai_profit_insights'],
  description: 'Returns verified net sales, COGS, gross profit, expenses and estimated operating profit for a date range. Use when the question is about profit for yesterday, last week, last month, or another period. Dates are YYYY-MM-DD.',
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
    const [salesRes, cogsRes, expenseRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(subtotal - total_discount), 0)::numeric AS net,
                COALESCE(SUM(total_discount), 0)::numeric AS discounts,
                COUNT(*)::int AS sales_count
         FROM payments
         WHERE store_id = $1 AND sales_date::date BETWEEN $2::date AND $3::date`,
        [storeId, range.from, range.to],
      ),
      pool.query(
        `SELECT COALESCE(SUM(line_cost), 0)::numeric AS cogs
         FROM v_cart_line_profit
         WHERE store_id = $1 AND sales_date::date BETWEEN $2::date AND $3::date`,
        [storeId, range.from, range.to],
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS expenses
         FROM expenses
         WHERE store_id = $1 AND expense_date::date BETWEEN $2::date AND $3::date`,
        [storeId, range.from, range.to],
      ),
    ]);
    const netSales = toNumber(salesRes.rows[0]?.net);
    const cogs = toNumber(cogsRes.rows[0]?.cogs);
    const expenses = toNumber(expenseRes.rows[0]?.expenses);
    const grossProfit = netSales - cogs;
    return {
      period: range,
      sales: { netSales, discounts: toNumber(salesRes.rows[0]?.discounts), salesCount: Number(salesRes.rows[0]?.sales_count) || 0 },
      profitability: {
        cogs,
        grossProfit,
        grossMarginPercent: netSales > 0 ? (grossProfit / netSales) * 100 : 0,
        expenses,
        estimatedOperatingProfit: grossProfit - expenses,
      },
    };
  },
};
