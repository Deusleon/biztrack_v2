import pool from '../../config/db.js';
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const percentageChange = (current, previous) => {
  if (!previous) return current > 0 ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

async function buildBusinessContext(storeId) {
  const [salesRes, cogsRes, expensesRes, topProductsRes, paymentRes] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN p.sales_date::date = CURRENT_DATE THEN p.subtotal - p.total_discount ELSE 0 END), 0)::numeric AS today_net_sales,
         COALESCE(SUM(CASE WHEN p.sales_date::date = CURRENT_DATE - INTERVAL '1 day' THEN p.subtotal - p.total_discount ELSE 0 END), 0)::numeric AS yesterday_net_sales,
         COALESCE(SUM(CASE WHEN p.sales_date::date = CURRENT_DATE THEN p.subtotal ELSE 0 END), 0)::numeric AS today_gross_sales,
         COALESCE(SUM(CASE WHEN p.sales_date::date = CURRENT_DATE THEN p.total_discount ELSE 0 END), 0)::numeric AS today_discounts,
         COALESCE(SUM(CASE WHEN p.sales_date::date = CURRENT_DATE THEN p.total_vat ELSE 0 END), 0)::numeric AS today_vat,
         COALESCE(SUM(CASE WHEN p.sales_date::date = CURRENT_DATE THEN p.amount_due ELSE 0 END), 0)::numeric AS today_amount_due,
         COUNT(*) FILTER (WHERE p.sales_date::date = CURRENT_DATE)::int AS today_sales_count
       FROM payments p
       WHERE p.store_id = $1
         AND p.sales_date::date IN (CURRENT_DATE, CURRENT_DATE - INTERVAL '1 day')`,
      [storeId],
    ),
    pool.query(
      // Reads COGS from v_cart_line_profit -- the same canonical source the
      // profit reports use -- instead of independently re-summing
      // inventory_movements by note text. This keeps the AI's "today's
      // profit" answer consistent with what the Profit Report shows, and
      // is automatically return-safe (see migration 045).
      `SELECT COALESCE(SUM(v.line_cost), 0)::numeric AS cogs
       FROM v_cart_line_profit v
       WHERE v.store_id = $1
         AND v.sales_date::date = CURRENT_DATE`,
      [storeId],
    ),
    pool.query(
      `SELECT COALESCE(SUM(e.amount), 0)::numeric AS expenses
       FROM expenses e
       WHERE e.store_id = $1
         AND e.expense_date::date = CURRENT_DATE`,
      [storeId],
    ),
    pool.query(
      `SELECT
         pr.name AS product_name,
         SUM(c.quantity)::numeric AS quantity_sold,
         SUM(
           CASE
             WHEN c.discount_mode = 'percentage'
               THEN (c.quantity * c.price) - (c.quantity * c.price * COALESCE(c.discount, 0) / 100)
             ELSE (c.quantity * c.price) - (c.quantity * COALESCE(c.discount, 0))
           END
         )::numeric AS net_sales
       FROM cart c
       JOIN payments p ON p.cart_code = c.cart_code AND p.store_id = c.store_id
       JOIN products pr ON pr.id = c.product_id
       WHERE c.store_id = $1
         AND c.status = 'Sold'
         AND p.sales_date::date = CURRENT_DATE
       GROUP BY pr.id, pr.name
       ORDER BY net_sales DESC
       LIMIT 5`,
      [storeId],
    ),
    pool.query(
      `SELECT p.payment_method,
              COUNT(*)::int AS count,
              COALESCE(SUM(p.total_amount), 0)::numeric AS total
       FROM payments p
       WHERE p.store_id = $1 AND p.sales_date::date = CURRENT_DATE
       GROUP BY p.payment_method
       ORDER BY total DESC`,
      [storeId],
    ),
  ]);

  const sales = salesRes.rows[0];
  const todayNetSales = toNumber(sales.today_net_sales);
  const yesterdayNetSales = toNumber(sales.yesterday_net_sales);
  const cogs = toNumber(cogsRes.rows[0].cogs);
  const expenses = toNumber(expensesRes.rows[0].expenses);
  const grossProfit = todayNetSales - cogs;
  const estimatedOperatingProfit = grossProfit - expenses;
  const topProducts = topProductsRes.rows.map((row) => ({
    name: row.product_name,
    quantitySold: toNumber(row.quantity_sold),
    netSales: toNumber(row.net_sales),
    contributionPercent: todayNetSales > 0
      ? (toNumber(row.net_sales) / todayNetSales) * 100
      : 0,
  }));

  return {
    period: {
      type: 'today',
      date: new Date().toISOString().slice(0, 10),
    },
    sales: {
      grossSales: toNumber(sales.today_gross_sales),
      discounts: toNumber(sales.today_discounts),
      netSales: todayNetSales,
      vat: toNumber(sales.today_vat),
      salesCount: Number(sales.today_sales_count) || 0,
      amountDue: toNumber(sales.today_amount_due),
      previousNetSales: yesterdayNetSales,
      changePercent: percentageChange(todayNetSales, yesterdayNetSales),
    },
    profitability: {
      cogs,
      grossProfit,
      grossMarginPercent: todayNetSales > 0 ? (grossProfit / todayNetSales) * 100 : 0,
      expenses,
      estimatedOperatingProfit,
    },
    products: { topProducts },
    payments: paymentRes.rows.map((row) => ({
      method: row.payment_method,
      count: Number(row.count) || 0,
      total: toNumber(row.total),
    })),
  };
}

export { buildBusinessContext };

