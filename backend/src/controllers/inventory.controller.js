import pool from '../config/db.js';
import { logActivity } from '../utils/activityLog.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
import { notifyStore } from '../services/notification.service.js';
// Get Stock by product in a store
export const getStock = async (req, res) => {
  const { storeId, product_id } = req.query;

  try {
    // 1. Pata jumla ya stock (IN - OUT)
    const stockResult = await pool.query(
      `SELECT 
                SUM(CASE WHEN type = 'IN' THEN quantity ELSE -quantity END) AS current_stock
             FROM inventory_movements
             WHERE store_id = $1 AND product_id = $2`,
      [storeId, product_id],
    );

    const currentStock = stockResult.rows[0]?.current_stock || 0;

    // 2. Pata maelezo ya bidhaa (kwa ajili ya jina la bidhaa)
    const productInfo = await pool.query(
      `SELECT name, description FROM products WHERE id = $1 AND store_id = $2`,
      [product_id, storeId],
    );

    if (productInfo.rows.length === 0) {
      return respondWithError(req, res, 404, "product_not_found");
    }

    res.status(200).json({
      product_id,
      product_name: productInfo.rows[0].name,
      product_description: productInfo.rows[0].description,
      current_stock: Number(currentStock),
    });
  } catch (err) {
    console.error("Get stock error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

export const getStoreWideStock = async (req, res) => {
  const storeId     = req.user?.current_store_id;
  const page        = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit       = Math.max(1, parseInt(req.query.limit, 10) || 25);
  const offset      = (page - 1) * limit;
  const search      = req.query.search?.trim() || '';
  const stockFilter = req.query.stockFilter || 'all';

  const searchFilter = search ? `AND p.name ILIKE $2` : '';
  const baseParams   = search ? [storeId, `%${search}%`] : [storeId];

  let stockFilterExpr = 'TRUE';
  if (stockFilter === 'in-stock') {
    stockFilterExpr = `ps.current_stock > COALESCE(p.minimum_stock, 0)`;
  } else if (stockFilter === 'low-stock') {
    stockFilterExpr = `ps.current_stock > 0 AND ps.current_stock <= COALESCE(p.minimum_stock, 0)`;
  } else if (stockFilter === 'out-of-stock') {
    stockFilterExpr = `ps.current_stock = 0`;
  }

  const baseCTE = `
    WITH products_with_stock AS (
        SELECT DISTINCT p.id AS product_id
        FROM products p
        WHERE p.store_id = $1
        ${searchFilter}
        AND (
            EXISTS (SELECT 1 FROM inventory_batches ib WHERE ib.product_id = p.id AND ib.store_id = p.store_id)
            OR EXISTS (SELECT 1 FROM inventory_movements im WHERE im.product_id = p.id AND im.store_id = p.store_id)
        )
    ),
    latest_batches AS (
        SELECT DISTINCT ON (p.id)
            p.id AS product_id,
            ib.id AS batch_id,
            ib.batch_number,
            ib.expiry_date,
            ib.created_at AS batch_created_at
        FROM products p
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id AND ib.store_id = p.store_id
        WHERE p.id IN (SELECT product_id FROM products_with_stock)
        ORDER BY p.id, ib.created_at DESC
    ),
    product_stock AS (
        SELECT
            p.id AS product_id,
            COALESCE(SUM(
                CASE
                    WHEN im.type = 'IN'  THEN im.quantity
                    WHEN im.type = 'OUT' THEN -im.quantity
                    ELSE 0
                END
            ), 0) AS current_stock
        FROM products p
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id AND ib.store_id = p.store_id
        LEFT JOIN inventory_movements im ON ib.id = im.batch_id
        WHERE p.id IN (SELECT product_id FROM products_with_stock)
        GROUP BY p.id
    )
  `;

  try {
    // Summary counts + filtered total in a single query
    const summaryRes = await pool.query(
      `${baseCTE}
       SELECT
           COUNT(*)                                                                                  AS all_total,
           COUNT(*) FILTER (WHERE ps.current_stock > COALESCE(p.minimum_stock, 0))                 AS in_stock_count,
           COUNT(*) FILTER (WHERE ps.current_stock > 0 AND ps.current_stock <= COALESCE(p.minimum_stock, 0)) AS low_stock_count,
           COUNT(*) FILTER (WHERE ps.current_stock = 0)                                            AS out_of_stock_count,
           COUNT(*) FILTER (WHERE ${stockFilterExpr})                                              AS filtered_total
       FROM product_stock ps
       JOIN products p ON ps.product_id = p.id`,
      baseParams
    );
    const s     = summaryRes.rows[0];
    const total = parseInt(s.filtered_total, 10);

    // Paginated data
    const dataParams = [...baseParams, limit, offset];
    const limitIdx  = baseParams.length + 1;
    const offsetIdx = baseParams.length + 2;

    const result = await pool.query(
      `${baseCTE}
       SELECT
           ps.product_id,
           p.name AS product_name,
           p.minimum_stock,
           p.unit,
           p.description AS product_description,
           ps.current_stock,
           p.category_id,
           c.name AS category_name,
           lb.batch_id,
           lb.batch_number,
           lb.expiry_date,
           lb.batch_created_at
       FROM product_stock ps
       JOIN products p ON ps.product_id = p.id
       LEFT JOIN product_categories c ON p.category_id = c.id
       LEFT JOIN latest_batches lb ON ps.product_id = lb.product_id
       WHERE ${stockFilterExpr}
       ORDER BY p.name
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams,
    );

    res.status(200).json({
      message: t("stock_fetched", getLang(req)),
      stock: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      summary: {
        all:        parseInt(s.all_total,         10),
        inStock:    parseInt(s.in_stock_count,    10),
        lowStock:   parseInt(s.low_stock_count,   10),
        outOfStock: parseInt(s.out_of_stock_count,10),
      },
    });
  } catch (err) {
    console.error("Get store-wide stock error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Add stock (inventory in)
export const addStock = async (req, res) => {
  const {
    storeId,
    product_id,
    quantity,
    note,
    batch_number,
    cost_price,
    expiry_date,
  } = req.body;
  const user_id = req.user.id;

  try {
    const client = await pool.connect();
    await client.query("BEGIN");

    // Check if product exists in that store
    const product = await client.query(
      "SELECT id FROM products WHERE id = $1 AND store_id = $2",
      [product_id, storeId],
    );

    if (product.rows.length === 0) {
      await client.query("ROLLBACK");
      client.release();
      return respondWithError(req, res, 400, "invalid_product");
    }

    // 1. Insert batch
    const batchRes = await client.query(
      `INSERT INTO inventory_batches (store_id, product_id, batch_number, cost_price, expiry_date, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id`,
      [
        storeId,
        product_id,
        batch_number,
        cost_price || null,
        expiry_date?.trim() ? expiry_date : null,
        user_id,
      ],
    );

    const batchId = batchRes.rows[0].id;

    // 2. Insert inventory movement
    const moveRes = await client.query(
      `INSERT INTO inventory_movements (store_id, product_id, batch_id, quantity, type, note, created_by, transaction_date)
             VALUES ($1, $2, $3, $4, 'IN', $5, $6, NOW())
             RETURNING *`,
      [storeId, product_id, batchId, quantity, note, user_id],
    );

    // 3. Log the stock addition
    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
             VALUES ($1, $2, $3, $4, $5)`,
      [
        user_id,
        "add_stock",
        JSON.stringify({
          product_id,
          batch_id: batchId,
          batch_number,
          quantity,
          cost_price: cost_price || null,
          expiry_date: expiry_date || null,
          note,
        }),
        req.ip,
        storeId,
      ],
    );

    await client.query("COMMIT");
    client.release();

    // Emit Realtime Event (notify frontend)
    const io = getIO();
    io.to(storeId).emit("inventory:added", {
      message: t("stock_added", getLang(req)),
      responseData: moveRes.rows[0],
    });

    res.status(201).json({
      message: t("stock_added", getLang(req)),
      responseData: moveRes.rows[0],
    });
  } catch (err) {
    console.error("Add stock with batch error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Kupata History ya Stock Movements
export const getStockMovements = async (req, res) => {
  const { storeId, product_id, page = 1, limit = 20 } = req.query;

  try {
    // 1. Pata jumla ya movements (kwa pagination)
    const offset = (page - 1) * limit;

    let query = `
            SELECT 
                im.id, im.product_id, im.quantity, im.type, im.note, 
                im.created_at, u.name AS user_name,
                p.name AS product_name, p.description AS product_description, p.unit as unit,
                ib.batch_number
            FROM inventory_movements im
            LEFT JOIN users u ON im.created_by = u.id
            LEFT JOIN products p ON im.product_id = p.id
            LEFT JOIN inventory_batches ib ON im.batch_id = ib.id
            WHERE im.store_id = $1
        `;

    const params = [storeId];

    // 2. Filter kwa product_id ikiwa ipo
    if (product_id) {
      query += " AND im.product_id = $2";
      params.push(product_id);
    }

    // 3. Order na pagination
    query += `
            ORDER BY im.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

    params.push(limit, offset);

    const movements = await pool.query(query, params);

    // 4. Pata jumla ya movements (kwa pagination)
    let countQuery = `
            SELECT COUNT(*) 
            FROM inventory_movements 
            WHERE store_id = $1
        `;

    if (product_id) {
      countQuery += " AND product_id = $2";
    }

    const countResult = await pool.query(
      countQuery,
      product_id ? [storeId, product_id] : [storeId],
    );

    const totalMovements = Number(countResult.rows[0].count);

    res.status(200).json({
      movements: movements.rows,
      total: totalMovements,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error("Get movements error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/inventory/low-stock
export const getLowStock = async (req, res) => {
  const { storeId } = req.query;

  try {
    const result = await pool.query(
      `
            SELECT 
                p.id,
                p.name,
                p.minimum_stock,
                COALESCE(SUM(
                    CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
                ), 0) AS current_stock
            FROM products p
            LEFT JOIN inventory_movements im ON p.id = im.product_id
            WHERE p.store_id = $1
            GROUP BY p.id
            HAVING COALESCE(SUM(
                CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
            ), 0) <= p.minimum_stock
        `,
      [storeId],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("Failed to fetch low stock items:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/inventory/batch-details?storeId=YYY&product_id=XXX
export const getBatchDetails = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { product_id } = req.query;

  try {
    // 1. Get all batches with full details
    const batches = await pool.query(
      `
            SELECT 
                ib.*,  -- All batch fields
                u.name as created_by_name,
                p.unit as unit
            FROM inventory_batches ib
            LEFT JOIN users u ON ib.created_by = u.id
            LEFT JOIN products p ON ib.product_id = p.id
            WHERE 
                ib.product_id = $1 AND
                ib.store_id = $2
            ORDER BY 
                ib.status = 'active' DESC,
                COALESCE(ib.expiry_date, 'infinity') ASC
        `,
      [product_id, storeId],
    );

    // 2. Get current stock for all batches in one query
    const batchSummary = await pool.query(
      `
            SELECT 
                batch_id,
                SUM(CASE WHEN type = 'IN' THEN quantity ELSE -quantity END) as current_stock
            FROM inventory_movements
            WHERE batch_id = ANY($1)
            GROUP BY batch_id
        `,
      [batches.rows.map((b) => b.id)],
    );

    // 3. Get detailed movement breakdown for each batch
    const batchDetails = await Promise.all(
      batches.rows.map(async (batch) => {
        const movements = await pool.query(
          `
                    SELECT 
                        type,
                        quantity,
                        note,
                        created_at,
                        (SELECT name FROM users WHERE id = im.created_by) as user_name
                    FROM inventory_movements im
                    WHERE batch_id = $1
                    ORDER BY created_at
                `,
          [batch.id],
        );

        const stockSummary = await pool.query(
          `
                    SELECT 
                        type,
                        SUM(quantity) as total_quantity,
                        COUNT(*) as movement_count
                    FROM inventory_movements
                    WHERE batch_id = $1
                    GROUP BY type
                `,
          [batch.id],
        );

        const originalStock = movements.rows.find((m) => m.type === "IN");

        return {
          ...batch,
          original_stock: originalStock?.quantity || 0,
          movements: movements.rows,
          stock_summary: stockSummary.rows,
          current_stock:
            batchSummary.rows.find((s) => s.batch_id === batch.id)
              ?.current_stock || 0,
        };
      }),
    );

    res.json({
      success: true,
      product_id,
      storeId,
      batches: batchDetails,
    });
  } catch (err) {
    console.error("Batch details error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/inventory/expiry-risk?threshold_days=30
export const getExpiryRiskReport = async (req, res) => {
  const { threshold_days = 30, storeId } = req.query;

  try {
    const result = await pool.query(
      `
            SELECT 
                p.id AS product_id,
                p.name AS product_name,
                ib.id AS batch_id,
                ib.batch_number,
                ib.status,
                ib.expiry_date,
                COALESCE(SUM(
                    CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
                ), 0) AS current_stock,
                (ib.expiry_date - CURRENT_DATE) AS days_until_expiry
            FROM inventory_batches ib
            JOIN products p ON ib.product_id = p.id
            LEFT JOIN inventory_movements im ON ib.id = im.batch_id
            WHERE ib.expiry_date IS NOT NULL
              AND ib.store_id = $1  
              AND ib.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${threshold_days} days'
            GROUP BY ib.id, p.id
            HAVING COALESCE(SUM(
                CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
            ), 0) > 0
            ORDER BY days_until_expiry ASC
        `,
      [storeId],
    ); // Pass store_id as parameter

    res.json({
      success: true,
      threshold_days,
      storeId, // Include store_id in response
      at_risk_batches: result.rows,
    });
  } catch (err) {
    console.error("Failed to generate expiry report:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/sales/history
export const getSalesHistory = async (req, res) => {
  const result = await pool.query(`
        SELECT 
            s.id AS sale_id,
            s.sale_date,
            im.product_id,
            im.quantity,
            im.batch_id,
            ib.selling_price,
            (im.quantity * ib.selling_price) AS total
        FROM inventory_movements im
        JOIN inventory_batches ib ON im.batch_id = ib.id
        WHERE im.type = 'OUT'
    `);

  res.json(result.rows);
};

// Get stock value by price category
export const getStockValue = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { priceCategoryId } = req.query;
  const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit  = Math.max(1, parseInt(req.query.limit, 10) || 25);
  const offset = (page - 1) * limit;
  const search = req.query.search?.trim() || '';

  try {
    const baseParams = [storeId, priceCategoryId];
    let searchFilter = '';
    if (search) {
      baseParams.push(`%${search}%`);
      searchFilter = `AND (p.name ILIKE $${baseParams.length} OR c.name ILIKE $${baseParams.length})`;
    }

    const baseQuery = `
      WITH product_stock AS (
          SELECT
              p.id AS product_id,
              p.name AS product_name,
              p.unit,
              p.category_id,
              c.name AS category_name,
              SUM(
                  CASE
                      WHEN im.type = 'IN'  THEN im.quantity
                      WHEN im.type = 'OUT' THEN -im.quantity
                      ELSE 0
                  END
              ) AS current_stock,
              COALESCE(
                  (
                      SELECT ib.cost_price
                      FROM inventory_batches ib
                      WHERE ib.product_id = p.id AND ib.store_id = p.store_id
                      ORDER BY ib.created_at DESC LIMIT 1
                  ), 0
              ) AS cost_price,
              COALESCE(
                  (
                      SELECT sp.price
                      FROM selling_prices sp
                      WHERE sp.batch_id = (
                          SELECT ib2.id
                          FROM inventory_batches ib2
                          WHERE ib2.product_id = p.id AND ib2.store_id = p.store_id
                          ORDER BY ib2.created_at DESC LIMIT 1
                      )
                      AND sp.price_category_id = $2
                      LIMIT 1
                  ), 0
              ) AS selling_price
          FROM products p
          LEFT JOIN product_categories c  ON p.category_id = c.id
          LEFT JOIN inventory_batches ib  ON ib.product_id = p.id AND ib.store_id = p.store_id
          LEFT JOIN inventory_movements im ON im.batch_id = ib.id
          WHERE p.store_id = $1
          ${searchFilter}
          GROUP BY p.id, p.name, p.unit, p.category_id, c.name
          HAVING SUM(
              CASE
                  WHEN im.type = 'IN'  THEN im.quantity
                  WHEN im.type = 'OUT' THEN -im.quantity
                  ELSE 0
              END
          ) > 0
      ),
      valued AS (
          SELECT
              product_id, product_name, unit, category_name, current_stock,
              cost_price, selling_price,
              (current_stock * cost_price)                AS stock_worth,
              (current_stock * selling_price)             AS potential_revenue,
              ((selling_price - cost_price) * current_stock) AS potential_profit
          FROM product_stock
      )`;

    // Aggregate totals across ALL matching rows (not just current page)
    const totalsResult = await pool.query(
      `${baseQuery}
       SELECT
           COUNT(*)                     AS total,
           COALESCE(SUM(stock_worth),       0) AS total_worth,
           COALESCE(SUM(potential_revenue), 0) AS total_revenue,
           COALESCE(SUM(potential_profit),  0) AS total_profit
       FROM valued`,
      baseParams,
    );

    const total      = parseInt(totalsResult.rows[0].total,         10);
    const totalWorth   = parseFloat(totalsResult.rows[0].total_worth);
    const totalRevenue = parseFloat(totalsResult.rows[0].total_revenue);
    const totalProfit  = parseFloat(totalsResult.rows[0].total_profit);

    // Paginated rows
    const dataParams = [...baseParams, limit, offset];
    const limitIdx   = baseParams.length + 1;
    const offsetIdx  = baseParams.length + 2;

    const result = await pool.query(
      `${baseQuery}
       SELECT * FROM valued
       ORDER BY product_name
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams,
    );

    res.status(200).json({
      message: t("stock_value_fetched", getLang(req)),
      stockValue: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
      totals: { totalWorth, totalRevenue, totalProfit },
    });
  } catch (err) {
    console.error("Get stock value error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Save current stock value as historical snapshot
// exports.saveStockValueHistory = async (req, res) => {
//   const storeId = req.user?.current_store_id;
//   const userId = req.user?.id;
//   const { priceCategoryId, notes } = req.body;

//   const client = await pool.connect();
//   try {
//     await client.query("BEGIN");

//     // Get current stock value data
//     const stockValueResult = await client.query(
//       `
//             WITH product_stock AS (
//                 SELECT 
//                     p.id AS product_id,
//                     p.name AS product_name,
//                     p.unit,
//                     p.category_id,
//                     c.name AS category_name,
//                     SUM(
//                         CASE 
//                             WHEN im.type = 'IN' THEN im.quantity 
//                             WHEN im.type = 'OUT' THEN -im.quantity
//                             ELSE 0 
//                         END
//                     ) AS current_stock,
                    
//                     COALESCE(
//                         (
//                             SELECT ib.cost_price
//                             FROM inventory_batches ib
//                             WHERE ib.product_id = p.id
//                               AND ib.store_id = p.store_id
//                             ORDER BY ib.created_at DESC
//                             LIMIT 1
//                         ),
//                         0
//                     ) AS cost_price,
                    
//                     COALESCE(
//                         (
//                             SELECT sp.price
//                             FROM selling_prices sp
//                             WHERE sp.batch_id = (
//                                 SELECT ib2.id
//                                 FROM inventory_batches ib2
//                                 WHERE ib2.product_id = p.id
//                                   AND ib2.store_id = p.store_id
//                                 ORDER BY ib2.created_at DESC
//                                 LIMIT 1
//                             )
//                             AND sp.price_category_id = $2
//                             LIMIT 1
//                         ),
//                         0
//                     ) AS selling_price
                    
//                 FROM products p
//                 LEFT JOIN product_categories c ON p.category_id = c.id
//                 LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.store_id = p.store_id
//                 LEFT JOIN inventory_movements im ON im.batch_id = ib.id
//                 WHERE p.store_id = $1
//                 GROUP BY p.id, p.name, p.unit, p.category_id, c.name
//                 HAVING SUM(
//                     CASE 
//                         WHEN im.type = 'IN' THEN im.quantity 
//                         WHEN im.type = 'OUT' THEN -im.quantity
//                         ELSE 0 
//                     END
//                 ) > 0
//             )
//             SELECT 
//                 product_id,
//                 product_name,
//                 unit,
//                 category_name,
//                 current_stock,
//                 cost_price,
//                 selling_price,
//                 (current_stock * cost_price) AS stock_worth,
//                 (current_stock * selling_price) AS potential_revenue,
//                 ((selling_price - cost_price) * current_stock) AS potential_profit
//             FROM product_stock
//             ORDER BY product_name
//         `,
//       [storeId, priceCategoryId],
//     );

//     const stockData = stockValueResult.rows;

//     if (stockData.length === 0) {
//       await client.query("ROLLBACK");
//       client.release();
//       return respondWithError(req, res, 400, "no_stock_data_available");
//     }

//     // Calculate totals
//     const totals = stockData.reduce(
//       (acc, item) => {
//         acc.totalWorth += parseFloat(item.stock_worth || 0);
//         acc.totalRevenue += parseFloat(item.potential_revenue || 0);
//         acc.totalProfit += parseFloat(item.potential_profit || 0);
//         acc.totalQuantity += parseFloat(item.current_stock || 0);
//         return acc;
//       },
//       { totalWorth: 0, totalRevenue: 0, totalProfit: 0, totalQuantity: 0 },
//     );

//     const profitMargin =
//       totals.totalRevenue > 0
//         ? (totals.totalProfit / totals.totalRevenue) * 100
//         : 0;

//     // Insert main history record
//     const historyResult = await client.query(
//       `
//             INSERT INTO stock_value_history (
//                 store_id, price_category_id, total_stock_worth,
//                 total_potential_revenue, total_potential_profit, profit_margin,
//                 total_products, total_quantity, created_by, notes
//             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
//             RETURNING id, snapshot_date
//         `,
//       [
//         storeId,
//         priceCategoryId,
//         totals.totalWorth,
//         totals.totalRevenue,
//         totals.totalProfit,
//         profitMargin,
//         stockData.length,
//         totals.totalQuantity,
//         userId,
//         notes || null,
//       ],
//     );

//     const historyId = historyResult.rows[0].id;
//     const snapshotDate = historyResult.rows[0].snapshot_date;

//     // Insert detail records for each product
//     for (const item of stockData) {
//       await client.query(
//         `
//                 INSERT INTO stock_value_history_items (
//                     history_id, product_id, product_name, category_name, unit,
//                     current_stock, cost_price, selling_price, stock_worth,
//                     potential_revenue, potential_profit
//                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//             `,
//         [
//           historyId,
//           item.product_id,
//           item.product_name,
//           item.category_name,
//           item.unit,
//           item.current_stock,
//           item.cost_price,
//           item.selling_price,
//           item.stock_worth,
//           item.potential_revenue,
//           item.potential_profit,
//         ],
//       );
//     }

//         await logActivity(client, {
//       userId: userId,
//       storeId: storeId,
//       action: "save_stock_value_history",
//       description: {
//         price_category_id: priceCategoryId || undefined,
//         notes: notes || undefined,
//       },
//       ip: req.ip,
//     });
    
// await client.query("COMMIT");

//     res.status(201).json({
//       success: true,
//       message: t("stock_value_history_saved", getLang(req)),
//       data: {
//         id: historyId,
//         snapshot_date: snapshotDate,
//         total_products: stockData.length,
//         total_stock_worth: totals.totalWorth,
//         total_potential_revenue: totals.totalRevenue,
//         total_potential_profit: totals.totalProfit,
//         profit_margin: profitMargin,
//       },
//     });
//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error("Save stock value history error:", err.message);
//     respondWithError(req, res, 500, "server_error");
//   } finally {
//     client.release();
//   }
// };

export const saveStockValueHistory = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const userId = req.user?.id;
  const { priceCategoryId, notes } = req.body;
 
  try {
    const result = await createStockValueSnapshot({
      storeId,
      priceCategoryId,
      createdBy: userId,
      notes: notes || null,
    });
 
    if (result.skipped) {
      return respondWithError(req, res, 400, result.reason || "no_stock_data_available");
    }
 
    res.status(201).json({
      success: true,
      message: t("stock_value_history_saved", getLang(req)),
      data: result.data,
    });
  } catch (err) {
    console.error("Save stock value history error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Get stock value history list
export const getStockValueHistoryList = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const {
    priceCategoryId,
    page = 1,
    limit = 25,
    search = "",
    startDate,
    endDate,
  } = req.query;

  try {
    const offset = (page - 1) * limit;
    let query = `
            SELECT 
                svh.id,
                svh.snapshot_date,
                svh.total_stock_worth,
                svh.total_potential_revenue,
                svh.total_potential_profit,
                svh.profit_margin,
                svh.total_products,
                svh.total_quantity,
                svh.notes,
                svh.created_at,
                u.name AS created_by_name,
                pc.name AS price_category_name
            FROM stock_value_history svh
            LEFT JOIN users u ON svh.created_by = u.id
            LEFT JOIN price_categories pc ON svh.price_category_id = pc.id
            WHERE svh.store_id = $1
        `;

    const params = [storeId];
    let paramCount = 1;

    if (priceCategoryId) {
      paramCount++;
      query += ` AND svh.price_category_id = $${paramCount}`;
      params.push(priceCategoryId);
    }

    if (startDate) {
      paramCount++;
      query += ` AND svh.snapshot_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND svh.snapshot_date < ($${paramCount}::date + interval '1 day')`;
      params.push(endDate);
    }

    if (search) {
      const like = `%${search}%`;
      paramCount++;
      query += ` AND (svh.notes ILIKE $${paramCount} OR pc.name ILIKE $${paramCount})`;
      params.push(like);
    }

    query += ` ORDER BY svh.snapshot_date DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const historyResult = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM stock_value_history WHERE store_id = $1`;
    const countParams = [storeId];
    let countParamCount = 1;

    if (priceCategoryId) {
      countParamCount++;
      countQuery += ` AND price_category_id = $${countParamCount}`;
      countParams.push(priceCategoryId);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND snapshot_date >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND snapshot_date < ($${countParamCount}::date + interval '1 day')`;
      countParams.push(endDate);
    }

    if (search) {
      const like = `%${search}%`;
      countParamCount++;
      countQuery += `
        AND (svh.notes ILIKE $${countParamCount} OR EXISTS (
          SELECT 1 FROM price_categories pc2
          WHERE pc2.id = svh.price_category_id AND pc2.name ILIKE $${countParamCount}
        ))`;
      countParams.push(like);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = Number(countResult.rows[0].count);

    res.status(200).json({
      success: true,
      message: t("stock_value_history_fetched", getLang(req)),
      data: historyResult.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get stock value history list error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Get single stock value history detail with items
export const getStockValueHistoryDetail = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { historyId } = req.params;

  try {
    // Get main history record
    const historyResult = await pool.query(
      `
            SELECT 
                svh.*,
                u.name AS created_by_name,
                pc.name AS price_category_name,
                s.name AS store_name
            FROM stock_value_history svh
            LEFT JOIN users u ON svh.created_by = u.id
            LEFT JOIN price_categories pc ON svh.price_category_id = pc.id
            LEFT JOIN stores s ON svh.store_id = s.id
            WHERE svh.id = $1 AND svh.store_id = $2
        `,
      [historyId, storeId],
    );

    if (historyResult.rows.length === 0) {
      return respondWithError(req, res, 404, "history_not_found");
    }

    const history = historyResult.rows[0];

    // Get detail items
    const itemsResult = await pool.query(
      `
            SELECT *
            FROM stock_value_history_items
            WHERE history_id = $1
            ORDER BY product_name
        `,
      [historyId],
    );

    res.status(200).json({
      success: true,
      message: t("stock_value_history_detail_fetched", getLang(req)),
      data: {
        ...history,
        items: itemsResult.rows,
      },
    });
  } catch (err) {
    console.error("Get stock value history detail error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Delete stock value history
export const deleteStockValueHistory = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { historyId } = req.params;

  try {
    // Check if history exists and belongs to the store
    const checkResult = await pool.query(
      "SELECT id FROM stock_value_history WHERE id = $1 AND store_id = $2",
      [historyId, storeId],
    );

    if (checkResult.rows.length === 0) {
      return respondWithError(req, res, 404, "history_not_found");
    }

    // Delete (cascade will delete items automatically)
    await pool.query("DELETE FROM stock_value_history WHERE id = $1", [
      historyId,
    ]);

    await logActivity(pool, {
      userId: req.user?.id,
      storeId: storeId,
      action: "delete_stock_value_history",
      description: {
        history: historyId,
      },
      ip: req.ip,
    });
    
    res.status(200).json({
      success: true,
      message: t("stock_value_history_deleted", getLang(req)),
    });
  } catch (err) {
    console.error("Delete stock value history error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Update batch details (batch_number, cost_price, expiry_date)
export const updateBatch = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { batch_id, batch_number, cost_price, expiry_date } = req.body;

  try {
    // Check if batch exists and belongs to the store
    const batchResult = await pool.query(
      `SELECT id, batch_number, cost_price, expiry_date, product_id 
             FROM inventory_batches 
             WHERE id = $1 AND store_id = $2`,
      [batch_id, storeId],
    );

    if (batchResult.rows.length === 0) {
      return respondWithError(req, res, 404, "batch_not_found");
    }

    const currentBatch = batchResult.rows[0];

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (
      batch_number !== undefined &&
      batch_number !== currentBatch.batch_number
    ) {
      updates.push(`batch_number = $${paramIndex++}`);
      values.push(batch_number);
    }

    if (cost_price !== undefined) {
      const newCostPrice =
        cost_price === "" || cost_price === null
          ? null
          : parseFloat(cost_price);
      updates.push(`cost_price = $${paramIndex++}`);
      values.push(newCostPrice);
    }

    if (expiry_date !== undefined) {
      const newExpiryDate =
        expiry_date === "" || expiry_date === null ? null : expiry_date;
      updates.push(`expiry_date = $${paramIndex++}`);
      values.push(newExpiryDate);
    }

    if (updates.length === 0) {
      return res.status(200).json({
        success: true,
        message: t("no_changes", getLang(req)),
      });
    }

    // Add batch_id for WHERE clause
    values.push(batch_id);

    const updateQuery = `
            UPDATE inventory_batches 
            SET ${updates.join(", ")}, updated_at = NOW()
            WHERE id = $${paramIndex}
            RETURNING id, batch_number, cost_price, expiry_date, status
        `;

    const updateResult = await pool.query(updateQuery, values);
    const updatedBatch = updateResult.rows[0];

    // Log the batch update
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
             VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        "update_batch",
        JSON.stringify({
          batch_id,
          product_id: currentBatch.product_id,
          changes: {
            batch_number:
              batch_number !== undefined
                ? { old: currentBatch.batch_number, new: batch_number }
                : undefined,
            cost_price:
              cost_price !== undefined
                ? { old: currentBatch.cost_price, new: cost_price }
                : undefined,
            expiry_date:
              expiry_date !== undefined
                ? { old: currentBatch.expiry_date, new: expiry_date }
                : undefined,
          },
        }),
        req.ip,
        storeId,
      ],
    );

    res.status(200).json({
      success: true,
      message: t("batch_updated", getLang(req)),
      batch: updatedBatch,
    });
  } catch (err) {
    console.error("Update batch error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// ==================== STOCK ADJUSTMENT ====================

// Create Stock Adjustment (Add or Remove stock)
export const createStockAdjustment = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const userId = req.user.id;
  const { product_id, adjustment_type, quantity, reason, notes } = req.body;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Check if product exists in the store
    const productResult = await client.query(
      `SELECT id, name, unit FROM products WHERE id = $1 AND store_id = $2`,
      [product_id, storeId],
    );

    if (productResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "product_not_found");
    }

    const product = productResult.rows[0];

    // 2. Find the latest batch for this product
    const latestBatchResult = await client.query(
      `SELECT id FROM inventory_batches 
             WHERE product_id = $1 AND store_id = $2 
             ORDER BY created_at DESC LIMIT 1`,
      [product_id, storeId],
    );

    const targetBatchId = latestBatchResult.rows[0]?.id || null;

    // 3. Get current stock for validation (if reducing)
    if (adjustment_type === "subtract") {
      const stockResult = await client.query(
        `SELECT COALESCE(SUM(
                    CASE WHEN type = 'IN' THEN quantity ELSE -quantity END
                ), 0) AS current_stock
                FROM inventory_movements
                WHERE store_id = $1 AND product_id = $2`,
        [storeId, product_id],
      );

      const currentStock = Number(stockResult.rows[0]?.current_stock || 0);

      if (quantity > currentStock) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: t("insufficient_stock", lang),
          current_stock: currentStock,
          requested: quantity,
        });
      }
    }

    // 4. Create adjustment record
    const adjustmentResult = await client.query(
      `INSERT INTO stock_adjustments (
                store_id, product_id, batch_id, adjustment_type, quantity, 
                reason, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
      [
        storeId,
        product_id,
        targetBatchId,
        adjustment_type,
        quantity,
        reason,
        notes || null,
        userId,
      ],
    );

    const adjustment = adjustmentResult.rows[0];

    // 5. Create inventory movement record linked to the batch
    const movementType = adjustment_type === "add" ? "IN" : "OUT";
    const movementNote = `Stock adjustment: ${reason}${notes ? " - " + notes : ""}`;

    await client.query(
      `INSERT INTO inventory_movements (
                store_id, product_id, batch_id, quantity, type, note, created_by, transaction_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        storeId,
        product_id,
        targetBatchId,
        quantity,
        movementType,
        movementNote,
        userId,
      ],
    );

    // 6. Log the stock adjustment
    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
             VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        "stock_adjustment",
        JSON.stringify({
          adjustment_id: adjustment.id,
          product_id,
          product_name: product.name,
          batch_id: targetBatchId,
          adjustment_type,
          quantity,
          reason,
          notes: notes || null,
        }),
        req.ip,
        storeId,
      ],
    );

    await client.query("COMMIT");

    // Emit realtime event
    const io = getIO();
    io.to(storeId).emit("inventory:adjusted", {
      message: t("stock_adjusted", lang),
      adjustment: {
        ...adjustment,
        product_name: product.name,
      },
    });

    notifyStore({
      storeId,
      type: "stock_adjustment",
      title: "Stock adjusted",
      message: "Inventory quantity was adjusted",
      meta: { product: product.name, adjustment_type, quantity, reason },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: t("stock_adjusted", lang),
      adjustment: {
        ...adjustment,
        product_name: product.name,
        product_unit: product.unit,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Stock adjustment error:", err.message);
    respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// Get Stock Adjustment History
export const getStockAdjustments = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const {
    product_id,
    adjustment_type,
    reason,
    page = 1,
    limit = 20,
    startDate,
    endDate,
  } = req.query;
  const lang = getLang(req);

  try {
    const offset = (page - 1) * limit;

    let query = `
            SELECT 
                sa.id,
                sa.product_id,
                p.name AS product_name,
                p.unit AS product_unit,
                sa.adjustment_type,
                sa.quantity,
                sa.reason,
                sa.notes,
                sa.created_at,
                u.name AS created_by_name
            FROM stock_adjustments sa
            LEFT JOIN products p ON sa.product_id = p.id
            LEFT JOIN users u ON sa.created_by = u.id
            WHERE sa.store_id = $1
        `;

    const params = [storeId];
    let paramCount = 1;

    if (product_id) {
      paramCount++;
      query += ` AND sa.product_id = $${paramCount}`;
      params.push(product_id);
    }

    if (adjustment_type) {
      paramCount++;
      query += ` AND sa.adjustment_type = $${paramCount}`;
      params.push(adjustment_type);
    }

    if (reason) {
      paramCount++;
      query += ` AND sa.reason = $${paramCount}`;
      params.push(reason);
    }

    if (startDate) {
      paramCount++;
      query += ` AND sa.created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND sa.created_at < ($${paramCount}::date + interval '1 day')`;
      params.push(endDate);
    }

    query += ` ORDER BY sa.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const adjustmentsResult = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM stock_adjustments WHERE store_id = $1`;
    const countParams = [storeId];
    let countParamCount = 1;

    if (product_id) {
      countParamCount++;
      countQuery += ` AND product_id = $${countParamCount}`;
      countParams.push(product_id);
    }

    if (adjustment_type) {
      countParamCount++;
      countQuery += ` AND adjustment_type = $${countParamCount}`;
      countParams.push(adjustment_type);
    }

    if (reason) {
      countParamCount++;
      countQuery += ` AND reason = $${countParamCount}`;
      countParams.push(reason);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND created_at >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND created_at < ($${countParamCount}::date + interval '1 day')`;
      countParams.push(endDate);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = Number(countResult.rows[0].count);

    res.status(200).json({
      success: true,
      message: t("adjustments_fetched", lang),
      adjustments: adjustmentsResult.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get stock adjustments error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Get single adjustment detail
export const getStockAdjustmentDetail = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { adjustmentId } = req.params;
  const lang = getLang(req);

  try {
    const result = await pool.query(
      `
            SELECT 
                sa.*,
                p.name AS product_name,
                p.unit AS product_unit,
                u.name AS created_by_name
            FROM stock_adjustments sa
            LEFT JOIN products p ON sa.product_id = p.id
            LEFT JOIN users u ON sa.created_by = u.id
            WHERE sa.id = $1 AND sa.store_id = $2
        `,
      [adjustmentId, storeId],
    );

    if (result.rows.length === 0) {
      return respondWithError(req, res, 404, "adjustment_not_found");
    }

    res.status(200).json({
      success: true,
      adjustment: result.rows[0],
    });
  } catch (err) {
    console.error("Get adjustment detail error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Get batch-wise stock (batches with stock + latest empty batch per product)
// Only returns products that have at least one stock record (batch or movement)
export const getBatchwiseStock = async (req, res) => {
  const storeId = req.user?.current_store_id;

  try {
    const result = await pool.query(
      `
            WITH batch_stock AS (
                SELECT 
                    ib.id AS batch_id,
                    ib.product_id,
                    ib.batch_number,
                    ib.cost_price,
                    ib.expiry_date,
                    ib.status,
                    ib.created_at,
                    p.name AS product_name,
                    p.unit,
                    p.minimum_stock,
                    c.name AS category_name,
                    COALESCE(SUM(
                        CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
                    ), 0) AS current_stock
                FROM inventory_batches ib
                JOIN products p ON ib.product_id = p.id
                LEFT JOIN product_categories c ON p.category_id = c.id
                LEFT JOIN inventory_movements im ON ib.id = im.batch_id
                WHERE ib.store_id = $1
                  -- Only include batches that have at least one movement record
                  AND EXISTS (
                      SELECT 1 FROM inventory_movements im2 
                      WHERE im2.batch_id = ib.id
                  )
                GROUP BY ib.id, ib.product_id, ib.batch_number, ib.cost_price, 
                         ib.expiry_date, ib.status, ib.created_at, p.name, p.unit, 
                         p.minimum_stock, c.name
            ),
            batches_with_stock AS (
                SELECT * FROM batch_stock WHERE current_stock > 0
            ),
            latest_empty_batches AS (
                SELECT DISTINCT ON (product_id) *
                FROM batch_stock
                WHERE current_stock <= 0
                ORDER BY product_id, created_at DESC
            )
            SELECT * FROM batches_with_stock
            UNION ALL
            SELECT * FROM latest_empty_batches
            WHERE product_id NOT IN (SELECT DISTINCT product_id FROM batches_with_stock)
               OR product_id IN (SELECT DISTINCT product_id FROM batches_with_stock)
            ORDER BY product_name, batch_number
        `,
      [storeId],
    );

    res.status(200).json({
      success: true,
      message: t("batchwise_stock_fetched", getLang(req)),
      batches: result.rows,
    });
  } catch (err) {
    console.error("Get batchwise stock error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Create Stock Adjustment with optional batch_id (batch-specific or auto-latest)
export const createBatchwiseStockAdjustment = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const userId = req.user.id;
  const { product_id, batch_id, adjustment_type, quantity, reason, notes } =
    req.body;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Check if product exists in the store
    const productResult = await client.query(
      `SELECT id, name, unit FROM products WHERE id = $1 AND store_id = $2`,
      [product_id, storeId],
    );

    if (productResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "product_not_found");
    }

    const product = productResult.rows[0];

    // 2. Determine target batch
    let targetBatchId = batch_id;

    if (!targetBatchId) {
      // Find the latest batch for this product
      const latestBatchResult = await client.query(
        `SELECT id FROM inventory_batches 
                 WHERE product_id = $1 AND store_id = $2 
                 ORDER BY created_at DESC LIMIT 1`,
        [product_id, storeId],
      );

      if (latestBatchResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: t("no_batch_found", lang),
        });
      }
      targetBatchId = latestBatchResult.rows[0].id;
    } else {
      // Verify the batch exists and belongs to this product/store
      const batchCheck = await client.query(
        `SELECT id FROM inventory_batches 
                 WHERE id = $1 AND product_id = $2 AND store_id = $3`,
        [batch_id, product_id, storeId],
      );

      if (batchCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return respondWithError(req, res, 404, "batch_not_found");
      }
    }

    // 3. Get current batch stock for validation (if reducing)
    if (adjustment_type === "subtract") {
      const stockResult = await client.query(
        `SELECT COALESCE(SUM(
                    CASE WHEN type = 'IN' THEN quantity ELSE -quantity END
                ), 0) AS current_stock
                FROM inventory_movements
                WHERE batch_id = $1`,
        [targetBatchId],
      );

      const currentBatchStock = Number(stockResult.rows[0]?.current_stock || 0);

      if (quantity > currentBatchStock) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: t("insufficient_batch_stock", lang),
          current_stock: currentBatchStock,
          requested: quantity,
        });
      }
    }

    // 4. Create adjustment record
    const adjustmentResult = await client.query(
      `INSERT INTO stock_adjustments (
                store_id, product_id, batch_id, adjustment_type, quantity, 
                reason, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
      [
        storeId,
        product_id,
        targetBatchId,
        adjustment_type,
        quantity,
        reason,
        notes || null,
        userId,
      ],
    );

    const adjustment = adjustmentResult.rows[0];

    // 5. Create inventory movement record linked to the batch
    const movementType = adjustment_type === "add" ? "IN" : "OUT";
    const movementNote = `Stock adjustment: ${reason}${notes ? " - " + notes : ""}`;

    await client.query(
      `INSERT INTO inventory_movements (
                store_id, product_id, batch_id, quantity, type, note, created_by, transaction_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        storeId,
        product_id,
        targetBatchId,
        quantity,
        movementType,
        movementNote,
        userId,
      ],
    );

    // 6. Log the batchwise stock adjustment
    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
             VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        "batchwise_stock_adjustment",
        JSON.stringify({
          adjustment_id: adjustment.id,
          product_id,
          product_name: product.name,
          batch_id: targetBatchId,
          is_batch_specific: !!batch_id,
          adjustment_type,
          quantity,
          reason,
          notes: notes || null,
        }),
        req.ip,
        storeId,
      ],
    );

    await client.query("COMMIT");

    // Emit realtime event
    const io = getIO();
    io.to(storeId).emit("inventory:adjusted", {
      message: t("stock_adjusted", lang),
      adjustment: {
        ...adjustment,
        product_name: product.name,
      },
    });

    notifyStore({
      storeId,
      type: "stock_adjustment",
      title: "Stock adjusted",
      message: "Inventory quantity was adjusted",
      meta: { product: product.name, adjustment_type, quantity, reason },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: t("stock_adjusted", lang),
      adjustment: {
        ...adjustment,
        product_name: product.name,
        product_unit: product.unit,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Batchwise stock adjustment error:", err.message);
    respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

