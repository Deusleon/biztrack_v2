import pool from '../config/db.js';
import { respondWithError } from '../utils/response.js';
// Runs independent queries in parallel, but never more than `limit` at once, so
// one dashboard load cannot grab the whole connection pool from other users.
async function runQueries(queries, limit = 4) {
  const results = new Array(queries.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed) {
      const i = next++;
      if (i >= queries.length) return;
      try {
        results[i] = await pool.query(queries[i][0], queries[i][1]);
      } catch (err) {
        failed = true; // stop starting new queries once one has failed
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queries.length) }, worker));
  return results;
}

export const getDashboardStats = async (req, res) => {
  const storeId = req.user.current_store_id;
  const rawLang = req.headers['accept-language']?.split(',')[0]?.substring(0, 2) || 'en';
  const lang = ['en', 'sw'].includes(rawLang) ? rawLang : 'en';

  try {
    // All 15 queries are independent, so they run in parallel (max 4 at a
    // time) instead of one after the other. Date filters are written as ranges
    // (col >= X AND col < Y) so the (store_id, sales_date) index can be used;
    // the old col::date / DATE(col) forms forced a scan of the store's rows.
    const [
      todayRes, yesterdayRes, monthRes, trendRes, recentSalesRes, topProductsRes, todayCogsRes, monthCogsRes, paymentBreakdownRes, todayExpensesRes, monthExpensesRes, last30dRevenueRes, last30dCogsRes, last30dExpensesRes, last3mStatsRes,
    ] = await runQueries([
      // todayRes
      [`SELECT
         COUNT(*)::int                              AS sales_count,
         COALESCE(SUM(p.total_amount - p.total_vat),  0)::numeric AS revenue,
         COALESCE(SUM(p.subtotal - p.total_discount), 0)::numeric AS net_sales,
         COALESCE(SUM(p.amount_paid),   0)::numeric AS amount_paid,
         COALESCE(SUM(p.amount_due),    0)::numeric AS amount_due
       FROM payments p
       WHERE p.store_id = $1
         AND p.sales_date >= CURRENT_DATE AND p.sales_date < CURRENT_DATE + 1`, [storeId]],
      // yesterdayRes
      [`SELECT
         COUNT(*)::int                              AS sales_count,
         COALESCE(SUM(p.total_amount - p.total_vat),  0)::numeric AS revenue,
         COALESCE(SUM(p.subtotal - p.total_discount), 0)::numeric AS net_sales
       FROM payments p
       WHERE p.store_id = $1
         AND p.sales_date >= CURRENT_DATE - 1 AND p.sales_date < CURRENT_DATE`, [storeId]],
      // monthRes
      [`SELECT
         COUNT(*)::int                              AS sales_count,
         COALESCE(SUM(p.total_amount - p.total_vat),  0)::numeric AS revenue,
         COALESCE(SUM(p.subtotal - p.total_discount), 0)::numeric AS net_sales
       FROM payments p
       WHERE p.store_id = $1
         AND p.sales_date >= DATE_TRUNC('month', CURRENT_DATE) AND p.sales_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`, [storeId]],
      // trendRes
      [`SELECT
         TO_CHAR(p.sales_date, 'YYYY-MM-DD') AS day,
         COALESCE(SUM(p.total_amount - p.total_vat), 0)::numeric AS revenue,
         COUNT(*)::int                             AS sales_count
       FROM payments p
       WHERE p.store_id = $1
         AND p.sales_date >= CURRENT_DATE - 6
       GROUP BY TO_CHAR(p.sales_date, 'YYYY-MM-DD')
       ORDER BY day ASC`, [storeId]],
      // recentSalesRes
      [`SELECT DISTINCT ON (p.invoice_number)
         p.invoice_number,
         p.sales_date,
         p.total_amount,
         p.amount_paid,
         p.amount_due,
         p.payment_method,
         p.sale_type,
         cust.name AS customer_name,
         u.name    AS cashier_name
       FROM payments p
       JOIN cart c       ON p.cart_code  = c.cart_code
       LEFT JOIN customers cust ON c.customer_id = cust.id
       LEFT JOIN users u        ON p.user_id      = u.id
       WHERE p.store_id = $1 AND c.status = 'Sold'
       ORDER BY p.invoice_number DESC, p.sales_date DESC
       LIMIT 8`, [storeId]],
      // topProductsRes
      [`SELECT
         pr.id,
         pr.name                                                   AS product_name,
         COALESCE(pc.name, 'Uncategorized')                         AS category_name,
         SUM(c.quantity)::numeric                          AS total_sold,
         SUM((c.quantity * c.price) - COALESCE(c.discount, 0))::numeric AS total_revenue
       FROM cart c
       JOIN products           pr ON c.product_id    = pr.id
       JOIN payments py ON py.cart_code = c.cart_code
       LEFT JOIN product_categories pc ON pr.category_id = pc.id
       WHERE c.store_id = $1
         AND c.status   = 'Sold'
         AND py.sales_date >= CURRENT_DATE - 30
       GROUP BY pr.id, pr.name, pc.name
       ORDER BY total_sold DESC
       LIMIT 5`, [storeId]],
      // todayCogsRes
      [`SELECT
         COALESCE(SUM(im.quantity * COALESCE(ib.cost_price, 0)), 0)::numeric AS cogs
       FROM inventory_movements im
       JOIN inventory_batches ib ON im.batch_id = ib.id
       WHERE im.store_id = $1
         AND im.note ILIKE 'Sold in invoice%'
         AND im.transaction_date >= CURRENT_DATE AND im.transaction_date < CURRENT_DATE + 1`, [storeId]],
      // monthCogsRes
      [`SELECT
         COALESCE(SUM(im.quantity * COALESCE(ib.cost_price, 0)), 0)::numeric AS cogs
       FROM inventory_movements im
       JOIN inventory_batches ib ON im.batch_id = ib.id
       WHERE im.store_id = $1
         AND im.note ILIKE 'Sold in invoice%'
         AND im.transaction_date >= DATE_TRUNC('month', CURRENT_DATE) AND im.transaction_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`, [storeId]],
      // paymentBreakdownRes
      [`SELECT
         p.payment_method,
         COUNT(*)::int                             AS count,
         COALESCE(SUM(p.total_amount), 0)::numeric AS total
       FROM payments p
       WHERE p.store_id = $1
         AND p.sales_date >= CURRENT_DATE AND p.sales_date < CURRENT_DATE + 1
       GROUP BY p.payment_method
       ORDER BY total DESC`, [storeId]],
      // todayExpensesRes
      [`SELECT COALESCE(SUM(amount), 0)::numeric AS total_expenses
       FROM expenses
       WHERE store_id = $1
         AND expense_date >= CURRENT_DATE AND expense_date < CURRENT_DATE + 1`, [storeId]],
      // monthExpensesRes
      [`SELECT COALESCE(SUM(amount), 0)::numeric AS total_expenses
       FROM expenses
       WHERE store_id = $1
         AND expense_date >= DATE_TRUNC('month', CURRENT_DATE) AND expense_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`, [storeId]],
      // last30dRevenueRes
      [`SELECT
         COUNT(DISTINCT p.sales_date::date)::int   AS active_days,
         COALESCE(SUM(p.total_amount - p.total_vat), 0)::numeric AS revenue
       FROM payments p
       WHERE p.store_id = $1
         AND p.sales_date >= CURRENT_DATE - 29`, [storeId]],
      // last30dCogsRes
      [`SELECT COALESCE(SUM(im.quantity * COALESCE(ib.cost_price, 0)), 0)::numeric AS cogs
       FROM inventory_movements im
       JOIN inventory_batches ib ON im.batch_id = ib.id
       WHERE im.store_id = $1
         AND im.note ILIKE 'Sold in invoice%'
         AND im.transaction_date >= CURRENT_DATE - 29`, [storeId]],
      // last30dExpensesRes
      [`SELECT COALESCE(SUM(amount), 0)::numeric AS expenses
       FROM expenses
       WHERE store_id = $1
         AND expense_date >= CURRENT_DATE - 29`, [storeId]],
      // last3mStatsRes
      [`SELECT
         COUNT(DISTINCT DATE_TRUNC('month', p.sales_date))::int AS active_months,
         COALESCE(SUM(p.total_amount - p.total_vat), 0)::numeric              AS revenue
       FROM payments p
       WHERE p.store_id = $1
         AND p.sales_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')`, [storeId]],
    ]);















    return res.json({
      success: true,
      data: {
        todayStats:      { ...todayRes.rows[0], cogs: todayCogsRes.rows[0].cogs, expenses: todayExpensesRes.rows[0].total_expenses },
        yesterdayStats:  yesterdayRes.rows[0],
        monthStats:      { ...monthRes.rows[0], cogs: monthCogsRes.rows[0].cogs, expenses: monthExpensesRes.rows[0].total_expenses },
        last30dStats:    {
          active_days: last30dRevenueRes.rows[0].active_days,
          revenue:     last30dRevenueRes.rows[0].revenue,
          cogs:        last30dCogsRes.rows[0].cogs,
          expenses:    last30dExpensesRes.rows[0].expenses,
        },
        last3mStats:     {
          active_months: last3mStatsRes.rows[0].active_months,
          revenue:       last3mStatsRes.rows[0].revenue,
        },
        revenueTrend:    trendRes.rows,
        recentSales:     recentSalesRes.rows,
        topProducts:     topProductsRes.rows,
        paymentBreakdown: paymentBreakdownRes.rows,
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

