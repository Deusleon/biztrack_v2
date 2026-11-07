// path: backend/controllers/report.controller.js
import pool from '../config/db.js';
import { respondWithError } from '../utils/response.js';
const toDateClause = ({ startDate, endDate, columnAlias = 'created_at', params }) => {
  let where = '';

  if (startDate) {
    params.push(startDate);
    where += ` AND DATE(${columnAlias}) >= $${params.length}::date`;
  }

  if (endDate) {
    params.push(endDate);
    where += ` AND DATE(${columnAlias}) <= $${params.length}::date`;
  }

  return where;
};

export const getSalesReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { saleType, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = `WHERE p.store_id = $1 AND c.status = 'Sold'`;

    if (saleType && saleType !== 'all') {
      params.push(saleType);
      where += ` AND p.sale_type = $${params.length}`;
    }

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'p.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT DISTINCT ON (p.invoice_number)
          p.invoice_number,
          p.sales_date,
          p.sale_type,
          p.payment_method,
          p.total_amount,
          p.amount_paid,
          p.amount_due,
          cust.name AS customer_name,
          u.name AS cashier_name
       FROM payments p
       LEFT JOIN cart c ON p.cart_code = c.cart_code
       LEFT JOIN customers cust ON c.customer_id = cust.id
       LEFT JOIN users u ON p.user_id = u.id
       ${where}
       ORDER BY p.invoice_number DESC, p.sales_date DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(*) AS total_invoices,
          COALESCE(SUM(total_amount), 0) AS total_amount,
          COALESCE(SUM(amount_paid), 0) AS total_paid,
          COALESCE(SUM(amount_due), 0) AS total_due
       FROM (
         SELECT DISTINCT ON (p.invoice_number)
           p.invoice_number, p.total_amount, p.amount_paid, p.amount_due
         FROM payments p
         LEFT JOIN cart c ON p.cart_code = c.cart_code
         ${where}
         ORDER BY p.invoice_number DESC
       ) sub`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating sales report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

export const getPurchasesReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { status, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE po.store_id = $1';

    if (status && status !== 'all') {
      params.push(status);
      where += ` AND po.status = $${params.length}`;
    }

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'po.order_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          po.id,
          po.po_number,
          po.order_date,
          po.status,
          po.total_amount,
          s.name AS supplier_name,
          u.name AS created_by_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.created_by = u.id
       ${where}
       ORDER BY po.order_date DESC, po.created_at DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(*) AS total_orders,
          COALESCE(SUM(po.total_amount), 0) AS total_amount
       FROM purchase_orders po
       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating purchases report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

export const getExpensesReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { paymentMethod, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE sp.store_id = $1';

    if (paymentMethod && paymentMethod !== 'all') {
      params.push(paymentMethod);
      where += ` AND sp.payment_method = $${params.length}`;
    }

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'sp.payment_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          sp.id,
          sp.payment_number,
          sp.payment_date,
          sp.payment_method,
          sp.reference_number,
          sp.amount,
          sp.notes,
          s.name AS supplier_name
       FROM supplier_payments sp
       LEFT JOIN suppliers s ON sp.supplier_id = s.id
       ${where}
       ORDER BY sp.payment_date DESC, sp.created_at DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(*) AS total_transactions,
          COALESCE(SUM(sp.amount), 0) AS total_expenses
       FROM supplier_payments sp
       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating expenses report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

export const getInventoryReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { stockState = 'all' } = req.query;

  try {
    const params = [storeId];

    const inventoryQuery = `
      WITH product_stock AS (
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.minimum_stock,
          p.unit,
          c.name AS category_name,
          COALESCE(SUM(
            CASE
              WHEN im.type = 'IN' THEN im.quantity
              WHEN im.type = 'OUT' THEN -im.quantity
              ELSE 0
            END
          ), 0) AS current_stock,
          MAX(ib.cost_price) FILTER (WHERE ib.cost_price IS NOT NULL) AS latest_cost_price
        FROM products p
        LEFT JOIN product_categories c ON p.category_id = c.id
        LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.store_id = p.store_id
        LEFT JOIN inventory_movements im ON im.batch_id = ib.id
        WHERE p.store_id = $1
        GROUP BY p.id, p.name, p.minimum_stock, p.unit, c.name
      )
      SELECT
        ps.product_id,
        ps.product_name,
        ps.category_name,
        ps.unit,
        ps.minimum_stock,
        ps.current_stock,
        COALESCE(ps.latest_cost_price, 0) AS cost_price,
        COALESCE(ps.current_stock, 0) * COALESCE(ps.latest_cost_price, 0) AS stock_value
      FROM product_stock ps
    `;

    let wrappedQuery = `SELECT * FROM (${inventoryQuery}) stock_data WHERE 1=1`;

    if (stockState === 'in-stock') {
      wrappedQuery += ' AND stock_data.current_stock > stock_data.minimum_stock';
    } else if (stockState === 'low-stock') {
      wrappedQuery += ' AND stock_data.current_stock > 0 AND stock_data.current_stock <= stock_data.minimum_stock';
    } else if (stockState === 'out-of-stock') {
      wrappedQuery += ' AND stock_data.current_stock <= 0';
    }

    wrappedQuery += ' ORDER BY stock_data.product_name ASC';

    const dataResult = await pool.query(wrappedQuery, params);

    const summaryResult = await pool.query(
      `SELECT
          COUNT(*) AS total_products,
          COALESCE(SUM(stock_value), 0) AS total_stock_value,
          COALESCE(SUM(current_stock), 0) AS total_quantity
       FROM (${inventoryQuery}) stock_data`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating inventory report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// SALES DETAILED REPORT (line-item level)
// =====================================================
export const getSalesDetailedReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { saleType, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = `WHERE p.store_id = $1 AND c.status = 'Sold'`;

    if (saleType && saleType !== 'all') {
      params.push(saleType);
      where += ` AND p.sale_type = $${params.length}`;
    }

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'p.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          p.invoice_number,
          p.sales_date,
          p.sale_type,
          p.payment_method,

          prod.name AS product_name,
          cat.name AS category_name,
          prod.unit AS unit,

          c.quantity,
          c.price AS original_unit_price,

          c.discount_mode,
          COALESCE(c.discount, 0) AS discount_value,

          pricing.unit_discount_amount AS discount_per_unit,
          pricing.unit_discount_amount * c.quantity AS discount_amount,

          pricing.final_unit_price AS unit_price,

          pricing.final_unit_price * c.quantity AS line_total,

          cust.name AS customer_name,
          u.name AS cashier_name

       FROM payments p

       JOIN cart c
         ON p.cart_code = c.cart_code

       JOIN products prod
         ON c.product_id = prod.id

       LEFT JOIN product_categories cat
         ON prod.category_id = cat.id

       LEFT JOIN customers cust
         ON c.customer_id = cust.id

       LEFT JOIN users u
         ON p.user_id = u.id

       CROSS JOIN LATERAL (
         SELECT
           CASE
             WHEN c.discount_mode = 'percentage'
               THEN c.price * COALESCE(c.discount, 0) / 100.0

             WHEN c.discount_mode = 'amount'
               THEN COALESCE(c.discount, 0)

             ELSE 0
           END AS unit_discount_amount,

           CASE
             WHEN c.discount_mode = 'percentage'
               THEN c.price
                    - (
                        c.price
                        * COALESCE(c.discount, 0)
                        / 100.0
                      )

             WHEN c.discount_mode = 'amount'
               THEN c.price - COALESCE(c.discount, 0)

             ELSE c.price
           END AS final_unit_price
       ) pricing

       ${where}

       ORDER BY
         p.sales_date DESC,
         p.invoice_number DESC,
         prod.name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT p.invoice_number) AS total_invoices,
          COUNT(c.id) AS total_line_items,

          COALESCE(
            SUM(c.quantity),
            0
          ) AS total_quantity,

          COALESCE(
            SUM(
              pricing.unit_discount_amount * c.quantity
            ),
            0
          ) AS total_discount,

          COALESCE(
            SUM(
              pricing.final_unit_price * c.quantity
            ),
            0
          ) AS total_revenue

       FROM payments p

       JOIN cart c
         ON p.cart_code = c.cart_code

       CROSS JOIN LATERAL (
         SELECT
           CASE
             WHEN c.discount_mode = 'percentage'
               THEN c.price * COALESCE(c.discount, 0) / 100.0

             WHEN c.discount_mode = 'amount'
               THEN COALESCE(c.discount, 0)

             ELSE 0
           END AS unit_discount_amount,

           CASE
             WHEN c.discount_mode = 'percentage'
               THEN c.price
                    - (
                        c.price
                        * COALESCE(c.discount, 0)
                        / 100.0
                      )

             WHEN c.discount_mode = 'amount'
               THEN c.price - COALESCE(c.discount, 0)

             ELSE c.price
           END AS final_unit_price
       ) pricing

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating sales detailed report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// SALES RETURNS REPORT
// =====================================================
export const getSalesReturnsReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { status, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = `WHERE sr.store_id = $1`;

    if (status && status !== 'all') {
      params.push(status);
      where += ` AND sr.status = $${params.length}`;
    }

    where += toDateClause({ startDate, endDate, columnAlias: 'sr.created_at', params });

    const dataResult = await pool.query(
      `SELECT
          sr.return_number,
          sr.original_invoice_number,
          sr.total_amount,
          sr.refund_amount,
          sr.refund_method,
          sr.status,
          sr.reason,
          sr.created_at,
          cust.name AS customer_name,
          u.name    AS processed_by
       FROM sales_returns sr
       LEFT JOIN customers cust ON sr.customer_id = cust.id
       LEFT JOIN users u        ON sr.user_id = u.id
       ${where}
       ORDER BY sr.created_at DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(*)                              AS total_returns,
          COALESCE(SUM(sr.total_amount),  0)   AS total_amount,
          COALESCE(SUM(sr.refund_amount), 0)   AS total_refunded,
          COUNT(*) FILTER (WHERE sr.status = 'completed') AS completed_returns,
          COUNT(*) FILTER (WHERE sr.status = 'pending')   AS pending_returns
       FROM sales_returns sr
       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating sales returns report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// SALES COMPARISON REPORT (daily totals)
// =====================================================
export const getSalesComparisonReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = `
      WHERE p.store_id = $1
        AND EXISTS (
          SELECT 1
          FROM cart c
          WHERE c.cart_code = p.cart_code
            AND c.status = 'Sold'
        )
    `;

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'p.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          DATE(p.sales_date) AS sale_date,

          COUNT(DISTINCT p.invoice_number) AS total_invoices,

          COALESCE(
            SUM(p.total_amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(p.amount_paid),
            0
          ) AS total_paid,

          COALESCE(
            SUM(p.amount_due),
            0
          ) AS total_due,

          COALESCE(
            SUM(p.total_amount)
              FILTER (WHERE LOWER(p.sale_type) = 'cash'),
            0
          ) AS cash_amount,

          COALESCE(
            SUM(p.total_amount)
              FILTER (WHERE LOWER(p.sale_type) = 'credit'),
            0
          ) AS credit_amount,

          COUNT(DISTINCT p.invoice_number)
            FILTER (WHERE LOWER(p.sale_type) = 'cash')
            AS cash_invoices,

          COUNT(DISTINCT p.invoice_number)
            FILTER (WHERE LOWER(p.sale_type) = 'credit')
            AS credit_invoices

       FROM payments p

       ${where}

       GROUP BY DATE(p.sales_date)

       ORDER BY sale_date DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT p.invoice_number) AS total_invoices,

          COALESCE(
            SUM(p.total_amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(p.amount_paid),
            0
          ) AS total_paid,

          COALESCE(
            SUM(p.amount_due),
            0
          ) AS total_due,

          COALESCE(
            SUM(p.total_amount)
              FILTER (WHERE LOWER(p.sale_type) = 'cash'),
            0
          ) AS total_cash,

          COALESCE(
            SUM(p.total_amount)
              FILTER (WHERE LOWER(p.sale_type) = 'credit'),
            0
          ) AS total_credit,

          COUNT(DISTINCT p.invoice_number)
            FILTER (WHERE LOWER(p.sale_type) = 'cash')
            AS cash_invoices,

          COUNT(DISTINCT p.invoice_number)
            FILTER (WHERE LOWER(p.sale_type) = 'credit')
            AS credit_invoices,

          COUNT(DISTINCT DATE(p.sales_date)) AS total_days,

          CASE
            WHEN COUNT(DISTINCT DATE(p.sales_date)) > 0
            THEN
              SUM(p.total_amount)
              / COUNT(DISTINCT DATE(p.sales_date))
            ELSE 0
          END AS average_daily_sales

       FROM payments p

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating sales comparison report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// SALES BY PRODUCT REPORT
// =====================================================
export const getSalesByProductReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { saleType, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = `WHERE p.store_id = $1 AND c.status = 'Sold'`;

    if (saleType && saleType.toLowerCase() !== 'all') {
      params.push(saleType.toLowerCase());
      where += ` AND LOWER(p.sale_type) = $${params.length}`;
    }

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'p.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          prod.id AS product_id,
          prod.name AS product_name,
          cat.name AS category_name,
          prod.unit AS unit,

          COALESCE(
            SUM(c.quantity),
            0
          ) AS total_quantity,

          COALESCE(
            SUM(
              pricing.final_unit_price * c.quantity
            ),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(
              pricing.unit_discount_amount * c.quantity
            ),
            0
          ) AS total_discount,

          COUNT(DISTINCT p.invoice_number) AS invoice_count,

          COALESCE(
            SUM(pricing.final_unit_price * c.quantity)
            / NULLIF(SUM(c.quantity), 0),
            0
          ) AS avg_selling_price,

          COALESCE(
            SUM(c.price * c.quantity)
            / NULLIF(SUM(c.quantity), 0),
            0
          ) AS avg_original_price

       FROM payments p

       JOIN cart c
         ON p.cart_code = c.cart_code

       JOIN products prod
         ON c.product_id = prod.id

       LEFT JOIN product_categories cat
         ON prod.category_id = cat.id

       CROSS JOIN LATERAL (
         SELECT
           CASE
             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'percentage'
               THEN
                 c.price
                 * COALESCE(c.discount, 0)
                 / 100.0

             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'amount'
               THEN COALESCE(c.discount, 0)

             ELSE 0
           END AS unit_discount_amount,

           CASE
             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'percentage'
               THEN
                 c.price
                 - (
                     c.price
                     * COALESCE(c.discount, 0)
                     / 100.0
                   )

             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'amount'
               THEN c.price - COALESCE(c.discount, 0)

             ELSE c.price
           END AS final_unit_price
       ) pricing

       ${where}

       GROUP BY
         prod.id,
         prod.name,
         prod.unit,
         cat.name

       ORDER BY total_revenue DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT prod.id) AS total_products,

          COALESCE(
            SUM(c.quantity),
            0
          ) AS total_quantity,

          COALESCE(
            SUM(
              pricing.final_unit_price * c.quantity
            ),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(
              pricing.unit_discount_amount * c.quantity
            ),
            0
          ) AS total_discount,

          COUNT(DISTINCT p.invoice_number) AS total_invoices,

          COALESCE(
            SUM(pricing.final_unit_price * c.quantity)
            / NULLIF(SUM(c.quantity), 0),
            0
          ) AS average_selling_price

       FROM payments p

       JOIN cart c
         ON p.cart_code = c.cart_code

       JOIN products prod
         ON c.product_id = prod.id

       CROSS JOIN LATERAL (
         SELECT
           CASE
             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'percentage'
               THEN
                 c.price
                 * COALESCE(c.discount, 0)
                 / 100.0

             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'amount'
               THEN COALESCE(c.discount, 0)

             ELSE 0
           END AS unit_discount_amount,

           CASE
             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'percentage'
               THEN
                 c.price
                 - (
                     c.price
                     * COALESCE(c.discount, 0)
                     / 100.0
                   )

             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'amount'
               THEN c.price - COALESCE(c.discount, 0)

             ELSE c.price
           END AS final_unit_price
       ) pricing

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating sales by product report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// SALES BY CASHIER REPORT
// =====================================================
export const getSalesByCashierReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { saleType, startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = `
      WHERE p.store_id = $1
        AND EXISTS (
          SELECT 1
          FROM cart c
          WHERE c.cart_code = p.cart_code
            AND c.status = 'Sold'
        )
    `;

    if (saleType && saleType.toLowerCase() !== 'all') {
      params.push(saleType.toLowerCase());
      where += ` AND LOWER(p.sale_type) = $${params.length}`;
    }

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'p.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          p.user_id AS cashier_id,

          COALESCE(
            u.name,
            'Unknown Cashier'
          ) AS cashier_name,

          COUNT(DISTINCT p.invoice_number) AS total_invoices,

          COALESCE(
            SUM(p.total_amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(p.amount_paid),
            0
          ) AS total_paid,

          COALESCE(
            SUM(p.amount_due),
            0
          ) AS total_due,

          COALESCE(
            SUM(p.total_amount)
              FILTER (
                WHERE LOWER(p.sale_type) = 'cash'
              ),
            0
          ) AS cash_amount,

          COALESCE(
            SUM(p.total_amount)
              FILTER (
                WHERE LOWER(p.sale_type) = 'credit'
              ),
            0
          ) AS credit_amount,

          COUNT(DISTINCT p.invoice_number)
            FILTER (
              WHERE LOWER(p.sale_type) = 'cash'
            ) AS cash_invoices,

          COUNT(DISTINCT p.invoice_number)
            FILTER (
              WHERE LOWER(p.sale_type) = 'credit'
            ) AS credit_invoices,

          COALESCE(
            SUM(p.amount_paid)
              FILTER (
                WHERE LOWER(p.sale_type) = 'cash'
              ),
            0
          ) AS cash_paid,

          COALESCE(
            SUM(p.amount_paid)
              FILTER (
                WHERE LOWER(p.sale_type) = 'credit'
              ),
            0
          ) AS credit_paid,

          COALESCE(
            SUM(p.amount_due)
              FILTER (
                WHERE LOWER(p.sale_type) = 'credit'
              ),
            0
          ) AS credit_due

       FROM payments p

       LEFT JOIN users u
         ON p.user_id = u.id

       ${where}

       GROUP BY
         p.user_id,
         u.name

       ORDER BY
         total_amount DESC,
         cashier_name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT p.user_id) AS total_cashiers,

          COUNT(DISTINCT p.invoice_number) AS total_invoices,

          COALESCE(
            SUM(p.total_amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(p.amount_paid),
            0
          ) AS total_paid,

          COALESCE(
            SUM(p.amount_due),
            0
          ) AS total_due,

          COALESCE(
            SUM(p.total_amount)
              FILTER (
                WHERE LOWER(p.sale_type) = 'cash'
              ),
            0
          ) AS total_cash,

          COALESCE(
            SUM(p.total_amount)
              FILTER (
                WHERE LOWER(p.sale_type) = 'credit'
              ),
            0
          ) AS total_credit,

          COUNT(DISTINCT p.invoice_number)
            FILTER (
              WHERE LOWER(p.sale_type) = 'cash'
            ) AS cash_invoices,

          COUNT(DISTINCT p.invoice_number)
            FILTER (
              WHERE LOWER(p.sale_type) = 'credit'
            ) AS credit_invoices

       FROM payments p

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating sales by cashier report:', err);

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// =====================================================
// SALES BY CUSTOMER REPORT
// =====================================================
export const getSalesByCustomerReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { saleType, startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = `
      WHERE p.store_id = $1
        AND EXISTS (
          SELECT 1
          FROM cart sold_cart
          WHERE sold_cart.cart_code = p.cart_code
            AND sold_cart.status = 'Sold'
        )
    `;

    if (saleType && saleType.toLowerCase() !== 'all') {
      params.push(saleType.toLowerCase());
      where += ` AND LOWER(p.sale_type) = $${params.length}`;
    }

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'p.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `WITH invoice_sales AS (
          SELECT
            p.invoice_number,
            p.cart_code,
            p.sales_date,
            p.sale_type,
            p.total_amount,
            p.amount_paid,
            p.amount_due,
            customer_info.customer_id

          FROM payments p

          LEFT JOIN LATERAL (
            SELECT c.customer_id
            FROM cart c
            WHERE c.cart_code = p.cart_code
              AND c.status = 'Sold'
            ORDER BY c.id ASC
            LIMIT 1
          ) customer_info ON TRUE

          ${where}
       )

       SELECT
          invoice_sales.customer_id,

          COALESCE(
            cust.name,
            'Walk-in Customer'
          ) AS customer_name,

          cust.phone AS customer_phone,

          COUNT(DISTINCT invoice_sales.invoice_number)
            AS total_invoices,

          COALESCE(
            SUM(invoice_sales.total_amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(invoice_sales.amount_paid),
            0
          ) AS total_paid,

          COALESCE(
            SUM(invoice_sales.amount_due),
            0
          ) AS total_due,

          COALESCE(
            SUM(invoice_sales.total_amount)
              FILTER (
                WHERE LOWER(invoice_sales.sale_type) = 'cash'
              ),
            0
          ) AS cash_amount,

          COALESCE(
            SUM(invoice_sales.total_amount)
              FILTER (
                WHERE LOWER(invoice_sales.sale_type) = 'credit'
              ),
            0
          ) AS credit_amount,

          COUNT(DISTINCT invoice_sales.invoice_number)
            FILTER (
              WHERE LOWER(invoice_sales.sale_type) = 'cash'
            ) AS cash_invoices,

          COUNT(DISTINCT invoice_sales.invoice_number)
            FILTER (
              WHERE LOWER(invoice_sales.sale_type) = 'credit'
            ) AS credit_invoices,

          MAX(invoice_sales.sales_date)
            AS last_purchase_date

       FROM invoice_sales

       LEFT JOIN customers cust
         ON invoice_sales.customer_id = cust.id

       GROUP BY
          invoice_sales.customer_id,
          cust.name,
          cust.phone

       ORDER BY
          total_amount DESC,
          customer_name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `WITH invoice_sales AS (
          SELECT
            p.invoice_number,
            p.cart_code,
            p.sales_date,
            p.sale_type,
            p.total_amount,
            p.amount_paid,
            p.amount_due,
            customer_info.customer_id

          FROM payments p

          LEFT JOIN LATERAL (
            SELECT c.customer_id
            FROM cart c
            WHERE c.cart_code = p.cart_code
              AND c.status = 'Sold'
            ORDER BY c.id ASC
            LIMIT 1
          ) customer_info ON TRUE

          ${where}
       )

       SELECT
          COUNT(DISTINCT customer_id)
            FILTER (WHERE customer_id IS NOT NULL)
            AS registered_customers,

          CASE
            WHEN COUNT(*) FILTER (
              WHERE customer_id IS NULL
            ) > 0
            THEN 1
            ELSE 0
          END AS has_walk_in_customer,

          COUNT(DISTINCT invoice_number)
            AS total_invoices,

          COUNT(DISTINCT invoice_number)
            FILTER (WHERE customer_id IS NULL)
            AS walk_in_invoices,

          COUNT(DISTINCT invoice_number)
            FILTER (WHERE customer_id IS NOT NULL)
            AS registered_customer_invoices,

          COALESCE(
            SUM(total_amount),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(amount_paid),
            0
          ) AS total_paid,

          COALESCE(
            SUM(amount_due),
            0
          ) AS total_outstanding,

          COALESCE(
            SUM(total_amount)
              FILTER (
                WHERE LOWER(sale_type) = 'cash'
              ),
            0
          ) AS total_cash,

          COALESCE(
            SUM(total_amount)
              FILTER (
                WHERE LOWER(sale_type) = 'credit'
              ),
            0
          ) AS total_credit

       FROM invoice_sales`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating sales by customer report:', err);

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// =====================================================
// SALES BY CATEGORY REPORT
// =====================================================
export const getSalesByCategoryReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { saleType, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = `WHERE p.store_id = $1 AND c.status = 'Sold'`;

    if (saleType && saleType.toLowerCase() !== 'all') {
      params.push(saleType.toLowerCase());
      where += ` AND LOWER(p.sale_type) = $${params.length}`;
    }

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'p.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          cat.id AS category_id,

          COALESCE(
            cat.name,
            'Uncategorized'
          ) AS category_name,

          COUNT(DISTINCT prod.id) AS total_products,

          COALESCE(
            SUM(c.quantity),
            0
          ) AS total_quantity,

          COALESCE(
            SUM(
              pricing.final_unit_price * c.quantity
            ),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(
              pricing.unit_discount_amount * c.quantity
            ),
            0
          ) AS total_discount,

          COUNT(DISTINCT p.invoice_number)
            AS invoice_count,

          COALESCE(
            SUM(c.price * c.quantity)
            / NULLIF(SUM(c.quantity), 0),
            0
          ) AS avg_original_price,

          COALESCE(
            SUM(
              pricing.final_unit_price * c.quantity
            )
            / NULLIF(SUM(c.quantity), 0),
            0
          ) AS avg_selling_price

       FROM payments p

       JOIN cart c
         ON p.cart_code = c.cart_code

       JOIN products prod
         ON c.product_id = prod.id

       LEFT JOIN product_categories cat
         ON prod.category_id = cat.id

       CROSS JOIN LATERAL (
         SELECT
           CASE
             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'percentage'
               THEN
                 c.price
                 * COALESCE(c.discount, 0)
                 / 100.0

             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'amount'
               THEN COALESCE(c.discount, 0)

             ELSE 0
           END AS unit_discount_amount,

           CASE
             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'percentage'
               THEN
                 c.price
                 - (
                     c.price
                     * COALESCE(c.discount, 0)
                     / 100.0
                   )

             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'amount'
               THEN
                 c.price - COALESCE(c.discount, 0)

             ELSE c.price
           END AS final_unit_price
       ) pricing

       ${where}

       GROUP BY
         cat.id,
         cat.name

       ORDER BY
         total_revenue DESC,
         category_name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT cat.id)
            AS registered_categories,

          CASE
            WHEN COUNT(*) FILTER (
              WHERE cat.id IS NULL
            ) > 0
            THEN 1
            ELSE 0
          END AS has_uncategorized,

          COUNT(DISTINCT prod.category_id)
            +
          CASE
            WHEN COUNT(*) FILTER (
              WHERE prod.category_id IS NULL
            ) > 0
            THEN 1
            ELSE 0
          END AS total_categories,

          COUNT(DISTINCT prod.id)
            AS total_products,

          COALESCE(
            SUM(c.quantity),
            0
          ) AS total_quantity,

          COALESCE(
            SUM(
              pricing.final_unit_price * c.quantity
            ),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(
              pricing.unit_discount_amount * c.quantity
            ),
            0
          ) AS total_discount,

          COUNT(DISTINCT p.invoice_number)
            AS total_invoices,

          COALESCE(
            SUM(
              pricing.final_unit_price * c.quantity
            )
            / NULLIF(SUM(c.quantity), 0),
            0
          ) AS average_selling_price

       FROM payments p

       JOIN cart c
         ON p.cart_code = c.cart_code

       JOIN products prod
         ON c.product_id = prod.id

       LEFT JOIN product_categories cat
         ON prod.category_id = cat.id

       CROSS JOIN LATERAL (
         SELECT
           CASE
             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'percentage'
               THEN
                 c.price
                 * COALESCE(c.discount, 0)
                 / 100.0

             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'amount'
               THEN COALESCE(c.discount, 0)

             ELSE 0
           END AS unit_discount_amount,

           CASE
             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'percentage'
               THEN
                 c.price
                 - (
                     c.price
                     * COALESCE(c.discount, 0)
                     / 100.0
                   )

             WHEN LOWER(COALESCE(c.discount_mode, '')) = 'amount'
               THEN
                 c.price - COALESCE(c.discount, 0)

             ELSE c.price
           END AS final_unit_price
       ) pricing

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error(
      'Error generating sales by category report:',
      err,
    );

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// =====================================================
// SALES BY PAYMENT METHOD REPORT
// =====================================================
export const getSalesByPaymentMethodReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = `
      WHERE p.store_id = $1
        AND EXISTS (
          SELECT 1
          FROM cart c
          WHERE c.cart_code = p.cart_code
            AND c.status = 'Sold'
        )
    `;

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'p.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          COALESCE(
            NULLIF(TRIM(p.payment_method), ''),
            'Unknown'
          ) AS payment_method,

          COUNT(DISTINCT p.invoice_number)
            AS total_invoices,

          COALESCE(
            SUM(p.total_amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(p.amount_paid),
            0
          ) AS total_paid,

          COALESCE(
            SUM(p.amount_due),
            0
          ) AS total_due,

          COALESCE(
            SUM(p.amount_paid)
            / NULLIF(COUNT(DISTINCT p.invoice_number), 0),
            0
          ) AS average_paid_per_invoice

       FROM payments p

       ${where}

       GROUP BY
          COALESCE(
            NULLIF(TRIM(p.payment_method), ''),
            'Unknown'
          )

       ORDER BY
          total_paid DESC,
          payment_method ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(
            DISTINCT COALESCE(
              NULLIF(TRIM(p.payment_method), ''),
              'Unknown'
            )
          ) AS total_methods,

          COUNT(DISTINCT p.invoice_number)
            AS total_invoices,

          COALESCE(
            SUM(p.total_amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(p.amount_paid),
            0
          ) AS total_paid,

          COALESCE(
            SUM(p.amount_due),
            0
          ) AS total_due,

          COALESCE(
            SUM(p.amount_paid)
            / NULLIF(COUNT(DISTINCT p.invoice_number), 0),
            0
          ) AS average_paid_per_invoice

       FROM payments p

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error(
      'Error generating sales by payment method report:',
      err,
    );

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// =====================================================
// SALES DEBITS REPORT (outstanding credit invoices)
// =====================================================
export const getSalesDebitsReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = `
      WHERE p.store_id = $1
        AND COALESCE(p.amount_due, 0) > 0
        AND EXISTS (
          SELECT 1
          FROM cart sold_cart
          WHERE sold_cart.cart_code = p.cart_code
            AND sold_cart.status = 'Sold'
        )
    `;

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'p.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          p.invoice_number,
          p.sales_date,

          customer_info.customer_id,

          COALESCE(
            cust.name,
            'Walk-in Customer'
          ) AS customer_name,

          cust.phone AS customer_phone,

          COALESCE(
            u.name,
            'Unknown Cashier'
          ) AS cashier_name,

          COALESCE(
            p.total_amount,
            0
          ) AS total_amount,

          COALESCE(
            p.amount_paid,
            0
          ) AS amount_paid,

          COALESCE(
            p.amount_due,
            0
          ) AS amount_due,

          GREATEST(
            0,
            FLOOR(
              EXTRACT(
                EPOCH FROM (CURRENT_TIMESTAMP - p.sales_date)
              ) / 86400
            )::int
          ) AS days_outstanding,

          CASE
            WHEN CURRENT_TIMESTAMP - p.sales_date > INTERVAL '90 days'
              THEN 'over_90_days'

            WHEN CURRENT_TIMESTAMP - p.sales_date > INTERVAL '60 days'
              THEN '61_to_90_days'

            WHEN CURRENT_TIMESTAMP - p.sales_date > INTERVAL '30 days'
              THEN '31_to_60_days'

            ELSE '0_to_30_days'
          END AS aging_group

       FROM payments p

       LEFT JOIN LATERAL (
          SELECT c.customer_id
          FROM cart c
          WHERE c.cart_code = p.cart_code
            AND c.status = 'Sold'
          ORDER BY c.created_at ASC NULLS LAST, c.id ASC
          LIMIT 1
       ) customer_info ON TRUE

       LEFT JOIN customers cust
         ON customer_info.customer_id = cust.id

       LEFT JOIN users u
         ON p.user_id = u.id

       ${where}

       ORDER BY
         p.amount_due DESC,
         p.sales_date ASC,
         p.invoice_number ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `WITH debit_invoices AS (
          SELECT
            p.invoice_number,
            p.sales_date,
            COALESCE(p.amount_due, 0) AS amount_due,
            customer_info.customer_id

          FROM payments p

          LEFT JOIN LATERAL (
            SELECT c.customer_id
            FROM cart c
            WHERE c.cart_code = p.cart_code
              AND c.status = 'Sold'
            ORDER BY c.created_at ASC NULLS LAST, c.id ASC
            LIMIT 1
          ) customer_info ON TRUE

          ${where}
       )

       SELECT
          COUNT(DISTINCT customer_id)
            FILTER (
              WHERE customer_id IS NOT NULL
            ) AS registered_debtors,

          CASE
            WHEN COUNT(*) FILTER (
              WHERE customer_id IS NULL
            ) > 0
            THEN 1
            ELSE 0
          END AS has_walk_in_debtor,

          COUNT(DISTINCT customer_id)
            FILTER (
              WHERE customer_id IS NOT NULL
            )
          +
          CASE
            WHEN COUNT(*) FILTER (
              WHERE customer_id IS NULL
            ) > 0
            THEN 1
            ELSE 0
          END AS total_debtors,

          COUNT(DISTINCT invoice_number)
            AS total_invoices,

          COALESCE(
            SUM(amount_due),
            0
          ) AS total_outstanding,

          COUNT(DISTINCT invoice_number)
            FILTER (
              WHERE CURRENT_TIMESTAMP - sales_date > INTERVAL '30 days'
            ) AS overdue_invoices,

          COALESCE(
            SUM(amount_due)
              FILTER (
                WHERE CURRENT_TIMESTAMP - sales_date > INTERVAL '30 days'
              ),
            0
          ) AS overdue_amount,

          COALESCE(
            SUM(amount_due)
              FILTER (
                WHERE CURRENT_TIMESTAMP - sales_date <= INTERVAL '30 days'
              ),
            0
          ) AS current_amount,

          COALESCE(
            SUM(amount_due)
              FILTER (
                WHERE CURRENT_TIMESTAMP - sales_date > INTERVAL '90 days'
              ),
            0
          ) AS over_90_days_amount

       FROM debit_invoices`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error(
      'Error generating sales debits report:',
      err,
    );

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// =====================================================
// PURCHASES DETAILED REPORT (PO line-item level)
// =====================================================
export const getPurchasesDetailedReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { status, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE po.store_id = $1';

    if (status && status !== 'all') {
      params.push(status);
      where += ` AND po.status = $${params.length}`;
    }

    where += toDateClause({ startDate, endDate, columnAlias: 'po.order_date', params });

    const dataResult = await pool.query(
      `SELECT
          po.po_number,
          po.order_date,
          po.status,
          s.name                                AS supplier_name,
          p.name                                AS product_name,
          cat.name                              AS category_name,
          p.unit,
          poi.quantity,
          poi.unit_price,
          poi.tax_rate,
          COALESCE(poi.discount_percent, 0)     AS discount_percent,
          poi.line_total,
          u.name                                AS created_by_name
       FROM purchase_orders po
       JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       JOIN products p               ON poi.product_id = p.id
       LEFT JOIN product_categories cat ON p.category_id = cat.id
       LEFT JOIN suppliers s         ON po.supplier_id = s.id
       LEFT JOIN users u             ON po.created_by = u.id
       ${where}
       ORDER BY po.order_date DESC, po.po_number DESC, p.name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT po.id)                 AS total_orders,
          COUNT(poi.id)                         AS total_line_items,
          COALESCE(SUM(poi.quantity), 0)        AS total_quantity,
          COALESCE(SUM(poi.line_total), 0)      AS total_cost
       FROM purchase_orders po
       JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating purchases detailed report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// PURCHASES BY PRODUCT REPORT
// =====================================================
export const getPurchasesByProductReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { status, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE po.store_id = $1';

    if (status && status !== 'all') {
      params.push(status);
      where += ` AND po.status = $${params.length}`;
    }

    where += toDateClause({ startDate, endDate, columnAlias: 'po.order_date', params });

    const dataResult = await pool.query(
      `SELECT
          p.name                                AS product_name,
          cat.name                              AS category_name,
          p.unit,
          COALESCE(SUM(poi.quantity), 0)        AS total_quantity,
          COALESCE(AVG(poi.unit_price), 0)      AS avg_unit_price,
          COUNT(DISTINCT po.id)                 AS order_count,
          COALESCE(SUM(poi.line_total), 0)      AS total_cost
       FROM purchase_orders po
       JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       JOIN products p               ON poi.product_id = p.id
       LEFT JOIN product_categories cat ON p.category_id = cat.id
       ${where}
       GROUP BY p.id, p.name, p.unit, cat.name
       ORDER BY total_cost DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT p.id)                  AS total_products,
          COALESCE(SUM(poi.quantity), 0)        AS total_quantity,
          COUNT(DISTINCT po.id)                 AS total_orders,
          COALESCE(SUM(poi.line_total), 0)      AS total_cost
       FROM purchase_orders po
       JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       JOIN products p               ON poi.product_id = p.id
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating purchases by product report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// PURCHASES BY SUPPLIER REPORT
// =====================================================
export const getPurchasesBySupplierReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE po.store_id = $1';

    where += toDateClause({ startDate, endDate, columnAlias: 'po.order_date', params });

    const dataResult = await pool.query(
      `SELECT
          s.name                                AS supplier_name,
          s.phone                               AS supplier_phone,
          COUNT(DISTINCT po.id)                 AS total_orders,
          COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'received') AS completed_orders,
          COALESCE(SUM(po.total_amount), 0)     AS total_amount,
          COALESCE(AVG(po.total_amount), 0)     AS avg_order_value,
          MAX(po.order_date)                    AS last_order_date
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       ${where}
       GROUP BY s.id, s.name, s.phone
       ORDER BY total_amount DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT po.supplier_id)        AS total_suppliers,
          COUNT(DISTINCT po.id)                 AS total_orders,
          COALESCE(SUM(po.total_amount), 0)     AS total_amount
       FROM purchase_orders po
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating purchases by supplier report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// SUPPLIER PAYABLE REPORT (unpaid/partial invoices)
// =====================================================
export const getSupplierPayableReport = async (req, res) => {
  const storeId = req.user.current_store_id;

  try {
    const params = [storeId];

    const dataResult = await pool.query(
      `SELECT
          s.name                                AS supplier_name,
          s.phone                               AS supplier_phone,
          COUNT(si.id)                          AS total_invoices,
          COALESCE(SUM(si.total_amount), 0)     AS total_invoiced,
          COALESCE(SUM(si.amount_paid), 0)      AS total_paid,
          COALESCE(SUM(COALESCE(si.balance_due, si.total_amount - si.amount_paid)), 0) AS total_outstanding,
          COUNT(si.id) FILTER (WHERE si.due_date < CURRENT_DATE AND si.payment_status != 'paid') AS overdue_count,
          MIN(si.due_date) FILTER (WHERE si.due_date < CURRENT_DATE AND si.payment_status != 'paid') AS oldest_due_date
       FROM supplier_invoices si
       JOIN suppliers s ON si.supplier_id = s.id
       WHERE si.store_id = $1 AND si.payment_status != 'paid'
       GROUP BY s.id, s.name, s.phone
       ORDER BY total_outstanding DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT si.supplier_id)        AS total_suppliers,
          COUNT(si.id)                          AS total_invoices,
          COALESCE(SUM(si.total_amount), 0)     AS total_invoiced,
          COALESCE(SUM(si.amount_paid), 0)      AS total_paid,
          COALESCE(SUM(COALESCE(si.balance_due, si.total_amount - si.amount_paid)), 0) AS total_outstanding
       FROM supplier_invoices si
       WHERE si.store_id = $1 AND si.payment_status != 'paid'`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating supplier payable report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// PURCHASE INVOICE REPORT (supplier invoices)
// =====================================================
export const getPurchaseInvoiceReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { paymentStatus, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE si.store_id = $1';

    if (paymentStatus && paymentStatus !== 'all') {
      params.push(paymentStatus);
      where += ` AND si.payment_status = $${params.length}`;
    }

    where += toDateClause({ startDate, endDate, columnAlias: 'si.invoice_date', params });

    const dataResult = await pool.query(
      `SELECT
          si.bill_number,
          si.supplier_invoice_number,
          si.invoice_date,
          si.due_date,
          s.name                                AS supplier_name,
          po.po_number,
          si.total_amount,
          si.amount_paid,
          COALESCE(si.balance_due, si.total_amount - si.amount_paid) AS balance_due,
          si.payment_status,
          si.status,
          CASE WHEN si.due_date < CURRENT_DATE AND si.payment_status != 'paid'
               THEN true ELSE false END         AS is_overdue
       FROM supplier_invoices si
       LEFT JOIN suppliers s        ON si.supplier_id = s.id
       LEFT JOIN purchase_orders po ON si.purchase_order_id = po.id
       ${where}
       ORDER BY si.invoice_date DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(si.id)                          AS total_invoices,
          COALESCE(SUM(si.total_amount), 0)     AS total_amount,
          COALESCE(SUM(si.amount_paid), 0)      AS total_paid,
          COALESCE(SUM(COALESCE(si.balance_due, si.total_amount - si.amount_paid)), 0) AS total_outstanding
       FROM supplier_invoices si
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating purchase invoice report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// PURCHASE RETURNS REPORT (supplier returns)
// =====================================================
export const getPurchaseReturnsReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { status, startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE sr.store_id = $1';

    if (status && status !== 'all') {
      params.push(status);
      where += ` AND sr.status = $${params.length}`;
    }

    where += toDateClause({ startDate, endDate, columnAlias: 'sr.created_at', params });

    const dataResult = await pool.query(
      `SELECT
          sr.return_number,
          sr.return_date,
          sr.return_reason,
          sr.status,
          sr.total_value,
          s.name                                AS supplier_name,
          grn.grn_number,
          u.name                                AS created_by_name
       FROM supplier_returns sr
       LEFT JOIN suppliers s              ON sr.supplier_id = s.id
       LEFT JOIN goods_received_notes grn ON sr.grn_id = grn.id
       LEFT JOIN users u                  ON sr.created_by = u.id
       ${where}
       ORDER BY sr.created_at DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(sr.id)                          AS total_returns,
          COALESCE(SUM(sr.total_value), 0)      AS total_value,
          COUNT(sr.id) FILTER (WHERE sr.status = 'approved') AS approved_returns,
          COUNT(sr.id) FILTER (WHERE sr.status = 'pending')  AS pending_returns
       FROM supplier_returns sr
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating purchase returns report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// PURCHASE TRENDS REPORT (daily PO totals)
// =====================================================
export const getPurchaseTrendsReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE po.store_id = $1';

    where += toDateClause({ startDate, endDate, columnAlias: 'po.order_date', params });

    const dataResult = await pool.query(
      `SELECT
          DATE(po.order_date)                   AS order_date,
          COUNT(po.id)                          AS total_orders,
          COALESCE(SUM(po.total_amount), 0)     AS total_amount,
          COUNT(po.id) FILTER (WHERE po.status = 'received') AS received_orders,
          COALESCE(AVG(po.total_amount), 0)     AS avg_order_value
       FROM purchase_orders po
       ${where}
       GROUP BY DATE(po.order_date)
       ORDER BY order_date DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT DATE(po.order_date))   AS total_days,
          COUNT(po.id)                          AS total_orders,
          COALESCE(SUM(po.total_amount), 0)     AS total_amount,
          COALESCE(AVG(po.total_amount), 0)     AS avg_order_value
       FROM purchase_orders po
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating purchase trends report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// STOCK REPLENISHMENT REPORT
// =====================================================
export const getStockReplenishmentReport = async (req, res) => {
  const storeId = req.user.current_store_id;

  try {
    const params = [storeId];

    const stockCte = `
      WITH product_stock AS (
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.minimum_stock,
          p.unit,
          cat.name AS category_name,
          COALESCE(SUM(
            CASE WHEN im.type = 'IN'  THEN im.quantity
                 WHEN im.type = 'OUT' THEN -im.quantity
                 ELSE 0 END
          ), 0) AS current_stock,
          MAX(ib.cost_price) FILTER (WHERE ib.cost_price IS NOT NULL) AS last_cost_price
        FROM products p
        LEFT JOIN product_categories cat ON p.category_id = cat.id
        LEFT JOIN inventory_batches ib   ON ib.product_id = p.id AND ib.store_id = p.store_id
        LEFT JOIN inventory_movements im ON im.batch_id = ib.id
        WHERE p.store_id = $1
        GROUP BY p.id, p.name, p.minimum_stock, p.unit, cat.name
      )
    `;

    const dataResult = await pool.query(
      `${stockCte}
       SELECT
          ps.product_id,
          ps.product_name,
          ps.category_name,
          ps.unit,
          ps.minimum_stock,
          ps.current_stock,
          GREATEST(0, ps.minimum_stock - ps.current_stock)           AS shortage_qty,
          COALESCE(ps.last_cost_price, 0)                             AS last_cost_price,
          GREATEST(0, ps.minimum_stock - ps.current_stock)
            * COALESCE(ps.last_cost_price, 0)                        AS estimated_cost,
          (SELECT s.name FROM suppliers s
           JOIN purchase_orders po   ON po.supplier_id = s.id
           JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
           WHERE poi.product_id = ps.product_id AND po.store_id = $1
           ORDER BY po.order_date DESC LIMIT 1)                      AS last_supplier
       FROM product_stock ps
       WHERE ps.current_stock <= ps.minimum_stock
       ORDER BY shortage_qty DESC, ps.product_name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `${stockCte}
       SELECT
          COUNT(*)                                                    AS total_products,
          COUNT(*) FILTER (WHERE current_stock <= 0)                  AS out_of_stock,
          COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= minimum_stock) AS low_stock,
          COALESCE(SUM(
            GREATEST(0, minimum_stock - current_stock) * COALESCE(last_cost_price, 0)
          ), 0)                                                       AS estimated_reorder_cost
       FROM product_stock
       WHERE current_stock <= minimum_stock`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating stock replenishment report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// COST ANALYSIS REPORT
// =====================================================
export const getPurchaseCostAnalysisReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE po.store_id = $1';

    where += toDateClause({ startDate, endDate, columnAlias: 'po.order_date', params });

    const dataResult = await pool.query(
      `SELECT
          po.po_number,
          po.order_date,
          s.name                                AS supplier_name,
          po.subtotal,
          po.tax_amount,
          po.discount_amount,
          po.total_amount,
          COALESCE(si.tax_amount, 0)            AS invoice_tax,
          COALESCE(si.shipping_cost, 0)         AS shipping_cost,
          COALESCE(si.other_charges, 0)         AS other_charges,
          COALESCE(si.total_amount, po.total_amount) AS invoiced_amount,
          po.status
       FROM purchase_orders po
       LEFT JOIN suppliers s         ON po.supplier_id = s.id
       LEFT JOIN supplier_invoices si ON si.purchase_order_id = po.id
       ${where}
       ORDER BY po.order_date DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(po.id)                          AS total_orders,
          COALESCE(SUM(po.subtotal), 0)         AS total_subtotal,
          COALESCE(SUM(po.tax_amount), 0)       AS total_tax,
          COALESCE(SUM(po.discount_amount), 0)  AS total_discount,
          COALESCE(SUM(po.total_amount), 0)     AS total_amount,
          COALESCE(SUM(si.shipping_cost), 0)    AS total_shipping,
          COALESCE(SUM(si.other_charges), 0)    AS total_other_charges
       FROM purchase_orders po
       LEFT JOIN supplier_invoices si ON si.purchase_order_id = po.id
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating purchase cost analysis report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// SUPPLIER PERFORMANCE REPORT
// =====================================================
export const getSupplierPerformanceReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let dateFilter = '';

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND DATE(po.order_date) >= $${params.length}::date`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND DATE(po.order_date) <= $${params.length}::date`;
    }

    const dataResult = await pool.query(
      `SELECT
          s.name                                AS supplier_name,
          s.phone                               AS supplier_phone,
          COUNT(DISTINCT po.id)                 AS total_orders,
          COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'received') AS received_orders,
          ROUND(
            COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'received') * 100.0
            / NULLIF(COUNT(DISTINCT po.id), 0), 1
          )                                     AS completion_rate,
          ROUND(AVG(
            EXTRACT(DAY FROM grn.received_date::timestamp - po.order_date::timestamp)
          )::numeric, 1)                        AS avg_lead_days,
          COUNT(DISTINCT sr.id)                 AS total_returns,
          COALESCE(SUM(sr.total_value), 0)      AS total_returned_value
       FROM suppliers s
       LEFT JOIN purchase_orders po ON po.supplier_id = s.id
         AND po.store_id = $1 ${dateFilter}
       LEFT JOIN goods_received_notes grn ON grn.purchase_order_id = po.id
       LEFT JOIN supplier_returns sr ON sr.supplier_id = s.id AND sr.store_id = $1
       WHERE s.store_id = $1
       GROUP BY s.id, s.name, s.phone
       ORDER BY total_orders DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT s.id)                  AS total_suppliers,
          COUNT(DISTINCT po.id)                 AS total_orders,
          ROUND(
            COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'received') * 100.0
            / NULLIF(COUNT(DISTINCT po.id), 0), 1
          )                                     AS avg_completion_rate,
          COALESCE(SUM(sr.total_value), 0)      AS total_returned_value
       FROM suppliers s
       LEFT JOIN purchase_orders po ON po.supplier_id = s.id
         AND po.store_id = $1 ${dateFilter}
       LEFT JOIN supplier_returns sr ON sr.supplier_id = s.id AND sr.store_id = $1
       WHERE s.store_id = $1`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating supplier performance report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// GRN REPORT (Goods Received Notes)
// =====================================================
export const getGrnReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE grn.store_id = $1';

    where += toDateClause({ startDate, endDate, columnAlias: 'grn.received_date', params });

    const dataResult = await pool.query(
      `SELECT
          grn.grn_number,
          grn.received_date,
          grn.status,
          po.po_number,
          s.name                                AS supplier_name,
          COUNT(gi.id)                          AS item_count,
          COALESCE(SUM(gi.received_quantity), 0)         AS total_quantity,
          COALESCE(SUM(gi.line_total), 0)      AS total_value,
          u.name                                AS received_by_name
       FROM goods_received_notes grn
       JOIN purchase_orders po        ON grn.purchase_order_id = po.id
       LEFT JOIN suppliers s          ON po.supplier_id = s.id
       LEFT JOIN grn_items gi         ON gi.grn_id = grn.id
       LEFT JOIN users u              ON grn.received_by = u.id
       ${where}
       GROUP BY grn.id, grn.grn_number, grn.received_date, grn.status,
                po.po_number, s.name, u.name
       ORDER BY grn.received_date DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT grn.id)                AS total_grns,
          COALESCE(SUM(gi.received_quantity), 0)         AS total_quantity,
          COALESCE(SUM(gi.line_total), 0)      AS total_value
       FROM goods_received_notes grn
       LEFT JOIN grn_items gi ON gi.grn_id = grn.id
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating GRN report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// INVENTORY REPORTS
// =====================================================

const inventoryStockCTE = (storeId) => `
  WITH stock AS (
    SELECT
      p.id                AS product_id,
      p.name              AS product_name,
      p.unit,
      p.minimum_stock,
      c.name              AS category_name,
      COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE 0 END), 0)  AS total_in,
      COALESCE(SUM(CASE WHEN im.type = 'OUT' THEN im.quantity ELSE 0 END), 0) AS total_out,
      COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity WHEN im.type = 'OUT' THEN -im.quantity ELSE 0 END), 0) AS current_stock,
      MAX(ib.cost_price) FILTER (WHERE ib.cost_price IS NOT NULL) AS cost_price
    FROM products p
    LEFT JOIN product_categories c ON p.category_id = c.id
    LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.store_id = $1
    LEFT JOIN inventory_movements im ON im.batch_id = ib.id
    WHERE p.store_id = $1
    GROUP BY p.id, p.name, p.unit, p.minimum_stock, c.name
  )
`;

// 1. Stock Summary
export const getStockSummaryReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate, categoryId } = req.query;
  try {
    const params = [storeId];
    const cte = inventoryStockCTE(storeId);

    let havingWhere = 'WHERE 1=1';
    if (categoryId) {
      // filter by category name since we only have name in CTE
    }

    const dataResult = await pool.query(
      `${cte}
       SELECT *, COALESCE(current_stock, 0) * COALESCE(cost_price, 0) AS stock_value
       FROM stock
       ORDER BY product_name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `${cte}
       SELECT
         COUNT(*)                                                              AS total_products,
         COALESCE(SUM(total_in), 0)                                           AS total_in,
         COALESCE(SUM(total_out), 0)                                          AS total_out,
         COALESCE(SUM(current_stock), 0)                                      AS total_current_stock,
         COALESCE(SUM(current_stock * COALESCE(cost_price, 0)), 0)            AS total_stock_value
       FROM stock`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating stock summary report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 2. Current Stock Summary (point-in-time, same as getInventoryReport but richer)
export const getCurrentStockSummaryReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { stockState = 'all', categoryId } = req.query;
  try {
    const params = [storeId];
    const cte = inventoryStockCTE(storeId);

    let filter = 'WHERE 1=1';
    if (stockState === 'in_stock') filter += ' AND s.current_stock > s.minimum_stock';
    if (stockState === 'low_stock') filter += ' AND s.current_stock > 0 AND s.current_stock <= s.minimum_stock';
    if (stockState === 'out_of_stock') filter += ' AND s.current_stock <= 0';

    const dataResult = await pool.query(
      `${cte}
       SELECT s.*, COALESCE(s.current_stock, 0) * COALESCE(s.cost_price, 0) AS stock_value
       FROM stock s
       ${filter}
       ORDER BY s.product_name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `${cte}
       SELECT
         COUNT(*)                                                           AS total_products,
         COUNT(*) FILTER (WHERE current_stock > 0)                        AS in_stock,
         COUNT(*) FILTER (WHERE current_stock <= 0)                       AS out_of_stock,
         COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= minimum_stock) AS low_stock,
         COALESCE(SUM(current_stock * COALESCE(cost_price, 0)), 0)        AS total_value
       FROM stock`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating current stock summary report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 3. Current Stock Detailed (batch level)
export const getCurrentStockDetailedReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  try {
    const params = [storeId];

    const dataResult = await pool.query(
      `SELECT
         ib.batch_number,
         p.name           AS product_name,
         c.name           AS category_name,
         p.unit,
         ib.cost_price,
         ib.selling_price,
         ib.manufacturing_date,
         ib.expiry_date,
         ib.status        AS batch_status,
         COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity WHEN im.type = 'OUT' THEN -im.quantity ELSE 0 END), 0) AS batch_quantity,
         COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity WHEN im.type = 'OUT' THEN -im.quantity ELSE 0 END), 0)
           * COALESCE(ib.cost_price, 0) AS batch_value,
         ib.created_at
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       LEFT JOIN product_categories c ON p.category_id = c.id
       LEFT JOIN inventory_movements im ON im.batch_id = ib.id
       WHERE ib.store_id = $1
       GROUP BY ib.id, ib.batch_number, p.name, c.name, p.unit,
                ib.cost_price, ib.selling_price, ib.manufacturing_date,
                ib.expiry_date, ib.status, ib.created_at
       ORDER BY p.name ASC, ib.created_at ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(DISTINCT ib.id)                                              AS total_batches,
         COUNT(DISTINCT ib.product_id)                                      AS total_products,
         COALESCE(SUM(
           CASE WHEN im.type = 'IN' THEN im.quantity
                WHEN im.type = 'OUT' THEN -im.quantity ELSE 0 END
         ), 0)                                                              AS total_quantity,
         COALESCE(SUM(
           (CASE WHEN im.type = 'IN' THEN im.quantity
                 WHEN im.type = 'OUT' THEN -im.quantity ELSE 0 END)
           * COALESCE(ib.cost_price, 0)
         ), 0)                                                              AS total_value
       FROM inventory_batches ib
       LEFT JOIN inventory_movements im ON im.batch_id = ib.id
       WHERE ib.store_id = $1`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating current stock detailed report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 4. Product Ledger (movements per product with running balance)
export const getProductLedgerReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate, productId } = req.query;

  try {
    const params = [storeId];
    let where = 'WHERE im.store_id = $1';

    if (productId) {
      params.push(productId);
      where += ` AND im.product_id = $${params.length}`;
    }

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'im.created_at',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
         im.id,
         im.created_at,
         p.name AS product_name,
         c.name AS category_name,
         ib.batch_number,
         im.type AS movement_type,
         im.quantity,
         im.note,
         u.name AS created_by_name,

         SUM(
           CASE
             WHEN im.type = 'IN' THEN im.quantity
             WHEN im.type = 'OUT' THEN -im.quantity
             ELSE 0
           END
         ) OVER (
           PARTITION BY im.product_id
           ORDER BY im.created_at ASC, im.id ASC
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS running_balance

       FROM inventory_movements im
       JOIN products p
         ON p.id = im.product_id
       LEFT JOIN product_categories c
         ON c.id = p.category_id
       LEFT JOIN inventory_batches ib
         ON ib.id = im.batch_id
       LEFT JOIN users u
         ON u.id = im.created_by

       ${where}

       ORDER BY im.created_at DESC, im.id DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) AS total_movements,

         COALESCE(
           SUM(quantity) FILTER (WHERE type = 'IN'),
           0
         ) AS total_in,

         COALESCE(
           SUM(quantity) FILTER (WHERE type = 'OUT'),
           0
         ) AS total_out,

         COUNT(DISTINCT product_id) AS total_products

       FROM inventory_movements im

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating product ledger report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 5. Out of Stock
export const getOutOfStockReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  try {
    const params = [storeId];
    const cte = inventoryStockCTE(storeId);

    const dataResult = await pool.query(
      `${cte}
       SELECT s.*
       FROM stock s
       WHERE s.current_stock <= 0
       ORDER BY s.product_name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `${cte}
       SELECT
         COUNT(*) FILTER (WHERE current_stock <= 0)   AS total_products,
         COUNT(DISTINCT category_name)                 AS total_categories
       FROM stock`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating out of stock report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 6. Outgoing Stock
export const getOutgoingStockReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;
  try {
    const params = [storeId];
    let where = `WHERE im.store_id = $1 AND im.type = 'OUT'`;
    where += toDateClause({ startDate, endDate, columnAlias: 'im.created_at', params });

    const dataResult = await pool.query(
      `SELECT
         im.created_at,
         p.name           AS product_name,
         c.name           AS category_name,
         p.unit,
         ib.batch_number,
         im.quantity,
         im.note,
         u.name           AS created_by_name,
         COALESCE(ib.cost_price, 0) * im.quantity AS total_value
       FROM inventory_movements im
       JOIN products p ON p.id = im.product_id
       LEFT JOIN product_categories c ON p.category_id = c.id
       LEFT JOIN inventory_batches ib ON ib.id = im.batch_id
       LEFT JOIN users u ON u.id = im.created_by
       ${where}
       ORDER BY im.created_at DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*)                                                      AS total_movements,
         COALESCE(SUM(im.quantity), 0)                                AS total_quantity,
         COUNT(DISTINCT im.product_id)                                AS total_products,
         COALESCE(SUM(im.quantity * COALESCE(ib.cost_price, 0)), 0)  AS total_value
       FROM inventory_movements im
       LEFT JOIN inventory_batches ib ON ib.id = im.batch_id
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating outgoing stock report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 7. Incoming Stock
export const getIncomingStockReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;
  try {
    const params = [storeId];
    let where = `WHERE im.store_id = $1 AND im.type = 'IN'`;
    where += toDateClause({ startDate, endDate, columnAlias: 'im.created_at', params });

    const dataResult = await pool.query(
      `SELECT
         im.created_at,
         p.name           AS product_name,
         c.name           AS category_name,
         p.unit,
         ib.batch_number,
         ib.expiry_date,
         im.quantity,
         COALESCE(ib.cost_price, 0)                AS cost_price,
         COALESCE(ib.cost_price, 0) * im.quantity  AS total_value,
         im.note,
         u.name           AS created_by_name
       FROM inventory_movements im
       JOIN products p ON p.id = im.product_id
       LEFT JOIN product_categories c ON p.category_id = c.id
       LEFT JOIN inventory_batches ib ON ib.id = im.batch_id
       LEFT JOIN users u ON u.id = im.created_by
       ${where}
       ORDER BY im.created_at DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*)                                                      AS total_movements,
         COALESCE(SUM(im.quantity), 0)                                AS total_quantity,
         COUNT(DISTINCT im.product_id)                                AS total_products,
         COALESCE(SUM(im.quantity * COALESCE(ib.cost_price, 0)), 0)  AS total_value
       FROM inventory_movements im
       LEFT JOIN inventory_batches ib ON ib.id = im.batch_id
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating incoming stock report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 8. Fast Moving Products
export const getFastMovingProductsReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;
  try {
    const params = [storeId];
    let where = `WHERE im.store_id = $1 AND im.type = 'OUT'`;
    where += toDateClause({ startDate, endDate, columnAlias: 'im.created_at', params });

    const dataResult = await pool.query(
      `SELECT
         p.id             AS product_id,
         p.name           AS product_name,
         c.name           AS category_name,
         p.unit,
         COUNT(DISTINCT im.id)                                        AS movement_count,
         COALESCE(SUM(im.quantity), 0)                                AS total_quantity,
         COALESCE(SUM(im.quantity * COALESCE(ib.cost_price, 0)), 0)  AS total_value
       FROM inventory_movements im
       JOIN products p ON p.id = im.product_id
       LEFT JOIN product_categories c ON p.category_id = c.id
       LEFT JOIN inventory_batches ib ON ib.id = im.batch_id
       ${where}
       GROUP BY p.id, p.name, c.name, p.unit
       ORDER BY total_quantity DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(DISTINCT im.product_id)                                AS total_products,
         COALESCE(SUM(im.quantity), 0)                                AS total_quantity,
         COALESCE(SUM(im.quantity * COALESCE(ib.cost_price, 0)), 0)  AS total_value
       FROM inventory_movements im
       LEFT JOIN inventory_batches ib ON ib.id = im.batch_id
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating fast moving products report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 9. Dead Stock (no outgoing movements in date range)
export const getDeadStockReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;
  try {
    const params = [storeId];
    const cte = inventoryStockCTE(storeId);

    let dateWhere = '';
    if (startDate) {
      params.push(startDate);
      dateWhere += ` AND DATE(im2.created_at) >= $${params.length}::date`;
    }
    if (endDate) {
      params.push(endDate);
      dateWhere += ` AND DATE(im2.created_at) <= $${params.length}::date`;
    }

    const dataResult = await pool.query(
      `${cte}
       SELECT s.*,
         COALESCE(s.current_stock, 0) * COALESCE(s.cost_price, 0) AS stock_value
       FROM stock s
       WHERE s.current_stock > 0
         AND NOT EXISTS (
           SELECT 1 FROM inventory_movements im2
           JOIN inventory_batches ib2 ON ib2.id = im2.batch_id
           WHERE ib2.product_id = s.product_id
             AND ib2.store_id = $1
             AND im2.type = 'OUT'
             ${dateWhere}
         )
       ORDER BY s.product_name ASC`,
      params,
    );

    const summaryResult = await pool.query(
      `${cte}
       SELECT
         COUNT(*)                                                          AS total_products,
         COALESCE(SUM(current_stock * COALESCE(cost_price, 0)), 0)        AS total_value,
         COALESCE(SUM(current_stock), 0)                                  AS total_quantity
       FROM stock
       WHERE current_stock > 0
         AND NOT EXISTS (
           SELECT 1 FROM inventory_movements im2
           JOIN inventory_batches ib2 ON ib2.id = im2.batch_id
           WHERE ib2.product_id = stock.product_id
             AND ib2.store_id = $1
             AND im2.type = 'OUT'
             ${dateWhere}
         )`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating dead stock report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 10. Stock Adjustments
export const getStockAdjustmentReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;
  try {
    const params = [storeId];
    let where = 'WHERE sa.store_id = $1';
    where += toDateClause({ startDate, endDate, columnAlias: 'sa.created_at', params });

    const dataResult = await pool.query(
      `SELECT
         sa.created_at,
         p.name           AS product_name,
         c.name           AS category_name,
         p.unit,
         ib.batch_number,
         sa.adjustment_type,
         sa.quantity,
         sa.reason,
         sa.notes,
         u.name           AS created_by_name
       FROM stock_adjustments sa
       JOIN products p ON p.id = sa.product_id
       LEFT JOIN product_categories c ON p.category_id = c.id
       LEFT JOIN inventory_batches ib ON ib.id = sa.batch_id
       LEFT JOIN users u ON u.id = sa.created_by
       ${where}
       ORDER BY sa.created_at DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*)                                                                  AS total_adjustments,
         COALESCE(SUM(quantity) FILTER (WHERE adjustment_type = 'add'), 0)        AS total_additions,
         COALESCE(SUM(quantity) FILTER (WHERE adjustment_type = 'deduct'), 0)     AS total_deductions,
         COUNT(DISTINCT product_id)                                                AS total_products
       FROM stock_adjustments sa
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating stock adjustment report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 11. Stock Transfers
export const getStockTransferReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;
  try {
    const params = [storeId];
    let where = "WHERE (st.source_store_id = $1 OR (st.destination_store_id = $1 AND st.status NOT IN ('pending_approval', 'cancelled')))";
    where += toDateClause({ startDate, endDate, columnAlias: 'st.created_at', params });

    const dataResult = await pool.query(
      `SELECT
         st.reference_number,
         st.created_at,
         st.status,
         src.name         AS source_store,
         dst.name         AS destination_store,
         st.notes,
         COUNT(sti.id)                       AS item_count,
         COALESCE(SUM(sti.quantity), 0)      AS total_quantity,
         uc.name          AS created_by_name,
         ur.name          AS received_by_name,
         st.received_at
       FROM stock_transfers st
       JOIN stores src ON src.id = st.source_store_id
       JOIN stores dst ON dst.id = st.destination_store_id
       LEFT JOIN stock_transfer_items sti ON sti.transfer_id = st.id
       LEFT JOIN users uc ON uc.id = st.created_by
       LEFT JOIN users ur ON ur.id = st.received_by
       ${where}
       GROUP BY st.id, st.reference_number, st.created_at, st.status,
                src.name, dst.name, st.notes, uc.name, ur.name, st.received_at
       ORDER BY st.created_at DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(DISTINCT st.id)               AS total_transfers,
         COUNT(sti.id)                       AS total_items,
         COALESCE(SUM(sti.quantity), 0)      AS total_quantity,
         COUNT(DISTINCT st.id) FILTER (WHERE st.status = 'pending')  AS pending_transfers,
         COUNT(DISTINCT st.id) FILTER (WHERE st.status = 'received') AS completed_transfers
       FROM stock_transfers st
       LEFT JOIN stock_transfer_items sti ON sti.transfer_id = st.id
       ${where}`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating stock transfer report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 12. Stock Below Alert Level
export const getStockBelowAlertReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  try {
    const params = [storeId];
    const cte = inventoryStockCTE(storeId);

    const dataResult = await pool.query(
      `${cte}
       SELECT s.*,
         COALESCE(s.current_stock, 0) * COALESCE(s.cost_price, 0) AS stock_value,
         GREATEST(s.minimum_stock - s.current_stock, 0)            AS shortage_qty
       FROM stock s
       WHERE s.current_stock < s.minimum_stock
       ORDER BY (s.minimum_stock - s.current_stock) DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `${cte}
       SELECT
         COUNT(*) FILTER (WHERE current_stock < minimum_stock)                             AS total_products,
         COUNT(*) FILTER (WHERE current_stock <= 0)                                        AS critical_count,
         COALESCE(SUM(GREATEST(minimum_stock - current_stock, 0)) FILTER (WHERE current_stock < minimum_stock), 0) AS total_shortage,
         COALESCE(SUM(current_stock * COALESCE(cost_price, 0)) FILTER (WHERE current_stock < minimum_stock), 0)    AS total_value
       FROM stock`,
      params,
    );

    return res.json({ success: true, data: dataResult.rows, summary: summaryResult.rows[0] });
  } catch (err) {
    console.error('Error generating stock below alert report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// =====================================================
// PROFIT REPORTS
// =====================================================

// 1. Profit Summary Report
export const getProfitReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = "WHERE v.store_id = $1";

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'v.sales_date',
      params,
    });

    // Invoice-level rollup of the canonical per-line view. No more
    // per-report re-derivation of cost -- v_cart_line_profit is the
    // single place that logic lives.
    const invoiceProfitQuery = `
      SELECT
        v.invoice_number,
        v.sales_date,
        v.cashier_id AS user_id,
        COALESCE(SUM(v.line_discount), 0) AS total_discount,
        COALESCE(SUM(v.line_revenue), 0) AS revenue,
        COALESCE(SUM(v.line_cost), 0) AS total_cost,
        COALESCE(SUM(v.line_profit), 0) AS net_profit
      FROM v_cart_line_profit v
      ${where}
      GROUP BY
        v.invoice_number,
        v.sales_date,
        v.cashier_id
    `;

    const dataResult = await pool.query(
      `SELECT
          report.invoice_number,
          report.sales_date AS sale_date,
          report.total_discount,
          report.revenue,
          report.total_cost,
          report.net_profit,

          CASE
            WHEN report.net_profit >= 0
              THEN report.net_profit
            ELSE 0
          END AS profit,

          CASE
            WHEN report.net_profit < 0
              THEN ABS(report.net_profit)
            ELSE 0
          END AS loss,

          CASE
            WHEN report.revenue <> 0
            THEN (
              report.net_profit
              / report.revenue
            ) * 100
            ELSE 0
          END AS profit_margin_percentage,

          u.name AS cashier_name

       FROM (
         ${invoiceProfitQuery}
       ) report

       LEFT JOIN users u
         ON report.user_id = u.id

       ORDER BY report.sales_date DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(*) AS total_invoices,

          COALESCE(
            SUM(
              CASE
                WHEN report.net_profit >= 0
                  THEN report.net_profit
                ELSE 0
              END
            ),
            0
          ) AS total_profit,

          COALESCE(
            SUM(
              CASE
                WHEN report.net_profit < 0
                  THEN ABS(report.net_profit)
                ELSE 0
              END
            ),
            0
          ) AS total_loss,

          COALESCE(
            SUM(report.net_profit),
            0
          ) AS net_profit,

          COALESCE(
            SUM(report.revenue),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(report.total_cost),
            0
          ) AS total_cost,

          COALESCE(
            SUM(report.total_discount),
            0
          ) AS total_discount,

          CASE
            WHEN SUM(report.revenue) <> 0
            THEN (
              SUM(report.net_profit)
              / SUM(report.revenue)
            ) * 100
            ELSE 0
          END AS profit_margin_percentage

       FROM (
         ${invoiceProfitQuery}
       ) report`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating profit report:', err);

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// 2. Profit Detailed Report (line-item level with cost and selling price)
export const getProfitDetailedReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;
 
  try {
    const params = [storeId];
    let where = "WHERE v.store_id = $1";
 
    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'v.sales_date',
      params,
    });
 
    const dataResult = await pool.query(
      `SELECT
          v.invoice_number,
          v.sales_date,
          pr.name AS product_name,
          v.quantity,

          v.avg_unit_cost AS cost_price,
          v.original_selling_price,
          v.final_selling_price AS selling_price,

          v.discount_mode,
          v.discount_amount AS discount_value,
          v.discount_amount,

          (v.final_selling_price - v.avg_unit_cost) AS unit_profit,

          v.line_profit,
          v.line_revenue,
          v.line_cost,

          CASE
            WHEN v.line_revenue <> 0
            THEN (v.line_profit / v.line_revenue) * 100
            ELSE 0
          END AS profit_margin_percentage,

          u.name AS cashier_name,

          -- true only for rows sold before migration 044 shipped, which
          -- have no exact cart_id link yet and so show cost = 0 above.
          v.is_unlinked_legacy_row

       FROM v_cart_line_profit v

       JOIN products pr
         ON pr.id = v.product_id

       LEFT JOIN users u
         ON v.cashier_id = u.id

       ${where}

       ORDER BY
         v.sales_date DESC,
         v.invoice_number DESC`,
      params,
    );
 
    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT v.invoice_number) AS total_invoices,
          COUNT(*) AS total_line_items,

          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_profit), 0) AS total_profit,
          COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,

          CASE
            WHEN SUM(v.line_revenue) <> 0
            THEN (SUM(v.line_profit) / SUM(v.line_revenue)) * 100
            ELSE 0
          END AS avg_profit_margin

       FROM v_cart_line_profit v

       ${where}`,
      params,
    );
 
    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating profit detailed report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// 3. Profit by Product Report
export const getProfitByProductReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = "WHERE v.store_id = $1";

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'v.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          pr.id AS product_id,
          pr.name AS product_name,
          pc.name AS category_name,
          pr.unit,

          COUNT(DISTINCT v.invoice_number) AS invoice_count,
          SUM(v.quantity) AS total_quantity_sold,

          -- true weighted-average cost per unit (total cost / total qty)
          CASE
            WHEN SUM(v.quantity) <> 0
            THEN SUM(v.line_cost) / SUM(v.quantity)
            ELSE 0
          END AS avg_cost_price,

          AVG(v.final_selling_price) AS avg_selling_price,

          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,
          COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
          COALESCE(SUM(v.line_profit), 0) AS total_profit,

          CASE
            WHEN SUM(v.line_revenue) <> 0
            THEN (SUM(v.line_profit) / SUM(v.line_revenue)) * 100
            ELSE 0
          END AS profit_margin_percentage

       FROM v_cart_line_profit v

       JOIN products pr
         ON pr.id = v.product_id

       LEFT JOIN product_categories pc
         ON pr.category_id = pc.id

       ${where}

       GROUP BY
         pr.id,
         pr.name,
         pc.name,
         pr.unit

       ORDER BY total_profit DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT v.product_id) AS total_products,
          COUNT(DISTINCT v.invoice_number) AS total_invoices,

          COALESCE(SUM(v.quantity), 0) AS total_quantity_sold,
          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,
          COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
          COALESCE(SUM(v.line_profit), 0) AS total_profit,

          CASE
            WHEN SUM(v.line_revenue) <> 0
            THEN (SUM(v.line_profit) / SUM(v.line_revenue)) * 100
            ELSE 0
          END AS avg_profit_margin

       FROM v_cart_line_profit v

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error(
      'Error generating profit by product report:',
      err,
    );

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// 4. Profit by Category Report
export const getProfitByCategoryReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = "WHERE v.store_id = $1";

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'v.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          pc.id AS category_id,
          COALESCE(pc.name, 'Uncategorized') AS category_name,

          COUNT(DISTINCT v.invoice_number) AS invoice_count,
          COUNT(DISTINCT v.product_id) AS product_count,

          COALESCE(SUM(v.quantity), 0) AS total_quantity_sold,
          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,
          COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
          COALESCE(SUM(v.line_profit), 0) AS total_profit,

          CASE
            WHEN SUM(v.line_revenue) <> 0
            THEN (SUM(v.line_profit) / SUM(v.line_revenue)) * 100
            ELSE 0
          END AS profit_margin_percentage

       FROM v_cart_line_profit v

       LEFT JOIN product_categories pc
         ON pc.id = v.category_id

       ${where}

       GROUP BY
         pc.id,
         COALESCE(pc.name, 'Uncategorized')

       ORDER BY total_profit DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT v.category_id) AS total_categories,
          COUNT(DISTINCT v.invoice_number) AS total_invoices,

          COALESCE(SUM(v.quantity), 0) AS total_quantity_sold,
          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,
          COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
          COALESCE(SUM(v.line_profit), 0) AS total_profit,

          CASE
            WHEN SUM(v.line_revenue) <> 0
            THEN (SUM(v.line_profit) / SUM(v.line_revenue)) * 100
            ELSE 0
          END AS avg_profit_margin

       FROM v_cart_line_profit v

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error(
      'Error generating profit by category report:',
      err,
    );

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// 5. Profit by Cashier Report
export const getProfitByCashierReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = "WHERE v.store_id = $1";

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'v.sales_date',
      params,
    });

    const invoiceProfitQuery = `
      SELECT
        v.invoice_number,
        v.cashier_id AS user_id,
        v.sales_date,
        COALESCE(SUM(v.quantity), 0) AS total_quantity_sold,
        COALESCE(SUM(v.line_discount), 0) AS total_discount,
        COALESCE(SUM(v.line_cost), 0) AS total_cost,
        COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
        COALESCE(SUM(v.line_profit), 0) AS net_profit
      FROM v_cart_line_profit v
      ${where}
      GROUP BY
        v.invoice_number,
        v.cashier_id,
        v.sales_date
    `;

    const dataResult = await pool.query(
      `SELECT
          report.user_id,

          COALESCE(
            u.name,
            'Unknown Cashier'
          ) AS cashier_name,

          COUNT(*) AS invoice_count,

          COALESCE(
            SUM(report.total_quantity_sold),
            0
          ) AS total_quantity_sold,

          COALESCE(
            SUM(report.total_discount),
            0
          ) AS total_discount,

          COALESCE(
            SUM(report.total_cost),
            0
          ) AS total_cost,

          COALESCE(
            SUM(report.total_revenue),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN report.net_profit >= 0
                  THEN report.net_profit
                ELSE 0
              END
            ),
            0
          ) AS total_profit,

          COALESCE(
            SUM(
              CASE
                WHEN report.net_profit < 0
                  THEN ABS(report.net_profit)
                ELSE 0
              END
            ),
            0
          ) AS total_loss,

          COALESCE(
            SUM(report.net_profit),
            0
          ) AS net_profit,

          CASE
            WHEN SUM(report.total_revenue) <> 0
            THEN (
              SUM(report.net_profit)
              /
              SUM(report.total_revenue)
            ) * 100
            ELSE 0
          END AS profit_margin_percentage

       FROM (
         ${invoiceProfitQuery}
       ) report

       LEFT JOIN users u
         ON report.user_id = u.id

       GROUP BY
         report.user_id,
         u.name

       ORDER BY net_profit DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(
            DISTINCT report.user_id
          ) AS total_cashiers,

          COUNT(*) AS total_invoices,

          COALESCE(
            SUM(report.total_quantity_sold),
            0
          ) AS total_quantity_sold,

          COALESCE(
            SUM(report.total_discount),
            0
          ) AS total_discount,

          COALESCE(
            SUM(report.total_cost),
            0
          ) AS total_cost,

          COALESCE(
            SUM(report.total_revenue),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN report.net_profit >= 0
                  THEN report.net_profit
                ELSE 0
              END
            ),
            0
          ) AS total_profit,

          COALESCE(
            SUM(
              CASE
                WHEN report.net_profit < 0
                  THEN ABS(report.net_profit)
                ELSE 0
              END
            ),
            0
          ) AS total_loss,

          COALESCE(
            SUM(report.net_profit),
            0
          ) AS net_profit,

          CASE
            WHEN SUM(report.total_revenue) <> 0
            THEN (
              SUM(report.net_profit)
              /
              SUM(report.total_revenue)
            ) * 100
            ELSE 0
          END AS avg_profit_margin

       FROM (
         ${invoiceProfitQuery}
       ) report`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error(
      'Error generating profit by cashier report:',
      err,
    );

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// 6. Profit by Customer Report
export const getProfitByCustomerReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    const params = [storeId];

    let where = "WHERE v.store_id = $1";

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'v.sales_date',
      params,
    });

    const dataResult = await pool.query(
      `SELECT
          cust.id AS customer_id,
          COALESCE(cust.name, 'Walk-in Customer') AS customer_name,
          COALESCE(cust.phone, '') AS customer_phone,

          COUNT(DISTINCT v.invoice_number) AS invoice_count,

          COALESCE(SUM(v.quantity), 0) AS total_quantity_sold,
          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,
          COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
          COALESCE(SUM(v.line_profit), 0) AS total_profit,

          CASE
            WHEN SUM(v.line_revenue) <> 0
            THEN (SUM(v.line_profit) / SUM(v.line_revenue)) * 100
            ELSE 0
          END AS profit_margin_percentage

       FROM v_cart_line_profit v

       LEFT JOIN customers cust
         ON cust.id = v.customer_id

       ${where}

       GROUP BY
         cust.id,
         COALESCE(cust.name, 'Walk-in Customer'),
         COALESCE(cust.phone, '')

       ORDER BY total_profit DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT v.customer_id) AS total_customers,
          COUNT(DISTINCT v.invoice_number) AS total_invoices,

          COALESCE(SUM(v.quantity), 0) AS total_quantity_sold,
          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,
          COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
          COALESCE(SUM(v.line_profit), 0) AS total_profit,

          CASE
            WHEN SUM(v.line_revenue) <> 0
            THEN (SUM(v.line_profit) / SUM(v.line_revenue)) * 100
            ELSE 0
          END AS avg_profit_margin

       FROM v_cart_line_profit v

       ${where}`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error(
      'Error generating profit by customer report:',
      err,
    );

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// 7. Profit Margins Report (products with highest/lowest margins)
export const getProfitMarginsReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const {
    startDate,
    endDate,
    sortBy = 'margin_desc',
  } = req.query;

  try {
    const params = [storeId];

    let where = "WHERE v.store_id = $1";

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'v.sales_date',
      params,
    });

    const allowedSorts = {
      margin_desc: 'ORDER BY profit_margin_percentage DESC',
      margin_asc: 'ORDER BY profit_margin_percentage ASC',
      profit_desc: 'ORDER BY total_profit DESC',
      revenue_desc: 'ORDER BY total_revenue DESC',
    };

    const orderClause =
      allowedSorts[sortBy] || allowedSorts.margin_desc;

    const dataResult = await pool.query(
      `SELECT
          pr.id AS product_id,
          pr.name AS product_name,
          COALESCE(pc.name, 'Uncategorized') AS category_name,

          COUNT(DISTINCT v.invoice_number) AS invoice_count,
          COALESCE(SUM(v.quantity), 0) AS total_quantity_sold,

          CASE
            WHEN SUM(v.quantity) <> 0
            THEN SUM(v.line_cost) / SUM(v.quantity)
            ELSE 0
          END AS avg_cost_price,

          AVG(v.final_selling_price) AS avg_selling_price,

          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,
          COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
          COALESCE(SUM(v.line_profit), 0) AS total_profit,

          CASE
            WHEN SUM(v.line_revenue) <> 0
            THEN (SUM(v.line_profit) / SUM(v.line_revenue)) * 100
            ELSE 0
          END AS profit_margin_percentage

       FROM v_cart_line_profit v

       JOIN products pr
         ON pr.id = v.product_id

       LEFT JOIN product_categories pc
         ON pr.category_id = pc.id

       ${where}

       GROUP BY
         pr.id,
         pr.name,
         pc.name

       ${orderClause}`,
      params,
    );

    const summaryResult = await pool.query(
      `WITH product_margins AS (
         SELECT
            v.product_id,

            COALESCE(SUM(v.line_discount), 0) AS total_discount,
            COALESCE(SUM(v.line_cost), 0) AS total_cost,
            COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
            COALESCE(SUM(v.line_profit), 0) AS total_profit,

            CASE
              WHEN SUM(v.line_revenue) <> 0
              THEN (SUM(v.line_profit) / SUM(v.line_revenue)) * 100
              ELSE 0
            END AS profit_margin_percentage

         FROM v_cart_line_profit v

         ${where}

         GROUP BY v.product_id
       )

       SELECT
          COUNT(product_id) AS total_products,

          COALESCE(
            AVG(profit_margin_percentage),
            0
          ) AS avg_profit_margin,

          COALESCE(
            MAX(profit_margin_percentage),
            0
          ) AS max_profit_margin,

          COALESCE(
            MIN(profit_margin_percentage),
            0
          ) AS min_profit_margin,

          COALESCE(
            SUM(total_discount),
            0
          ) AS total_discount,

          COALESCE(
            SUM(total_cost),
            0
          ) AS total_cost,

          COALESCE(
            SUM(total_profit),
            0
          ) AS total_profit,

          COALESCE(
            SUM(total_revenue),
            0
          ) AS total_revenue,

          CASE
            WHEN SUM(total_revenue) <> 0
            THEN (
              SUM(total_profit)
              / SUM(total_revenue)
            ) * 100
            ELSE 0
          END AS overall_profit_margin

       FROM product_margins`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error(
      'Error generating profit margins report:',
      err,
    );

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};

// 8. Profit Trends Report (profit over time periods)
export const getProfitTrendsReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const {
    startDate,
    endDate,
    groupBy = 'day',
  } = req.query;

  try {
    const params = [storeId];

    let where = "WHERE v.store_id = $1";

    where += toDateClause({
      startDate,
      endDate,
      columnAlias: 'v.sales_date',
      params,
    });

    const allowedGroupings = {
      day: 'DATE(p.sales_date)',
      week: "DATE_TRUNC('week', p.sales_date)",
      month: "DATE_TRUNC('month', p.sales_date)",
      year: "DATE_TRUNC('year', p.sales_date)",
    };

    const dateGrouping =
      allowedGroupings[groupBy] || allowedGroupings.day;

    // Calculate one row per invoice first (from the canonical view), then
    // roll those up by period below. This keeps invoices with many cart
    // lines from being double-counted in the trend.
    const invoiceProfitQuery = `
      SELECT
        v.invoice_number,
        v.sales_date,
        COALESCE(SUM(v.quantity), 0) AS total_quantity_sold,
        COALESCE(SUM(v.line_discount), 0) AS total_discount,
        COALESCE(SUM(v.line_cost), 0) AS total_cost,
        COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
        COALESCE(SUM(v.line_profit), 0) AS net_profit
      FROM v_cart_line_profit v
      ${where}
      GROUP BY
        v.invoice_number,
        v.sales_date
    `;

    const dataResult = await pool.query(
      `SELECT
          ${dateGrouping.replaceAll(
            'p.sales_date',
            'report.sales_date',
          )} AS period,

          COUNT(*) AS invoice_count,

          COALESCE(
            SUM(report.total_quantity_sold),
            0
          ) AS total_quantity_sold,

          COALESCE(
            SUM(report.total_discount),
            0
          ) AS total_discount,

          COALESCE(
            SUM(report.total_cost),
            0
          ) AS total_cost,

          COALESCE(
            SUM(report.total_revenue),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN report.net_profit >= 0
                THEN report.net_profit
                ELSE 0
              END
            ),
            0
          ) AS total_profit,

          COALESCE(
            SUM(
              CASE
                WHEN report.net_profit < 0
                THEN ABS(report.net_profit)
                ELSE 0
              END
            ),
            0
          ) AS total_loss,

          COALESCE(
            SUM(report.net_profit),
            0
          ) AS net_profit,

          CASE
            WHEN SUM(report.total_revenue) <> 0
            THEN (
              SUM(report.net_profit)
              /
              SUM(report.total_revenue)
            ) * 100
            ELSE 0
          END AS profit_margin_percentage

       FROM (
         ${invoiceProfitQuery}
       ) report

       GROUP BY
         ${dateGrouping.replaceAll(
           'p.sales_date',
           'report.sales_date',
         )}

       ORDER BY period DESC`,
      params,
    );

    const summaryResult = await pool.query(
      `WITH invoice_profits AS (
         ${invoiceProfitQuery}
       ),

       period_profits AS (
         SELECT
           ${dateGrouping.replaceAll(
             'p.sales_date',
             'invoice_profits.sales_date',
           )} AS period,

           COUNT(*) AS invoice_count,

           COALESCE(
             SUM(total_quantity_sold),
             0
           ) AS total_quantity_sold,

           COALESCE(
             SUM(total_discount),
             0
           ) AS total_discount,

           COALESCE(
             SUM(total_cost),
             0
           ) AS total_cost,

           COALESCE(
             SUM(total_revenue),
             0
           ) AS total_revenue,

           COALESCE(
             SUM(net_profit),
             0
           ) AS net_profit

         FROM invoice_profits

         GROUP BY
           ${dateGrouping.replaceAll(
             'p.sales_date',
             'invoice_profits.sales_date',
           )}
       )

       SELECT
          COUNT(*) AS total_periods,

          COALESCE(
            SUM(invoice_count),
            0
          ) AS total_invoices,

          COALESCE(
            SUM(total_quantity_sold),
            0
          ) AS total_quantity_sold,

          COALESCE(
            SUM(total_discount),
            0
          ) AS total_discount,

          COALESCE(
            SUM(total_cost),
            0
          ) AS total_cost,

          COALESCE(
            SUM(total_revenue),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN net_profit >= 0
                THEN net_profit
                ELSE 0
              END
            ),
            0
          ) AS total_profit,

          COALESCE(
            SUM(
              CASE
                WHEN net_profit < 0
                THEN ABS(net_profit)
                ELSE 0
              END
            ),
            0
          ) AS total_loss,

          COALESCE(
            SUM(net_profit),
            0
          ) AS net_profit,

          CASE
            WHEN SUM(total_revenue) <> 0
            THEN (
              SUM(net_profit)
              /
              SUM(total_revenue)
            ) * 100
            ELSE 0
          END AS avg_profit_margin,

          COALESCE(
            AVG(net_profit),
            0
          ) AS avg_period_profit

       FROM period_profits`,
      params,
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      summary: summaryResult.rows[0],
      groupBy:
        allowedGroupings[groupBy]
          ? groupBy
          : 'day',
    });
  } catch (err) {
    console.error(
      'Error generating profit trends report:',
      err,
    );

    return respondWithError(
      req,
      res,
      500,
      'server_error',
    );
  }
};
// ─────────────────────────────────────────────────────────────────────────
// DAY REPORT (Sales Manifest)
// One-shot view of everything that happened on a single day: every
// transaction (invoice), its revenue/cost/profit, plus a day-level total.
// ─────────────────────────────────────────────────────────────────────────
export const getDayReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  // Default to "today" (server local date) when no date is supplied.
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const params = [storeId, date];

    // Per-invoice rollup for the requested day, from the same canonical
    // per-line profit view every other profit/sales report is built on.
    const transactionsResult = await pool.query(
      `SELECT
          v.invoice_number,
          v.sales_date,
          v.cashier_id AS user_id,
          u.name AS cashier_name,
          COALESCE(SUM(v.quantity), 0) AS total_items,
          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_revenue), 0) AS total_amount,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,
          COALESCE(SUM(v.line_profit), 0) AS profit
       FROM v_cart_line_profit v
       LEFT JOIN users u ON u.id = v.cashier_id
       WHERE v.store_id = $1 AND v.sales_date::date = $2::date
       GROUP BY v.invoice_number, v.sales_date, v.cashier_id, u.name
       ORDER BY v.sales_date ASC`,
      params,
    );

    // Payment method split for the day (cash vs mobile vs bank etc.),
    // sourced straight from the payments table so it matches what the
    // cashier actually recorded at checkout.
    const paymentSplitResult = await pool.query(
      `SELECT
          p.payment_method,
          COUNT(DISTINCT p.invoice_number) AS transaction_count,
          COALESCE(SUM(p.total_amount), 0) AS total_amount
       FROM payments p
       WHERE p.store_id = $1 AND p.sales_date::date = $2::date
       GROUP BY p.payment_method
       ORDER BY total_amount DESC`,
      params,
    ).catch(() => ({ rows: [] })); // payment-method breakdown is best-effort

    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT v.invoice_number) AS total_transactions,
          COALESCE(SUM(v.quantity), 0) AS total_items_sold,
          COALESCE(SUM(v.line_discount), 0) AS total_discount,
          COALESCE(SUM(v.line_revenue), 0) AS total_sales,
          COALESCE(SUM(v.line_cost), 0) AS total_cost,
          COALESCE(SUM(v.line_profit), 0) AS total_profit
       FROM v_cart_line_profit v
       WHERE v.store_id = $1 AND v.sales_date::date = $2::date`,
      params,
    );

    return res.json({
      success: true,
      date,
      transactions: transactionsResult.rows,
      payment_breakdown: paymentSplitResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (err) {
    console.error('Error generating day report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

// ─────────────────────────────────────────────────────────────────────────
// NET PROFIT REPORT
// Net profit = Gross Profit - All other business expenses (rent,
// salaries, utilities, etc.), for the selected period. Gross profit
// (from v_cart_line_profit) already nets out cost of goods SOLD, so it's
// the correct starting point -- NOT total revenue, and NOT revenue minus
// total purchases (that would double-count COGS: once via line_cost
// inside gross profit, and again via raw purchase spend, some of which
// is still sitting in stock unsold anyway).
//
// total_purchases is still computed and returned for information only
// (purchase_orders placed in the period, excluding 'draft' and
// 'cancelled') -- it does not factor into the net_profit figure.
// ─────────────────────────────────────────────────────────────────────────
export const getNetProfitReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { startDate, endDate } = req.query;

  try {
    // 1. Total income (sales revenue) — from the canonical profit view.
    const revenueParams = [storeId];
    let revenueWhere = 'WHERE v.store_id = $1';
    revenueWhere += toDateClause({ startDate, endDate, columnAlias: 'v.sales_date', params: revenueParams });

    const revenueResult = await pool.query(
      `SELECT
          COALESCE(SUM(v.line_revenue), 0) AS total_revenue,
          COALESCE(SUM(v.line_cost), 0) AS total_cost_of_goods_sold,
          COALESCE(SUM(v.line_profit), 0) AS gross_profit
       FROM v_cart_line_profit v
       ${revenueWhere}`,
      revenueParams,
    );

    // 2. Purchases — real stock spend for the period.
    const purchaseParams = [storeId];
    let purchaseWhere = "WHERE po.store_id = $1 AND po.status NOT IN ('draft', 'cancelled')";
    purchaseWhere += toDateClause({ startDate, endDate, columnAlias: 'po.order_date', params: purchaseParams });

    const purchasesResult = await pool.query(
      `SELECT COALESCE(SUM(po.total_amount), 0) AS total_purchases
       FROM purchase_orders po
       ${purchaseWhere}`,
      purchaseParams,
    );

    // 3. All other business expenses (rent, salaries, utilities, etc.)
    const expenseParams = [storeId];
    let expenseWhere = 'WHERE e.store_id = $1';
    expenseWhere += toDateClause({ startDate, endDate, columnAlias: 'e.expense_date', params: expenseParams });

    const expensesResult = await pool.query(
      `SELECT
          COALESCE(SUM(e.cat_total), 0) AS total_expenses,
          COALESCE(json_agg(json_build_object('category', e.cat, 'amount', e.cat_total)) FILTER (WHERE e.cat IS NOT NULL), '[]') AS by_category
       FROM (
         SELECT e.category AS cat, SUM(e.amount) AS cat_total
         FROM expenses e
         ${expenseWhere}
         GROUP BY e.category
       ) e`,
      expenseParams,
    );

    const totalRevenue = Number(revenueResult.rows[0].total_revenue) || 0;
    const totalPurchases = Number(purchasesResult.rows[0].total_purchases) || 0;
    const totalExpenses = Number(expensesResult.rows[0].total_expenses) || 0;
    const grossProfit = Number(revenueResult.rows[0].gross_profit) || 0;
    // Net Profit = Gross Profit - Expenses. Gross profit already nets out
    // cost of goods SOLD (line_cost, from v_cart_line_profit) -- so total
    // purchases (all stock bought, sold or not) must NOT be subtracted
    // again here, or COGS would be double-counted. total_purchases is
    // still returned below for information only.
    const netProfit = grossProfit - totalExpenses;

    return res.json({
      success: true,
      summary: {
        total_revenue: totalRevenue,
        total_cost_of_goods_sold: Number(revenueResult.rows[0].total_cost_of_goods_sold) || 0,
        gross_profit: grossProfit,
        total_purchases: totalPurchases,
        total_expenses: totalExpenses,
        expenses_by_category: expensesResult.rows[0].by_category,
        net_profit: netProfit,
        net_profit_margin_percentage: totalRevenue !== 0 ? (netProfit / totalRevenue) * 100 : 0,
      },
    });
  } catch (err) {
    console.error('Error generating net profit report:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};

