import pool from '../../../config/db.js';
export default {
  id: 'getSalesComparison',
  name: 'Sales Comparison',
  description: 'Returns verified net-sales comparisons for today versus yesterday and the current week versus the previous week. Use when the user asks to compare sales periods or trends.',
  category: 'sales',
  requiredPermissions: ['ai_sales_insights'],
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute({ storeId }) {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(subtotal - total_discount) FILTER(WHERE sales_date::date = CURRENT_DATE), 0)::numeric AS today,
         COALESCE(SUM(subtotal - total_discount) FILTER(WHERE sales_date::date = CURRENT_DATE - 1), 0)::numeric AS yesterday,
         COALESCE(SUM(subtotal - total_discount) FILTER(WHERE sales_date >= date_trunc('week', CURRENT_DATE)), 0)::numeric AS current_week,
         COALESCE(SUM(subtotal - total_discount) FILTER(WHERE sales_date >= date_trunc('week', CURRENT_DATE) - INTERVAL '1 week' AND sales_date < date_trunc('week', CURRENT_DATE)), 0)::numeric AS previous_week
       FROM payments WHERE store_id = $1`,
      [storeId],
    );
    const row = rows[0];
    const percentage = (current, previous) => Number(previous)
      ? ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100
      : (Number(current) > 0 ? null : 0);
    return {
      today: Number(row.today) || 0,
      yesterday: Number(row.yesterday) || 0,
      todayChangePercent: percentage(row.today, row.yesterday),
      currentWeek: Number(row.current_week) || 0,
      previousWeek: Number(row.previous_week) || 0,
      weekChangePercent: percentage(row.current_week, row.previous_week),
    };
  },
};
