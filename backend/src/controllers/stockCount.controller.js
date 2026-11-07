import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
// ==================== STOCK COUNT FUNCTIONS ====================

/**
 * Get stock movements (outgoing or incoming) with filters
 * Used for Outgoing Stock and Incoming Stock tabs
 */
export const getStockMovementsByType = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const {
    movement_type, // 'OUT' for outgoing, 'IN' for incoming
    page = 1,
    limit = 25,
    search = "",
    startDate,
    endDate,
    product_id,
    category_id,
  } = req.query;
  const lang = getLang(req);

  try {
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        im.id,
        im.product_id,
        im.batch_id,
        im.quantity,
        im.type,
        im.note,
        im.created_at,
        p.name AS product_name,
        p.unit AS product_unit,
        c.name AS category_name,
        ib.batch_number,
        u.name AS created_by_name
      FROM inventory_movements im
      LEFT JOIN products p ON im.product_id = p.id
      LEFT JOIN product_categories c ON p.category_id = c.id
      LEFT JOIN inventory_batches ib ON im.batch_id = ib.id
      LEFT JOIN users u ON im.created_by = u.id
      WHERE im.store_id = $1
    `;

    const params = [storeId];
    let paramCount = 1;

    if (movement_type) {
      paramCount++;
      query += ` AND im.type = $${paramCount}`;
      params.push(movement_type);
    }

    if (product_id) {
      paramCount++;
      query += ` AND im.product_id = $${paramCount}`;
      params.push(product_id);
    }

    if (category_id) {
      paramCount++;
      query += ` AND p.category_id = $${paramCount}`;
      params.push(category_id);
    }

    if (startDate) {
      paramCount++;
      query += ` AND im.created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND im.created_at < ($${paramCount}::date + interval '1 day')`;
      params.push(endDate);
    }

    if (search) {
      const like = `%${search}%`;
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR c.name ILIKE $${paramCount} OR im.note ILIKE $${paramCount})`;
      params.push(like);
    }

    query += ` ORDER BY im.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const movementsResult = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) 
      FROM inventory_movements im
      LEFT JOIN products p ON im.product_id = p.id
      WHERE im.store_id = $1
    `;
    const countParams = [storeId];
    let countParamCount = 1;

    if (movement_type) {
      countParamCount++;
      countQuery += ` AND im.type = $${countParamCount}`;
      countParams.push(movement_type);
    }

    if (product_id) {
      countParamCount++;
      countQuery += ` AND im.product_id = $${countParamCount}`;
      countParams.push(product_id);
    }

    if (category_id) {
      countParamCount++;
      countQuery += ` AND p.category_id = $${countParamCount}`;
      countParams.push(category_id);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND im.created_at >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND im.created_at < ($${countParamCount}::date + interval '1 day')`;
      countParams.push(endDate);
    }

    if (search) {
      const like = `%${search}%`;
      countParamCount++;
      countQuery += ` AND (p.name ILIKE $${countParamCount} OR c.name ILIKE $${countParamCount} OR im.note ILIKE $${countParamCount})`;
      countParams.push(like);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = Number(countResult.rows[0].count);

    // Calculate totals for summary
    let totalQuery = `
      SELECT 
        COUNT(*) AS total_movements,
        COALESCE(SUM(quantity), 0) AS total_quantity
      FROM inventory_movements im
      LEFT JOIN products p ON im.product_id = p.id
      WHERE im.store_id = $1
    `;

    if (movement_type) {
      totalQuery += ` AND im.type = '${movement_type}'`;
    }

    if (startDate && endDate) {
      totalQuery += ` AND im.created_at >= '${startDate}' AND im.created_at < ('${endDate}'::date + interval '1 day')`;
    }

    const totalResult = await pool.query(totalQuery, [storeId]);

    res.status(200).json({
      success: true,
      message: t("movements_fetched", lang),
      movements: movementsResult.rows,
      summary: {
        total_movements: Number(totalResult.rows[0].total_movements),
        total_quantity: Number(totalResult.rows[0].total_quantity),
      },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get stock movements by type error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

/**
 * Get products with current stock for stock count
 */
export const getProductsForStockCount = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { category_id, page = 1, limit = 25, search = '' } = req.query;
  const lang = getLang(req);

  try {
    const offset = (page - 1) * limit;

    let query = `
      WITH product_stock AS (
        SELECT 
          p.id AS product_id,
          p.name AS product_name,
          p.unit,
          p.minimum_stock,
          c.id AS category_id,
          c.name AS category_name,
          COALESCE(SUM(
            CASE 
              WHEN im.type = 'IN' THEN im.quantity 
              WHEN im.type = 'OUT' THEN -im.quantity
              ELSE 0 
            END
          ), 0) AS system_stock
        FROM products p
        LEFT JOIN product_categories c ON p.category_id = c.id
        LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.store_id = p.store_id
        LEFT JOIN inventory_movements im ON im.batch_id = ib.id
        WHERE p.store_id = $1 AND p.status = 'active'
    `;

    const params = [storeId];
    let paramCount = 1;

    if (category_id) {
      paramCount++;
      query += ` AND p.category_id = $${paramCount}`;
      params.push(category_id);
    }

    if (search) {
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR c.name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += `
        GROUP BY p.id, p.name, p.unit, p.minimum_stock, c.id, c.name
      )
      SELECT * FROM product_stock
      ORDER BY product_name
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);

    const productsResult = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      WHERE p.store_id = $1 AND p.status = 'active'
    `;
    const countParams = [storeId];
    let countParamCount = 1;

    if (category_id) {
      countParamCount++;
      countQuery += ` AND p.category_id = $${countParamCount}`;
      countParams.push(category_id);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (p.name ILIKE $${countParamCount} OR c.name ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = Number(countResult.rows[0].count);

    res.status(200).json({
      success: true,
      message: t("products_fetched", lang),
      products: productsResult.rows,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (err) {
    console.error("Get products for stock count error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

/**
 * Save stock count results
 * Adjusts stock based on counted vs system quantities
 */
export const saveStockCount = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const userId = req.user.id;
  const { items, notes } = req.body;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Generate stock count reference
    const stockCountRef = `SC-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create stock count record
    const stockCountResult = await client.query(
      `INSERT INTO stock_counts (
        store_id, reference_number, notes, created_by
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [storeId, stockCountRef, notes || null, userId]
    );

    const stockCountId = stockCountResult.rows[0].id;
    const adjustments = [];

    for (const item of items) {
      const { product_id, counted_qty } = item;

      // Get current system stock
      const systemStockResult = await client.query(
        `SELECT COALESCE(SUM(
          CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
        ), 0) AS system_stock
        FROM inventory_movements im
        JOIN inventory_batches ib ON im.batch_id = ib.id
        WHERE im.store_id = $1 AND im.product_id = $2`,
        [storeId, product_id]
      );

      const systemStock = Number(systemStockResult.rows[0]?.system_stock || 0);
      const difference = counted_qty - systemStock;

      // Skip if no difference
      if (difference === 0) continue;

      // Get product info
      const productResult = await client.query(
        `SELECT name, unit FROM products WHERE id = $1`,
        [product_id]
      );
      const product = productResult.rows[0];

      // Create stock count item record
      await client.query(
        `INSERT INTO stock_count_items (
          stock_count_id, product_id, system_qty, counted_qty, difference
        ) VALUES ($1, $2, $3, $4, $5)`,
        [stockCountId, product_id, systemStock, counted_qty, difference]
      );

      if (difference > 0) {
        // POSITIVE difference - Add to latest batch
        const latestBatchResult = await client.query(
          `SELECT id FROM inventory_batches 
           WHERE product_id = $1 AND store_id = $2 
           ORDER BY created_at DESC LIMIT 1`,
          [product_id, storeId]
        );

        let targetBatchId;

        if (latestBatchResult.rows.length > 0) {
          targetBatchId = latestBatchResult.rows[0].id;
        } else {
          // Create new batch if none exists
          const newBatchResult = await client.query(
            `INSERT INTO inventory_batches (
              store_id, product_id, batch_number, status, created_by
            ) VALUES ($1, $2, $3, 'active', $4)
            RETURNING id`,
            [storeId, product_id, `SC-${stockCountRef}`, userId]
          );
          targetBatchId = newBatchResult.rows[0].id;
        }

        // Create IN movement
        await client.query(
          `INSERT INTO inventory_movements (
            store_id, product_id, batch_id, quantity, type, note, created_by, transaction_date
          ) VALUES ($1, $2, $3, $4, 'IN', $5, $6, NOW())`,
          [
            storeId,
            product_id,
            targetBatchId,
            difference,
            `Stock count adjustment - found extra (Ref: ${stockCountRef})`,
            userId,
          ]
        );

        // Create adjustment record
        await client.query(
          `INSERT INTO stock_adjustments (
            store_id, product_id, batch_id, adjustment_type, quantity, 
            reason, notes, created_by
          ) VALUES ($1, $2, $3, 'add', $4, 'found', $5, $6)`,
          [
            storeId,
            product_id,
            targetBatchId,
            difference,
            `Stock count: ${stockCountRef}`,
            userId,
          ]
        );

        adjustments.push({
          product_id,
          product_name: product.name,
          system_stock: systemStock,
          counted_qty,
          difference,
          action: "added",
        });
      } else {
        // NEGATIVE difference - Remove from oldest batch(es)
        let remainingToRemove = Math.abs(difference);

        // Get batches from oldest to newest with available stock
        const batchesResult = await client.query(
          `SELECT ib.id, 
                  COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END), 0) AS available
           FROM inventory_batches ib
           LEFT JOIN inventory_movements im ON ib.id = im.batch_id
           WHERE ib.product_id = $1 AND ib.store_id = $2
           GROUP BY ib.id
           HAVING COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END), 0) > 0
           ORDER BY ib.created_at ASC`,
          [product_id, storeId]
        );

        for (const batch of batchesResult.rows) {
          if (remainingToRemove <= 0) break;

          const removeFromBatch = Math.min(Number(batch.available), remainingToRemove);

          // Create OUT movement
          await client.query(
            `INSERT INTO inventory_movements (
              store_id, product_id, batch_id, quantity, type, note, created_by, transaction_date
            ) VALUES ($1, $2, $3, $4, 'OUT', $5, $6, NOW())`,
            [
              storeId,
              product_id,
              batch.id,
              removeFromBatch,
              `Stock count adjustment - shortage (Ref: ${stockCountRef})`,
              userId,
            ]
          );

          // Create adjustment record
          await client.query(
            `INSERT INTO stock_adjustments (
              store_id, product_id, batch_id, adjustment_type, quantity, 
              reason, notes, created_by
            ) VALUES ($1, $2, $3, 'subtract', $4, 'lost', $5, $6)`,
            [
              storeId,
              product_id,
              batch.id,
              removeFromBatch,
              `Stock count: ${stockCountRef}`,
              userId,
            ]
          );

          remainingToRemove -= removeFromBatch;
        }

        adjustments.push({
          product_id,
          product_name: product.name,
          system_stock: systemStock,
          counted_qty,
          difference,
          action: "removed",
        });
      }
    }

    // Log the stock count
    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        "stock_count",
        JSON.stringify({
          stock_count_id: stockCountId,
          reference_number: stockCountRef,
          items_checked: items.length,
          adjustments_made: adjustments.length,
          adjustments,
        }),
        req.ip,
        storeId,
      ]
    );

    await client.query("COMMIT");

    // Emit realtime event
    const io = getIO();
    io.to(storeId).emit("stockcount:completed", {
      message: t("stock_count_saved", lang),
      stockCountId,
    });

    res.status(201).json({
      success: true,
      message: t("stock_count_saved", lang),
      stockCount: {
        id: stockCountId,
        reference_number: stockCountRef,
        items_checked: items.length,
        adjustments_made: adjustments.length,
        adjustments,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Save stock count error:", err.message);
    respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

/**
 * Get stock count history
 */
export const getStockCountHistory = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { page = 1, limit = 20, startDate, endDate } = req.query;
  const lang = getLang(req);

  try {
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        st.id,
        st.reference_number,
        st.notes,
        st.created_at,
        u.name AS created_by_name,
        (SELECT COUNT(*) FROM stock_count_items WHERE stock_count_id = st.id) AS items_count,
        (SELECT COUNT(*) FROM stock_count_items WHERE stock_count_id = st.id AND difference != 0) AS adjustments_count
      FROM stock_counts st
      LEFT JOIN users u ON st.created_by = u.id
      WHERE st.store_id = $1
    `;

    const params = [storeId];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND st.created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND st.created_at < ($${paramCount}::date + interval '1 day')`;
      params.push(endDate);
    }

    query += ` ORDER BY st.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const historyResult = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM stock_counts WHERE store_id = $1`;
    const countParams = [storeId];

    if (startDate) {
      countQuery += ` AND created_at >= $2`;
      countParams.push(startDate);
    }

    if (endDate) {
      countQuery += ` AND created_at < ($${countParams.length + 1}::date + interval '1 day')`;
      countParams.push(endDate);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = Number(countResult.rows[0].count);

    res.status(200).json({
      success: true,
      message: t("stock_count_history_fetched", lang),
      stockCounts: historyResult.rows,
    });
  } catch (err) {
    console.error("Get stock count history error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

/**
 * Get single stock count detail with items
 */
export const getStockCountDetail = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { stockCountId } = req.params;
  const lang = getLang(req);

  try {
    // Get stock count record
    const stockCountResult = await pool.query(
      `SELECT 
        st.*,
        u.name AS created_by_name
      FROM stock_counts st
      LEFT JOIN users u ON st.created_by = u.id
      WHERE st.id = $1 AND st.store_id = $2`,
      [stockCountId, storeId]
    );

    if (stockCountResult.rows.length === 0) {
      return respondWithError(req, res, 404, "stock_count_not_found");
    }

    const stockCount = stockCountResult.rows[0];

    // Get items
    const itemsResult = await pool.query(
      `SELECT 
        sti.*,
        p.name AS product_name,
        p.unit AS product_unit
      FROM stock_count_items sti
      LEFT JOIN products p ON sti.product_id = p.id
      WHERE sti.stock_count_id = $1
      ORDER BY p.name`,
      [stockCountId]
    );

    res.status(200).json({
      success: true,
      stockCount: {
        ...stockCount,
        items: itemsResult.rows,
      },
    });
  } catch (err) {
    console.error("Get stock count detail error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

/**
 * Get adjustment history grouped by product
 * For the improved Adjustment History tab
 */
export const getAdjustmentsByProduct = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { page = 1, limit = 20 } = req.query;
  const lang = getLang(req);

  try {
    const offset = (page - 1) * limit;

    // Get products with adjustment counts
    const productsQuery = `
      SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.unit,
        c.name AS category_name,
        COUNT(sa.id) AS adjustment_count,
        SUM(CASE WHEN sa.adjustment_type = 'add' THEN sa.quantity ELSE 0 END) AS total_added,
        SUM(CASE WHEN sa.adjustment_type = 'subtract' THEN sa.quantity ELSE 0 END) AS total_subtracted,
        MAX(sa.created_at) AS last_adjustment
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      INNER JOIN stock_adjustments sa ON sa.product_id = p.id AND sa.store_id = $1
      WHERE p.store_id = $1
      GROUP BY p.id, p.name, p.unit, c.name
      ORDER BY last_adjustment DESC
      LIMIT $2 OFFSET $3
    `;

    const productsResult = await pool.query(productsQuery, [storeId, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT product_id) AS total
      FROM stock_adjustments
      WHERE store_id = $1
    `;
    const countResult = await pool.query(countQuery, [storeId]);
    const total = Number(countResult.rows[0].total);

    res.status(200).json({
      success: true,
      message: t("adjustments_by_product_fetched", lang),
      products: productsResult.rows,
    });
  } catch (err) {
    console.error("Get adjustments by product error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

/**
 * Get all adjustments for a specific product
 * For the adjustment detail modal
 */
export const getProductAdjustments = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { productId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const lang = getLang(req);

  try {
    const offset = (page - 1) * limit;

    const adjustmentsQuery = `
      SELECT 
        sa.id,
        sa.adjustment_type,
        sa.quantity,
        sa.reason,
        sa.notes,
        sa.created_at,
        ib.batch_number,
        u.name AS created_by_name,
        (
          SELECT COALESCE(SUM(
            CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
          ), 0)
          FROM inventory_movements im
          WHERE im.store_id = sa.store_id 
            AND im.product_id = sa.product_id
            AND im.created_at <= sa.created_at
        ) AS quantity_after,
        (
          SELECT COALESCE(SUM(
            CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
          ), 0)
          FROM inventory_movements im
          WHERE im.store_id = sa.store_id 
            AND im.product_id = sa.product_id
            AND im.created_at <= sa.created_at
        ) - CASE WHEN sa.adjustment_type = 'add' THEN sa.quantity ELSE -sa.quantity END AS quantity_before
      FROM stock_adjustments sa
      LEFT JOIN inventory_batches ib ON sa.batch_id = ib.id
      LEFT JOIN users u ON sa.created_by = u.id
      WHERE sa.store_id = $1 AND sa.product_id = $2
      ORDER BY sa.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const adjustmentsResult = await pool.query(adjustmentsQuery, [
      storeId,
      productId,
      limit,
      offset,
    ]);

    // Get product info
    const productResult = await pool.query(
      `SELECT p.name, p.unit, c.name AS category_name
       FROM products p
       LEFT JOIN product_categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [productId]
    );

    const product = productResult.rows[0] || {};

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM stock_adjustments 
      WHERE store_id = $1 AND product_id = $2
    `;
    const countResult = await pool.query(countQuery, [storeId, productId]);
    const total = Number(countResult.rows[0].count);

    res.status(200).json({
      success: true,
      message: t("product_adjustments_fetched", lang),
      product: {
        id: productId,
        name: product.name,
        unit: product.unit,
        category_name: product.category_name,
      },
      adjustments: adjustmentsResult.rows,
    });
  } catch (err) {
    console.error("Get product adjustments error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

