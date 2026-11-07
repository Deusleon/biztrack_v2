import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
import getStoreSettings from '../utils/getStoreSettings.js';
// GET PRICELIST
export const getPricelist = async (req, res) => {
  const userId = req.user?.id;
  const storeId = req.user?.current_store_id;
  const storeSettings = await getStoreSettings(storeId);
  const priceCategoryId =
    req?.query?.priceCategoryId ||
    storeSettings?.operations?.defaultPriceCategory ||
    null;
  const useBatchWisePrice =
    storeSettings?.operations?.useBatchWisePrice || false;
  const page     = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit    = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const offset   = (page - 1) * limit;
  const search   = req.query.search?.trim() || '';
  // Batch-per-row expansion is OPT-IN via ?expandBatches=true. This endpoint
  // is shared with other screens (e.g. the Sales product picker) that need
  // exactly one row per product regardless of the useBatchWisePrice setting —
  // only the Price List page asks for the expanded, one-row-per-batch view.
  const expandBatches = req.query.expandBatches === 'true';
  // Allow storeId via query (from frontend) or fallback to authenticated user's current_store
  try {
    if (!storeId) {
      return respondWithError(req, res, 400, "store_id_required");
    }

    // ── BATCH-WISE MODE: one row per (product, batch) ─────────────────────
    // When the store setting "useBatchWisePrice" is enabled, the price list
    // should behave like the "Batchwise Adjustment" list: every batch of a
    // product gets its own row with its own cost/selling price, instead of
    // collapsing a product down to a single (latest) batch.
    if (useBatchWisePrice && expandBatches) {
      return getPricelistBatchwise(req, res, {
        storeId,
        priceCategoryId,
        page,
        limit,
        offset,
        search,
      });
    }

    const baseParams = [storeId, useBatchWisePrice, priceCategoryId];
    let searchCond = '';
    if (search) {
      baseParams.push(`%${search}%`);
      searchCond = `AND (p.name ILIKE $${baseParams.length} OR p.barcode ILIKE $${baseParams.length})`;
    }

    // Count query
    const countParams = [storeId];
    let countSearch = '';
    if (search) {
      countParams.push(`%${search}%`);
      countSearch = `AND (p.name ILIKE $${countParams.length} OR p.barcode ILIKE $${countParams.length})`;
    }
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products p
       WHERE p.store_id = $1 ${countSearch}
       AND (
         SELECT COALESCE(SUM(
           CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
         ), 0)
         FROM inventory_movements im
         JOIN inventory_batches ib_stock ON im.batch_id = ib_stock.id
         WHERE ib_stock.product_id = p.id
           AND ib_stock.store_id = p.store_id
           AND (ib_stock.expiry_date IS NULL OR ib_stock.expiry_date > NOW())
       ) > 0`,
      countParams,
    );
    const total = Number(countResult.rows[0].count);

    const dataParams = [...baseParams, limit, offset];
    const result = await pool.query(
      `SELECT 
          p.id,
          p.name,
          p.category_id,
          c.name AS category_name,
          p.description,
          p.image_url,
          p.minimum_stock,
          p.barcode,
          p.unit,
          p.status,
          p.created_at,

            -- TOTAL AVAILABLE STOCK (excluding expired batches)
            (
              SELECT COALESCE(SUM(
                CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
              ), 0)
              FROM inventory_movements im
              JOIN inventory_batches ib_stock ON im.batch_id = ib_stock.id
              WHERE ib_stock.product_id = p.id
                AND ib_stock.store_id = p.store_id
                AND (
                  ib_stock.expiry_date IS NULL
                  OR ib_stock.expiry_date > NOW()
                )
            ) AS total_stock,

            -- COST PRICE (buying price)
            (
              SELECT ibx.cost_price
              FROM inventory_batches ibx
              WHERE ibx.id = (
                CASE
                  WHEN $2 = true THEN (
                    SELECT ib1.id
                    FROM inventory_batches ib1
                    WHERE ib1.product_id = p.id
                      AND ib1.store_id = p.store_id
                      AND ib1.status = 'active'
                      AND (
                        ib1.expiry_date IS NULL
                        OR ib1.expiry_date > NOW()
                      )
                    ORDER BY ib1.created_at DESC
                    LIMIT 1
                  )
                  ELSE (
                    SELECT ib2.id
                    FROM inventory_batches ib2
                    WHERE ib2.product_id = p.id
                      AND ib2.store_id = p.store_id
                      AND (
                        ib2.expiry_date IS NULL
                        OR ib2.expiry_date > NOW()
                      )
                    ORDER BY ib2.created_at DESC
                    LIMIT 1
                  )
                END
              )
            ) AS cost_price,

            -- SELLING PRICE
            (
              SELECT sp.price
              FROM selling_prices sp
              WHERE sp.batch_id = (
                CASE
                  WHEN $2 = true THEN (
                    SELECT ib1.id
                    FROM inventory_batches ib1
                    WHERE ib1.product_id = p.id
                      AND ib1.store_id = p.store_id
                      AND ib1.status = 'active'
                      AND (
                        ib1.expiry_date IS NULL
                        OR ib1.expiry_date > NOW()
                      )
                    ORDER BY ib1.created_at DESC
                    LIMIT 1
                  )
                  ELSE (
                    SELECT ib2.id
                    FROM inventory_batches ib2
                    WHERE ib2.product_id = p.id
                      AND ib2.store_id = p.store_id
                      AND (
                        ib2.expiry_date IS NULL
                        OR ib2.expiry_date > NOW()
                      )
                    ORDER BY ib2.created_at DESC
                    LIMIT 1
                  )
                END
              )
              AND sp.price_category_id = $3
              LIMIT 1
            ) AS selling_price,

            -- SELECTED BATCH NUMBER
            (
              SELECT ibx.batch_number
              FROM inventory_batches ibx
              WHERE ibx.id = (
                CASE
                  WHEN $2 = true THEN (
                    SELECT ib1.id
                    FROM inventory_batches ib1
                    WHERE ib1.product_id = p.id
                      AND ib1.store_id = p.store_id
                      AND ib1.status = 'active'
                      AND (
                        ib1.expiry_date IS NULL
                        OR ib1.expiry_date > NOW()
                      )
                    ORDER BY ib1.created_at DESC
                    LIMIT 1
                  )
                  ELSE (
                    SELECT ib2.id
                    FROM inventory_batches ib2
                    WHERE ib2.product_id = p.id
                      AND ib2.store_id = p.store_id
                      AND (
                        ib2.expiry_date IS NULL
                        OR ib2.expiry_date > NOW()
                      )
                    ORDER BY ib2.created_at DESC
                    LIMIT 1
                  )
                END
              )
            ) AS selected_batch_number,

            -- SELECTED BATCH ID (same batch used for cost/selling price above)
            (
              CASE
                WHEN $2 = true THEN (
                  SELECT ib1.id
                  FROM inventory_batches ib1
                  WHERE ib1.product_id = p.id
                    AND ib1.store_id = p.store_id
                    AND ib1.status = 'active'
                    AND (
                      ib1.expiry_date IS NULL
                      OR ib1.expiry_date > NOW()
                    )
                  ORDER BY ib1.created_at DESC
                  LIMIT 1
                )
                ELSE (
                  SELECT ib2.id
                  FROM inventory_batches ib2
                  WHERE ib2.product_id = p.id
                    AND ib2.store_id = p.store_id
                    AND (
                      ib2.expiry_date IS NULL
                      OR ib2.expiry_date > NOW()
                    )
                  ORDER BY ib2.created_at DESC
                  LIMIT 1
                )
              END
            ) AS selected_batch_id,

            -- BATCH LEVEL DATA (excluding expired batches)
            COALESCE(
              json_agg(
                jsonb_build_object(
                  'batch_id', ib.id,
                  'batch_number', ib.batch_number,
                  'cost_price', ib.cost_price,
                  'selling_price', (
                    SELECT sp2.price
                    FROM selling_prices sp2
                    WHERE sp2.batch_id = ib.id
                      AND sp2.price_category_id = $3
                    LIMIT 1
                  ),
                  'available_stock', (
                    SELECT COALESCE(SUM(
                      CASE WHEN im2.type = 'IN' THEN im2.quantity ELSE -im2.quantity END
                    ), 0)
                    FROM inventory_movements im2
                    WHERE im2.batch_id = ib.id
                  ),
                  'status', ib.status,
                  'created_at', ib.created_at,
                  'expiry_date', ib.expiry_date
                ) ORDER BY ib.created_at DESC
              ) FILTER (
                WHERE ib.id IS NOT NULL
                  AND (
                    ib.expiry_date IS NULL
                    OR ib.expiry_date > NOW()
                  )
              ),
              '[]'
            ) AS batches

        FROM products p

        LEFT JOIN product_categories c
          ON c.id = p.category_id

        LEFT JOIN inventory_batches ib
          ON ib.product_id = p.id
          AND ib.store_id = p.store_id

        WHERE p.store_id = $1 ${searchCond}

        GROUP BY p.id, c.name

        -- ONLY PRODUCTS WITH VALID STOCK
        HAVING (
          SELECT COALESCE(SUM(
            CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
          ), 0)
          FROM inventory_movements im
          JOIN inventory_batches ib_stock ON im.batch_id = ib_stock.id
          WHERE ib_stock.product_id = p.id
            AND ib_stock.store_id = p.store_id
            AND (
              ib_stock.expiry_date IS NULL
              OR ib_stock.expiry_date > NOW()
            )
        ) > 0

        ORDER BY p.name ASC
        LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}
        `,
      dataParams,
    );

    const formatted = result.rows.map((r) => {
      // product-level values (nullable) — this path only runs when
      // useBatchWisePrice is OFF (batch-wise mode returns earlier, see
      // getPricelistBatchwise below), so we always use the single
      // latest/active batch found for this product.
      let buying = r.cost_price === null ? null : Number(r.cost_price);
      let selling = r.selling_price === null ? null : Number(r.selling_price);
      let batchNumber = r.selected_batch_number || null;
      let batchId = r.selected_batch_id || null;

      const profit =
        buying !== null && selling !== null
          ? +(selling - buying).toFixed(2)
          : null;
      const profitPercent =
        buying !== null && buying !== 0 && profit !== null
          ? +((profit / buying) * 100).toFixed(2)
          : null;

      const batches = (r.batches || []).map((b) => {
        const bBuy = b.cost_price === null ? null : Number(b.cost_price);
        const bSell = b.selling_price === null ? null : Number(b.selling_price);
        const bProfit =
          bBuy !== null && bSell !== null ? +(bSell - bBuy).toFixed(2) : null;
        const bProfitPct =
          bBuy && bBuy !== 0 ? +((bProfit / bBuy) * 100).toFixed(2) : null;
        return {
          batchId: b.batch_id,
          batchNumber: b.batch_number,
          buyingPrice: bBuy,
          sellingPrice: bSell,
          profit: bProfit,
          profitPercent: bProfitPct,
          availableStock: b.available_stock,
          status: b.status,
          createdAt: b.created_at,
        };
      });

      return {
        id: r.id,
        productId: r.id,
        productName: r.name,
        categoryName: r.category_name || null,
        barcode: r.barcode,
        unit: r.unit,
        status: r.status,
        buyingPrice: buying,
        sellingPrice: selling,
        profit,
        profitPercent,
        batchNumber,
        batchId,
        batches,
      };
    });

    res.status(200).json({
      message: t("pricelist_fetched", getLang(req)),
      products: formatted,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (err) {
    console.error("Get pricelist error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// GET PRICELIST — BATCH-WISE MODE
// One row per (product, batch). Mirrors the "Batchwise Adjustment" listing
// pattern: each active/non-expired batch of a product gets its own row with
// its own cost price, selling price (for the given price category) and
// current stock, so the store owner can review/edit pricing per batch.
async function getPricelistBatchwise(
  req,
  res,
  { storeId, priceCategoryId, page, limit, offset, search },
) {
  try {
    const countParams = [storeId];
    let countSearch = "";
    if (search) {
      countParams.push(`%${search}%`);
      countSearch = `AND (p.name ILIKE $${countParams.length} OR p.barcode ILIKE $${countParams.length})`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS count
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id AND p.store_id = ib.store_id
       WHERE p.store_id = $1 ${countSearch}
         AND (ib.expiry_date IS NULL OR ib.expiry_date > NOW())
         AND (
           SELECT COALESCE(SUM(
             CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
           ), 0)
           FROM inventory_movements im
           JOIN inventory_batches ib_stock ON im.batch_id = ib_stock.id
           WHERE ib_stock.product_id = p.id
             AND ib_stock.store_id = p.store_id
             AND (ib_stock.expiry_date IS NULL OR ib_stock.expiry_date > NOW())
         ) > 0`,
      countParams,
    );
    const total = Number(countResult.rows[0].count);

    const dataParams = [storeId, priceCategoryId];
    let searchCond = "";
    if (search) {
      dataParams.push(`%${search}%`);
      searchCond = `AND (p.name ILIKE $${dataParams.length} OR p.barcode ILIKE $${dataParams.length})`;
    }
    dataParams.push(limit, offset);

    const result = await pool.query(
      `SELECT
          p.id            AS product_id,
          p.name          AS product_name,
          p.barcode,
          p.unit,
          p.status,
          c.name          AS category_name,
          ib.id           AS batch_id,
          ib.batch_number,
          ib.cost_price   AS buying_price,
          ib.status       AS batch_status,
          ib.created_at,
          ib.expiry_date,
          (
            SELECT sp.price
            FROM selling_prices sp
            WHERE sp.batch_id = ib.id
              AND sp.price_category_id = $2
            LIMIT 1
          ) AS selling_price,
          (
            SELECT COALESCE(SUM(
              CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
            ), 0)
            FROM inventory_movements im
            WHERE im.batch_id = ib.id
          ) AS available_stock
        FROM products p
        JOIN inventory_batches ib
          ON ib.product_id = p.id
          AND ib.store_id = p.store_id
        LEFT JOIN product_categories c
          ON c.id = p.category_id
        WHERE p.store_id = $1 ${searchCond}
          AND (ib.expiry_date IS NULL OR ib.expiry_date > NOW())
          AND (
            SELECT COALESCE(SUM(
              CASE WHEN im2.type = 'IN' THEN im2.quantity ELSE -im2.quantity END
            ), 0)
            FROM inventory_movements im2
            JOIN inventory_batches ib_stock ON im2.batch_id = ib_stock.id
            WHERE ib_stock.product_id = p.id
              AND ib_stock.store_id = p.store_id
              AND (ib_stock.expiry_date IS NULL OR ib_stock.expiry_date > NOW())
          ) > 0
        ORDER BY p.name ASC, ib.created_at DESC
        LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
      `,
      dataParams,
    );

    const formatted = result.rows.map((r) => {
      const buying = r.buying_price === null ? null : Number(r.buying_price);
      const selling =
        r.selling_price === null ? null : Number(r.selling_price);
      const profit =
        buying !== null && selling !== null
          ? +(selling - buying).toFixed(2)
          : null;
      const profitPercent =
        buying !== null && buying !== 0 && profit !== null
          ? +((profit / buying) * 100).toFixed(2)
          : null;

      return {
        // Row key: combine product + batch since the same product can
        // appear more than once (one row per batch).
        id: `${r.product_id}-${r.batch_id}`,
        productId: r.product_id,
        productName: r.product_name,
        categoryName: r.category_name || null,
        barcode: r.barcode,
        unit: r.unit,
        status: r.status,
        batchId: r.batch_id,
        batchNumber: r.batch_number,
        batchStatus: r.batch_status,
        availableStock: Number(r.available_stock) || 0,
        buyingPrice: buying,
        sellingPrice: selling,
        profit,
        profitPercent,
        // Kept for consistency with the non-batch-wise response shape, in
        // case any existing frontend code still reads product.batches.
        batches: [
          {
            batchId: r.batch_id,
            batchNumber: r.batch_number,
            buyingPrice: buying,
            sellingPrice: selling,
            profit,
            profitPercent,
            availableStock: Number(r.available_stock) || 0,
            status: r.batch_status,
            createdAt: r.created_at,
          },
        ],
      };
    });

    res.status(200).json({
      message: t("pricelist_fetched", getLang(req)),
      products: formatted,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (err) {
    console.error("Get batchwise pricelist error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
}

// Update product selling price for a specific price category and batch
export const updatePrices = async (req, res) => {
  const { productId, batchId, priceCategoryId, sellingPrice, buyingPrice } =
    req.body;
  const storeId = req.user.current_store_id;
  const user_id = req.user.id;
  const ip = req.ip;
  const lang = getLang(req);

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Validate product exists
      const productCheck = await client.query(
        "SELECT * FROM products WHERE id = $1 AND store_id = $2",
        [productId, storeId],
      );
      if (productCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return respondWithError(req, res, 404, "product_not_found");
      }

      // Validate batch exists if provided
      if (batchId) {
        const batchCheck = await client.query(
          "SELECT * FROM inventory_batches WHERE id = $1 AND product_id = $2 AND store_id = $3",
          [batchId, productId, storeId],
        );
        if (batchCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return respondWithError(req, res, 404, "batch_not_found");
        }
      }

      // Validate price category
      const categoryCheck = await client.query(
        "SELECT * FROM price_categories WHERE id = $1 AND store_id = $2",
        [priceCategoryId, storeId],
      );
      if (categoryCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return respondWithError(req, res, 404, "price_category_not_found");
      }

      //Check if cost_price exists
      const existingCostPrice = await client.query(
        "SELECT * FROM inventory_batches WHERE id = $1",
        [batchId],
      );

      // Check if selling price exists for this batch and category
      const existingPrice = await client.query(
        "SELECT * FROM selling_prices WHERE batch_id = $1 AND price_category_id = $2",
        [batchId, priceCategoryId],
      );

      // Log old vs new values
      const logDescription = {
        old: {
          product_name: productCheck.name,
          batch: existingCostPrice.rows[0]?.batch_number,
          cost_price: existingCostPrice.rows[0]?.cost_price ?? 0,
          selling_price: existingPrice.rows[0]?.price ?? 0,
        },
        new: {
          product_name: productCheck.name,
          batch: existingCostPrice.rows[0]?.batch_number,
          cost_price: buyingPrice,
          selling_price: sellingPrice,
        },
      };

      if (existingCostPrice.rows.length > 0) {
        // Update existing cost price
        await client.query(
          "UPDATE inventory_batches SET cost_price = $1 WHERE id = $2",
          [buyingPrice, batchId],
        );
      }

      if (existingPrice.rows.length > 0) {
        // Update existing price
        await client.query(
          "UPDATE selling_prices SET price = $1 WHERE batch_id = $2 AND price_category_id = $3",
          [sellingPrice, batchId, priceCategoryId],
        );
      } else {
        // Insert new price
        await client.query(
          "INSERT INTO selling_prices (batch_id, price_category_id, price) VALUES ($1, $2, $3)",
          [batchId, priceCategoryId, sellingPrice],
        );
      }

      // Log the action
      await client.query(
        `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [user_id, "update_prices", JSON.stringify(logDescription), ip, storeId],
      );

      await client.query("COMMIT");

      // Emit socket event
      const io = getIO(req);
      io.to(`store_${storeId}_Owner`).emit("pricesUpdated", {
        message: "prices_updated",
        data: {
          productId,
          batchId,
          priceCategoryId,
          buyingPrice,
          sellingPrice,
        },
      });
      res.status(200).json({
        message: t("prices_updated", lang),
        data: {
          productId,
          batchId,
          priceCategoryId,
          buyingPrice,
          sellingPrice,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Update prices error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

