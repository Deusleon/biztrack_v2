import pool from '../../../config/db.js';
export default {
  id: 'getExpenseAnalysis',
  name: 'Expense Analysis',
  description: 'Returns verified operating expense totals for today and the current month, plus the leading expense categories for the month. Use for expense, spending, or operating-cost questions.',
  category: 'finance',
  requiredPermissions: ['ai_expense_insights'],
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute({ storeId }) {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(amount) FILTER(WHERE expense_date::date = CURRENT_DATE), 0)::numeric AS today,
         COALESCE(SUM(amount) FILTER(WHERE date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE)), 0)::numeric AS month
       FROM expenses WHERE store_id = $1`,
      [storeId],
    );
    const categories = await pool.query(
      `SELECT category, COALESCE(SUM(amount), 0)::numeric AS total
       FROM expenses
       WHERE store_id = $1 AND date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE)
       GROUP BY category ORDER BY total DESC LIMIT 5`,
      [storeId],
    );
    return {
      period: 'today_and_current_month',
      today: Number(rows[0].today) || 0,
      month: Number(rows[0].month) || 0,
      topCategories: categories.rows.map((row) => ({ category: row.category, total: Number(row.total) || 0 })),
    };
  },
};
