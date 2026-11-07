import pool from '../../../../config/db.js';
export default {
  id: 'profit',
  requiredPermission: 'ai_profit_insights',
  async build({ storeId, reportType, filters = {} }) {
    const params = [storeId];
    // NOTE: filters by v.sales_date (the actual date the sale happened),
    // not salesrecord.created_at (when the row was written) — the two can
    // differ for backdated/corrected sales. This also matches the date
    // column every profit report in report.controller.js filters on, so
    // the AI explanation and the report the person is looking at always
    // agree on which invoices are "in range".
    let where = 'WHERE v.store_id = $1';
    if (filters.startDate) { params.push(filters.startDate); where += ` AND v.sales_date::date >= $${params.length}::date`; }
    if (filters.endDate) { params.push(filters.endDate); where += ` AND v.sales_date::date <= $${params.length}::date`; }
    // Reads from v_cart_line_profit -- the same canonical source the
    // profit reports use -- so "explain this report" always matches the
    // numbers actually shown on screen, including after returns.
    const { rows } = await pool.query(`
      SELECT
        COUNT(DISTINCT v.invoice_number)::int total_invoices,
        COALESCE(SUM(CASE WHEN v.line_profit >= 0 THEN v.line_profit ELSE 0 END), 0)::numeric total_profit,
        COALESCE(SUM(CASE WHEN v.line_profit < 0 THEN ABS(v.line_profit) ELSE 0 END), 0)::numeric total_loss,
        COALESCE(SUM(v.line_profit), 0)::numeric net_profit,
        COALESCE(SUM(v.line_revenue), 0)::numeric total_revenue,
        CASE WHEN SUM(v.line_revenue) > 0 THEN ROUND((SUM(v.line_profit) / SUM(v.line_revenue)) * 100, 2) ELSE 0 END profit_margin_percentage
      FROM v_cart_line_profit v
      ${where}`, params);
    return { category: 'profit', reportType, filters, summary: rows[0] };
  },
};
