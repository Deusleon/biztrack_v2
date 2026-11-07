import pool from '../../../../config/db.js';
function dateWhere(filters, params, alias = 'p.sales_date') {
  let where = '';
  if (filters.startDate) { params.push(filters.startDate); where += ` AND DATE(${alias}) >= $${params.length}::date`; }
  if (filters.endDate) { params.push(filters.endDate); where += ` AND DATE(${alias}) <= $${params.length}::date`; }
  return where;
}

export default {
  id: 'sales',
  requiredPermission: 'ai_sales_insights',
  async build({ storeId, reportType, filters = {} }) {
    const params = [storeId];
    let where = `WHERE p.store_id = $1`;
    if (filters.saleType && filters.saleType !== 'all') { params.push(filters.saleType); where += ` AND p.sale_type = $${params.length}`; }
    where += dateWhere(filters, params);
    const { rows } = await pool.query(`
      WITH invoices AS (
        SELECT DISTINCT ON (p.invoice_number)
          p.invoice_number, p.sales_date, p.sale_type, p.payment_method,
          COALESCE(p.total_amount,0)::numeric total_amount,
          COALESCE(p.amount_paid,0)::numeric amount_paid,
          COALESCE(p.amount_due,0)::numeric amount_due
        FROM payments p
        ${where}
        ORDER BY p.invoice_number, p.sales_date DESC
      )
      SELECT COUNT(*)::int total_invoices,
        COALESCE(SUM(total_amount),0)::numeric total_sales,
        COALESCE(SUM(amount_paid),0)::numeric total_paid,
        COALESCE(SUM(amount_due),0)::numeric total_due,
        COUNT(*) FILTER (WHERE sale_type='credit')::int credit_sales,
        COUNT(*) FILTER (WHERE sale_type='cash')::int cash_sales,
        MIN(sales_date) period_start, MAX(sales_date) period_end
      FROM invoices`, params);
    const payment = await pool.query(`SELECT COALESCE(payment_method,'Unknown') method, COUNT(DISTINCT invoice_number)::int invoices, COALESCE(SUM(amount_paid),0)::numeric amount FROM payments p ${where} GROUP BY payment_method ORDER BY amount DESC LIMIT 8`, params);
    return { category: 'sales', reportType, filters, summary: rows[0], paymentBreakdown: payment.rows };
  },
};
