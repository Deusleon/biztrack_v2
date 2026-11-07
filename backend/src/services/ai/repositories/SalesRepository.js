import pool from '../../../config/db.js';
const PERIODS = {
  today: "CURRENT_DATE",
  yesterday: "CURRENT_DATE - INTERVAL '1 day'",
  week: "date_trunc('week', CURRENT_DATE)",
  month: "date_trunc('month', CURRENT_DATE)",
  quarter: "date_trunc('quarter', CURRENT_DATE)",
  year: "date_trunc('year', CURRENT_DATE)",
};

function periodStart(period = 'month') {
  return PERIODS[period] || PERIODS.month;
}

function productName(alias = 'p') {
  return `COALESCE(${alias}.name->>'en', ${alias}.name->>'sw', ${alias}.name::text)`;
}

async function getTrend(storeId, { period = 'month', interval = 'day' } = {}) {
  const start = periodStart(period);
  const bucket = ['day', 'week', 'month'].includes(interval) ? interval : 'day';
  const { rows } = await pool.query(
    `SELECT date_trunc('${bucket}', sales_date) AS bucket,
            COUNT(*)::int AS transactions,
            COALESCE(SUM(subtotal), 0)::numeric AS gross_sales,
            COALESCE(SUM(total_discount), 0)::numeric AS discounts,
            COALESCE(SUM(subtotal - total_discount), 0)::numeric AS net_sales,
            COALESCE(SUM(amount_due), 0)::numeric AS amount_due
     FROM payments
     WHERE store_id = $1 AND sales_date >= ${start}
     GROUP BY 1 ORDER BY 1`,
    [storeId],
  );
  return rows.map((r) => ({
    date: r.bucket,
    transactions: Number(r.transactions) || 0,
    grossSales: Number(r.gross_sales) || 0,
    discounts: Number(r.discounts) || 0,
    netSales: Number(r.net_sales) || 0,
    amountDue: Number(r.amount_due) || 0,
  }));
}

async function getProductMovement(storeId, { days = 30, limit = 10, direction = 'desc' } = {}) {
  const order = direction === 'asc' ? 'ASC' : 'DESC';
  const { rows } = await pool.query(
    `SELECT c.product_id AS id, ${productName('p')} AS name, p.unit,
            COALESCE(SUM(c.quantity), 0)::numeric AS quantity,
            COALESCE(SUM((c.price * c.quantity) - c.discount), 0)::numeric AS net_sales,
            COUNT(DISTINCT c.invoice_number)::int AS transactions,
            MAX(pay.sales_date) AS last_sold_at
     FROM cart c
     JOIN products p ON p.id = c.product_id
     LEFT JOIN payments pay ON pay.store_id = c.store_id
       AND (pay.invoice_number = c.invoice_number OR pay.cart_code = c.cart_code)
     WHERE c.store_id = $1 AND c.status = 'Sold'
       AND COALESCE(pay.sales_date, c.updated_at, c.created_at) >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
     GROUP BY c.product_id, p.name, p.unit
     ORDER BY quantity ${order}, net_sales ${order}
     LIMIT $3`,
    [storeId, days, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    quantitySold: Number(r.quantity) || 0,
    netSales: Number(r.net_sales) || 0,
    transactions: Number(r.transactions) || 0,
    lastSoldAt: r.last_sold_at,
  }));
}

async function getByCategory(storeId, { period = 'month', limit = 10 } = {}) {
  const start = periodStart(period);
  const { rows } = await pool.query(
    `SELECT COALESCE(pc.name->>'en', pc.name->>'sw', 'Uncategorized') AS category,
            COALESCE(SUM(c.quantity), 0)::numeric AS quantity,
            COALESCE(SUM((c.price * c.quantity) - c.discount), 0)::numeric AS net_sales
     FROM cart c
     JOIN products p ON p.id = c.product_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     LEFT JOIN payments pay ON pay.store_id = c.store_id
       AND (pay.invoice_number = c.invoice_number OR pay.cart_code = c.cart_code)
     WHERE c.store_id = $1 AND c.status = 'Sold'
       AND COALESCE(pay.sales_date, c.updated_at, c.created_at) >= ${start}
     GROUP BY pc.id, pc.name
     ORDER BY net_sales DESC LIMIT $2`,
    [storeId, limit],
  );
  return rows.map((r) => ({ category: r.category, quantitySold: Number(r.quantity) || 0, netSales: Number(r.net_sales) || 0 }));
}

async function getByPaymentMethod(storeId, { period = 'month' } = {}) {
  const start = periodStart(period);
  const { rows } = await pool.query(
    `SELECT COALESCE(NULLIF(payment_method, ''), 'unknown') AS method,
            COUNT(*)::int AS transactions,
            COALESCE(SUM(amount_paid - amount_change), 0)::numeric AS collected,
            COALESCE(SUM(amount_due), 0)::numeric AS amount_due,
            COALESCE(SUM(subtotal - total_discount), 0)::numeric AS net_sales
     FROM payments WHERE store_id = $1 AND sales_date >= ${start}
     GROUP BY payment_method ORDER BY collected DESC`,
    [storeId],
  );
  return rows.map((r) => ({ method: r.method, transactions: Number(r.transactions) || 0, collected: Number(r.collected) || 0, amountDue: Number(r.amount_due) || 0, netSales: Number(r.net_sales) || 0 }));
}

export { getTrend, getProductMovement, getByCategory, getByPaymentMethod };

