import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
import cloudinary from '../utils/cloudinaryConfig.js';
import { withCache } from '../utils/cache.js';
// Get all products for a store
// exports.getProducts = async (req, res) => {
//   const { storeId } = req.params;
//   const page     = Math.max(1, parseInt(req.query.page,  10) || 1);
//   const limit    = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
//   const offset   = (page - 1) * limit;
//   const search   = req.query.search?.trim() || '';

//   try {
//     const storeSettingsRes = await pool.query(
//       "SELECT settings FROM store_settings WHERE store_id = $1",
//       [storeId]
//     );
//     const settings = storeSettingsRes.rows[0]?.settings;

//     const defaultPriceCategory = settings?.operations?.defaultPriceCategory;
//     const useBatchWisePrice = settings.operations.useBatchWisePrice;

//     // Build optional search filter
//     const searchFilter = search ? `AND (p.name ILIKE $4 OR p.barcode ILIKE $4)` : '';
//     const queryParams  = search
//       ? [storeId, useBatchWisePrice, defaultPriceCategory, `%${search}%`]
//       : [storeId, useBatchWisePrice, defaultPriceCategory];

//     // Count total (for pagination metadata) — use its own minimal param set
//     const countFilter = search ? `AND (p.name ILIKE $2 OR p.barcode ILIKE $2)` : '';
//     const countParams = search ? [storeId, `%${search}%`] : [storeId];
//     const countRes = await pool.query(
//       `SELECT COUNT(*) FROM products p WHERE p.store_id = $1 ${countFilter}`,
//       countParams
//     );
//     const total = parseInt(countRes.rows[0].count, 10);

//     const paginationParams = [...queryParams, limit, offset];
//     const limitIndex  = queryParams.length + 1;
//     const offsetIndex = queryParams.length + 2;

//     const result = await pool.query(
//       `SELECT 
//           p.id,
//           p.name,
//           p.category_id,
//           p.description,
//           p.image_url,
//           p.minimum_stock,
//           p.barcode,
//           p.unit,
//           p.status,
//           p.created_at,

//           c.name AS category_name,

//           -- TOTAL STOCK PER PRODUCT
//           COALESCE(SUM(
//             CASE 
//               WHEN im.type = 'IN' THEN im.quantity 
//               ELSE -im.quantity 
//             END
//           ), 0) AS current_stock,

//           -- COST PRICE
//           COALESCE(
//             (
//               SELECT ibx.cost_price
//               FROM inventory_batches ibx
//               WHERE ibx.id = (
//                 CASE
//                   WHEN $2 = true THEN (
//                     SELECT ib1.id
//                     FROM inventory_batches ib1
//                     WHERE ib1.product_id = p.id
//                       AND ib1.store_id = p.store_id
//                       AND ib1.status     = 'active'
//                     ORDER BY ib1.created_at DESC
//                     LIMIT 1
//                   )

//                   -- CASE 2: use latest batch
//                   ELSE (
//                     SELECT ib2.id
//                     FROM inventory_batches ib2
//                     WHERE ib2.product_id = p.id
//                       AND ib2.store_id = p.store_id
//                     ORDER BY ib2.created_at DESC
//                     LIMIT 1
//                   )
//                 END
//               )
//             ),
//             0
//           ) AS cost_price,

//           -- SELLING PRICE (BASED ON SETTINGS)
//           COALESCE(
//             (
//               SELECT sp.price
//               FROM selling_prices sp
//               WHERE sp.batch_id = (
//                 CASE
//                   -- CASE 1: use active batch
//                   WHEN $2 = true THEN (
//                     SELECT ib1.id
//                     FROM inventory_batches ib1
//                     WHERE ib1.product_id = p.id
//                       AND ib1.store_id   = p.store_id
//                       AND ib1.status     = 'active'
//                     ORDER BY ib1.created_at DESC
//                     LIMIT 1
//                   )

//                   -- CASE 2: use latest batch
//                   ELSE (
//                     SELECT ib2.id
//                     FROM inventory_batches ib2
//                     WHERE ib2.product_id = p.id
//                       AND ib2.store_id   = p.store_id
//                     ORDER BY ib2.created_at DESC
//                     LIMIT 1
//                   )
//                 END
//               )
//               AND sp.price_category_id = $3
//               LIMIT 1
//             ),
//             0
//           ) AS selling_price,

//           -- BATCHES ARRAY
//           COALESCE(
//             json_agg(
//               DISTINCT jsonb_build_object(
//                 'batch_id', ib.id,
//                 'batch_number', ib.batch_number,
//                 'cost_price', ib.cost_price,
//                 'manufacturing_date', ib.manufacturing_date,
//                 'expiry_date', ib.expiry_date,
//                 'status', ib.status,

//                 -- STOCK PER BATCH
//                 'available_stock', (
//                   SELECT COALESCE(SUM(
//                     CASE 
//                       WHEN im2.type = 'IN' THEN im2.quantity 
//                       ELSE -im2.quantity 
//                     END
//                   ), 0)
//                   FROM inventory_movements im2
//                   WHERE im2.batch_id = ib.id
//                 ),

//                 -- SELLING PRICE PER BATCH
//                 'selling_price', (
//                   SELECT sp2.price
//                   FROM selling_prices sp2
//                   WHERE sp2.batch_id = ib.id
//                     AND sp2.price_category_id = $3
//                   LIMIT 1
//                 )
//               )
//             ) FILTER (WHERE ib.id IS NOT NULL),
//             '[]'
//           ) AS batches

//         FROM products p

//         LEFT JOIN product_categories c
//           ON c.id = p.category_id

//         LEFT JOIN inventory_batches ib
//           ON ib.product_id = p.id
//         AND ib.store_id   = p.store_id

//         LEFT JOIN inventory_movements im
//           ON im.batch_id = ib.id

//         WHERE p.store_id = $1
//         ${searchFilter}

//         GROUP BY p.id, c.name

//         ORDER BY p.name ASC
//         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
//       paginationParams
//     );

//     res.status(200).json({
//       message: t("products_fetched", getLang(req)),
//       products: result.rows,
//       pagination: {
//         total,
//         page,
//         limit,
//         totalPages: Math.ceil(total / limit),
//         hasNextPage: page * limit < total,
//         hasPrevPage: page > 1,
//       },
//     });
//   } catch (err) {
//     console.error("Get products error:", err.message);
//     respondWithError(req, res, 500, "server_error");
//   }
// };

export const getProducts = async (req, res) => {
  const { storeId } = req.params;
  const page     = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit    = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const offset   = (page - 1) * limit;
  const search   = req.query.search?.trim() || '';
 
  try {
    // Store settings barely change — cache them for 60s per store instead
    // of hitting the DB on every single products request.
    const storeSettingsRes = await withCache(
      `store_settings:${storeId}`,
      60_000,
      () => pool.query(
        "SELECT settings FROM store_settings WHERE store_id = $1",
        [storeId]
      )
    );
    const settings = storeSettingsRes.rows[0]?.settings;
 
    const defaultPriceCategory = settings?.operations?.defaultPriceCategory;
    const useBatchWisePrice = settings.operations.useBatchWisePrice;
 
    // Build optional search filter
    const searchFilter = search ? `AND (p.name ILIKE $4 OR p.barcode ILIKE $4)` : '';
    const queryParams  = search
      ? [storeId, useBatchWisePrice, defaultPriceCategory, `%${search}%`]
      : [storeId, useBatchWisePrice, defaultPriceCategory];
 
    // Count total (for pagination metadata) — use its own minimal param set
    const countFilter = search ? `AND (p.name ILIKE $2 OR p.barcode ILIKE $2)` : '';
    const countParams = search ? [storeId, `%${search}%`] : [storeId];
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM products p WHERE p.store_id = $1 ${countFilter}`,
      countParams
    );
    const total = parseInt(countRes.rows[0].count, 10);
 
    const paginationParams = [...queryParams, limit, offset];
    const limitIndex  = queryParams.length + 1;
    const offsetIndex = queryParams.length + 2;
 
    const result = await pool.query(
      `SELECT
          p.id,
          p.name,
          p.category_id,
          p.description,
          p.image_url,
          p.minimum_stock,
          p.barcode,
          p.unit,
          p.status,
          p.created_at,
 
          c.name AS category_name,
 
          COALESCE(stock.current_stock, 0)   AS current_stock,
          COALESCE(pricing.cost_price, 0)    AS cost_price,
          COALESCE(pricing.selling_price, 0) AS selling_price,
          COALESCE(batches.batches, '[]')    AS batches
 
        FROM products p
 
        LEFT JOIN product_categories c
          ON c.id = p.category_id
 
        -- TOTAL STOCK PER PRODUCT (aggregated once, no row multiplication)
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(
            CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
          ), 0) AS current_stock
          FROM inventory_movements im
          WHERE im.product_id = p.id
            AND im.store_id   = p.store_id
        ) stock ON true
 
        -- LATEST RELEVANT BATCH (active-only if useBatchWisePrice, else newest)
        LEFT JOIN LATERAL (
          SELECT ib.id, ib.cost_price
          FROM inventory_batches ib
          WHERE ib.product_id = p.id
            AND ib.store_id   = p.store_id
            AND (NOT $2::boolean OR ib.status = 'active')
          ORDER BY ib.created_at DESC
          LIMIT 1
        ) latest_batch ON true
 
        -- COST / SELLING PRICE off that one latest batch
        LEFT JOIN LATERAL (
          SELECT
            latest_batch.cost_price AS cost_price,
            sp.price                AS selling_price
          FROM selling_prices sp
          WHERE sp.batch_id = latest_batch.id
            AND sp.price_category_id = $3
          LIMIT 1
        ) pricing ON true
 
        -- BATCHES ARRAY (each batch's stock aggregated once via its own LATERAL)
        LEFT JOIN LATERAL (
          SELECT COALESCE(json_agg(
            jsonb_build_object(
              'batch_id', ib.id,
              'batch_number', ib.batch_number,
              'cost_price', ib.cost_price,
              'manufacturing_date', ib.manufacturing_date,
              'expiry_date', ib.expiry_date,
              'status', ib.status,
              'available_stock', bstock.available_stock,
              'selling_price', bsp.price
            )
          ), '[]') AS batches
          FROM inventory_batches ib
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(
              CASE WHEN im2.type = 'IN' THEN im2.quantity ELSE -im2.quantity END
            ), 0) AS available_stock
            FROM inventory_movements im2
            WHERE im2.batch_id = ib.id
          ) bstock ON true
          LEFT JOIN selling_prices bsp
            ON bsp.batch_id = ib.id
            AND bsp.price_category_id = $3
          WHERE ib.product_id = p.id
            AND ib.store_id   = p.store_id
        ) batches ON true
 
        WHERE p.store_id = $1
        ${searchFilter}
 
        ORDER BY p.name ASC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      paginationParams
    );
 
    res.status(200).json({
      message: t("products_fetched", getLang(req)),
      products: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error("Get products error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

export const getProductByBarcode = async (req, res) => {
  const { storeId, barcode } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
                p.*, 
                c.name AS category_name,
                COALESCE(SUM(
                    CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
                ), 0) AS current_stock,
                COALESCE(
                    json_agg(
                        DISTINCT jsonb_build_object(
                            'batch_id', ib.id,
                            'batch_number', ib.batch_number,
                            'selling_price', ib.selling_price,
                            'cost_price', ib.cost_price,
                            'available_stock', (
                                SELECT COALESCE(SUM(
                                    CASE WHEN im2.type = 'IN' THEN im2.quantity ELSE -im2.quantity END
                                ), 0)
                                FROM inventory_movements im2
                                WHERE im2.batch_id = ib.id
                            ),
                            'expiry_date', ib.expiry_date,
                            'status', ib.status
                        )
                    ) FILTER (WHERE ib.id IS NOT NULL), '[]'
                ) AS batches
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            LEFT JOIN inventory_batches ib ON p.id = ib.product_id AND ib.store_id = p.store_id
            LEFT JOIN inventory_movements im ON ib.id = im.batch_id
            WHERE p.store_id = $1 AND p.barcode = $2
            GROUP BY p.id, c.name
            LIMIT 1`,
      [storeId, barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Product not found",
        product: null,
      });
    }

    res.status(200).json({
      message: "Product fetched successfully",
      product: result.rows[0],
    });
  } catch (err) {
    console.error("Get product by barcode error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

function makePrefix(name) {
  return name.trim().toUpperCase().slice(0, 3);
}

export const addProduct = async (req, res) => {
  const ip = req.ip;
  const {
    product_category,
    product_name,
    unit,
    product_description,
    selling_price,
    cost_price,
    alert_qty,
    current_stock,
    image,
    image_public_id,
    exp_date,
    mfg_date,
    barcode,
  } = req.body;
  const user_id = req.user.id;
  const lang = getLang(req);
  const storeId = req.user.current_store_id;

  // 1) Validate required
  if (!product_name) {
    return respondWithError(req, res, 400, "name_required");
  }

  // 2) Validate category if provided
  if (product_category) {
    const { rowCount: catCount } = await pool.query(
      `SELECT 1 FROM product_categories WHERE id = $1 AND store_id = $2`,
      [product_category, storeId]
    );

    if (!catCount) {
      return respondWithError(req, res, 400, "invalid_category_id");
    }
  }

  const client = await pool.connect();

  const storeSettingsRes = await client.query(
    "SELECT settings FROM store_settings WHERE store_id = $1",
    [storeId]
  );

  const settings = storeSettingsRes.rows[0]?.settings;

  const defaultPriceCategory = settings?.operations?.defaultPriceCategory;
  const useBatchWisePrice = settings.operations.useBatchWisePrice;

  try {
    await client.query("BEGIN");

    // 3) Check duplicate name+cat+unit
    const { rowCount: dup } = await client.query(
      `SELECT 1 FROM products
       WHERE store_id=$1 AND category_id=$2 AND name=$3 AND unit=$4`,
      [storeId, product_category, product_name, unit]
    );
    if (dup) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 400, "product_duplicate");
    }

    // 4) Insert product
    const {
      rows: [newProd],
    } = await client.query(
      `INSERT INTO products
         (store_id, category_id, name, description,
          price, cost_price, image_url, image_public_id, minimum_stock, unit)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        storeId,
        product_category,
        product_name,
        product_description || null,
        selling_price,
        cost_price || null,
        image || null,
        image_public_id || null,
        alert_qty || 0,
        unit,
      ]
    );
    const productId = newProd.id;

    // 5) Generate or set barcode
    let barcodeValue = (barcode || "").trim();
    if (!barcodeValue) {
      const prefix = makePrefix(product_name);
      const shortUuid = productId.replace(/-/g, "").slice(-8).toUpperCase();
      barcodeValue = `${prefix}-${shortUuid}`;
    }
    await client.query(`UPDATE products SET barcode=$1 WHERE id=$2`, [
      barcodeValue,
      productId,
    ]);

    const newProdWithBarcode = { ...newProd, barcode: barcodeValue };

    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user_id,
        "create_product",
        JSON.stringify(newProdWithBarcode),
        ip,
        storeId,
      ]
    );

    // 6) Optional initial batch + movement
    if (current_stock && Number(current_stock) > 0) {
      // 6.1 Insert batch
      const batch_number = `Batch-${Date.now().toString()}`;
      const {
        rows: [batch],
      } = await client.query(
        `INSERT INTO inventory_batches
           (store_id, product_id, batch_number,
            cost_price, expiry_date, status,
            created_by, selling_price)
         VALUES($1,$2,$3,$4,$5,'active',$6,$7)
         RETURNING *`,
        [
          storeId,
          productId,
          batch_number,
          cost_price || null,
          exp_date || null,
          user_id,
          selling_price,
        ]
      );

      await client.query(
        `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          user_id,
          "add_initial_inventory_batch",
          JSON.stringify({ batch }),
          ip,
          storeId,
        ]
      );

      // 6.2 Insert movement
      const {
        rows: [movement],
      } = await client.query(
        `INSERT INTO inventory_movements
           (store_id, product_id, batch_id,
            quantity, type, note, created_by, transaction_date)
         VALUES($1,$2,$3,$4,'IN','initial_stock_on_product_creation',$5, NOW())
         RETURNING *`,
        [storeId, productId, batch.id, current_stock, user_id]
      );

      await client.query(
        `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
           VALUES ($1, $2, $3, $4, $5)`,
        [
          user_id,
          "add_initial_inventory_movement",
          JSON.stringify({ movement }),
          ip,
          storeId,
        ]
      );

      // 6.3 Insert price
      if (defaultPriceCategory) {
        await client.query(
          `INSERT INTO selling_prices 
           (batch_id, price_category_id, price)
         VALUES($1,$2,$3)`,
          [batch.id, defaultPriceCategory, selling_price]
        );
      }
    }

    // 7) Re-fetch enriched single product
    const {
      rows: [product],
    } = await client.query(
      `SELECT 
          p.id,
          p.name,
          p.category_id,
          p.description,
          p.image_url,
          p.minimum_stock,
          p.barcode,
          p.unit,
          p.status,

          c.name AS category_name,

          -- TOTAL PRODUCT STOCK
          COALESCE(SUM(
            CASE 
              WHEN im.type = 'IN' THEN im.quantity 
              ELSE -im.quantity 
            END
          ), 0) AS current_stock,

          -- COST PRICE
          COALESCE(
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
                    ORDER BY ib1.created_at DESC
                    LIMIT 1
                  )
                  ELSE (
                    SELECT ib2.id
                    FROM inventory_batches ib2
                    WHERE ib2.product_id = p.id
                      AND ib2.store_id = p.store_id
                    ORDER BY ib2.created_at DESC
                    LIMIT 1
                  )
                END
              )
            ),
            0
          ) AS cost_price,

          -- SELLING PRICE (FROM selling_prices)
          COALESCE(
            (
              SELECT sp.price
              FROM selling_prices sp
              WHERE sp.batch_id = (
                CASE
                  --use active batch
                  WHEN $2 = true THEN (
                    SELECT ib1.id
                    FROM inventory_batches ib1
                    WHERE ib1.product_id = p.id
                      AND ib1.store_id   = p.store_id
                      AND ib1.status     = 'active'
                    ORDER BY ib1.created_at DESC
                    LIMIT 1
                  )

                  --use latest batch
                  ELSE (
                    SELECT ib2.id
                    FROM inventory_batches ib2
                    WHERE ib2.product_id = p.id
                      AND ib2.store_id   = p.store_id
                    ORDER BY ib2.created_at DESC
                    LIMIT 1
                  )
                END
              )
              AND sp.price_category_id = $3
              LIMIT 1
            ),
            0
          ) AS selling_price,

          -- BATCHES ARRAY
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'batch_id', ib.id,
                'batch_number', ib.batch_number,
                'cost_price', ib.cost_price,
                'expiry_date', ib.expiry_date,
                'status', ib.status,

                -- STOCK PER BATCH
                'available_stock', (
                  SELECT COALESCE(SUM(
                    CASE 
                      WHEN im2.type = 'IN' THEN im2.quantity 
                      ELSE -im2.quantity 
                    END
                  ), 0)
                  FROM inventory_movements im2
                  WHERE im2.batch_id = ib.id
                ),

                -- SELLING PRICE PER BATCH
                'selling_price', (
                  SELECT sp2.price
                  FROM selling_prices sp2
                  WHERE sp2.batch_id = ib.id
                    AND sp2.price_category_id = $3
                  LIMIT 1
                )
              )
            ) FILTER (WHERE ib.id IS NOT NULL),
            '[]'
          ) AS batches

        FROM products p

        LEFT JOIN product_categories c
          ON c.id = p.category_id

        LEFT JOIN inventory_batches ib
          ON ib.product_id = p.id
        AND ib.store_id   = p.store_id

        LEFT JOIN inventory_movements im
          ON im.batch_id = ib.id

        WHERE p.id = $1

        GROUP BY p.id, c.name`,
      [productId, useBatchWisePrice, defaultPriceCategory]
    );

    // 8) Commit & emit
    await client.query("COMMIT");
    const io = getIO(req);
    ["Owner", "Manager"].forEach((role) => {
      io.to(`store_${storeId}_${role}`).emit("productAdded", {
        message: "product_added",
        responseData: product,
      });
    });

    // 9) Return enriched product
    return res.status(201).json({
      message: t("product_added", lang),
      product,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Add product error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// Update a product
export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const ip = req.ip;
  const storeId = req.user.current_store_id;
  const user_id = req.user.id;
  const {
    product_category,
    product_name,
    unit,
    product_description,
    alert_qty,
    image,
    image_public_id,
    barcode,
    status_,
  } = req.body;

  if (!product_name) {
    return respondWithError(req, res, 400, "name_required");
  }

  const client = await pool.connect();
  const storeSettingsRes = await client.query(
    "SELECT settings FROM store_settings WHERE store_id = $1",
    [storeId]
  );
  const settings = storeSettingsRes.rows[0]?.settings;
  const defaultPriceCategory = settings?.operations?.defaultPriceCategory;
  const useBatchWisePrice = settings.operations.useBatchWisePrice;
  try {
    await client.query("BEGIN");

    // 1. Ensure product exists
    const { rows: existing } = await client.query(
      "SELECT * FROM products WHERE id = $1",
      [id]
    );
    if (existing.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "product_not_found");
    }

    // 2. Check duplicate within same store/category
    const { rows: dup } = await client.query(
      `SELECT 1 FROM products WHERE store_id = $1 AND category_id = $2 AND name = $3 AND barcode = $4 AND id != $5 LIMIT 1
      `,
      [existing[0].store_id, existing[0].category_id, product_name, barcode, id]
    );
    if (dup.length) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 400, "product_duplicate");
    }

    // Log old vs new values
    const logDescription = {
      old: {
        product_name: existing[0].name,
        unit: existing[0].unit,
        category_id: existing[0].category_id,
        barcode: existing[0].barcode,
        minimum_stock: existing[0].minimum_stock,
        status: existing[0].status,
        description: existing[0].description,
        image_url: existing[0].image_url,
      },
      new: {
        product_name: product_name,
        unit: unit,
        category_id: product_category,
        barcode: barcode,
        minimum_stock: alert_qty,
        status: status_,
        description: product_description,
        image_url: image,
      },
    };

    // 3. Perform the update
    // If a new image was provided (new public_id), delete the old Cloudinary asset
    if (image_public_id && existing[0].image_public_id && image_public_id !== existing[0].image_public_id) {
      cloudinary.uploader.destroy(existing[0].image_public_id).catch(() => {});
    }

    await client.query(
      `
      UPDATE products SET
        name             = $1,
        category_id      = $2,
        description      = $3,
        image_url        = $4,
        image_public_id  = $5,
        updated_at       = NOW(),
        minimum_stock    = $6,
        barcode          = $7,
        unit             = $8,  
        status           = $9
      WHERE id = $10
      `,
      [
        product_name,
        product_category,
        product_description || null,
        image || null,
        image_public_id || null,
        alert_qty,
        barcode,
        unit,
        status_,
        id,
      ]
    );

    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, "update_product", JSON.stringify(logDescription), ip, storeId]
    );

    // 4. Re-fetch the single enriched product
    const { rows } = await client.query(
      `SELECT
        p.id,
        p.name,
        p.description,
        p.category_id,
        p.image_url,
        p.minimum_stock,
        p.barcode,
        p.unit,
        p.status,

        c.name AS category_name,

        -- TOTAL PRODUCT STOCK
        COALESCE(SUM(
          CASE
            WHEN im.type = 'IN' THEN im.quantity
            ELSE -im.quantity
          END
        ), 0) AS current_stock,

        -- COST PRICE
        COALESCE(
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
                  ORDER BY ib1.created_at DESC
                  LIMIT 1
                )
                ELSE (
                  SELECT ib2.id
                  FROM inventory_batches ib2
                  WHERE ib2.product_id = p.id
                    AND ib2.store_id = p.store_id
                  ORDER BY ib2.created_at DESC
                  LIMIT 1
                )
              END
            )
          ),
          0
        ) AS cost_price,

        -- SELLING PRICE (FROM selling_prices + settings)
        COALESCE(
          (
            SELECT sp.price
            FROM selling_prices sp
            WHERE sp.batch_id = (
              CASE
                -- use ACTIVE batch
                WHEN $2 = true THEN (
                  SELECT ib1.id
                  FROM inventory_batches ib1
                  WHERE ib1.product_id = p.id
                    AND ib1.store_id   = p.store_id
                    AND ib1.status     = 'active'
                  ORDER BY ib1.created_at DESC
                  LIMIT 1
                )

                -- use LATEST batch
                ELSE (
                  SELECT ib2.id
                  FROM inventory_batches ib2
                  WHERE ib2.product_id = p.id
                    AND ib2.store_id   = p.store_id
                  ORDER BY ib2.created_at DESC
                  LIMIT 1
                )
              END
            )
            AND sp.price_category_id = $3
            LIMIT 1
          ),
          0
        ) AS selling_price,

        -- BATCHES ARRAY
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'batch_id', ib.id,
              'batch_number', ib.batch_number,
              'cost_price', ib.cost_price,
              'expiry_date', ib.expiry_date,
              'status', ib.status,

              -- STOCK PER BATCH
              'available_stock', (
                SELECT COALESCE(SUM(
                  CASE
                    WHEN im2.type = 'IN' THEN im2.quantity
                    ELSE -im2.quantity
                  END
                ), 0)
                FROM inventory_movements im2
                WHERE im2.batch_id = ib.id
              ),

              -- SELLING PRICE PER BATCH
              'selling_price', (
                SELECT sp2.price
                FROM selling_prices sp2
                WHERE sp2.batch_id = ib.id
                  AND sp2.price_category_id = $3
                LIMIT 1
              )
            )
          ) FILTER (WHERE ib.id IS NOT NULL),
          '[]'
        ) AS batches

      FROM products p

      LEFT JOIN product_categories c
        ON p.category_id = c.id

      LEFT JOIN inventory_batches ib
        ON ib.product_id = p.id
      AND ib.store_id   = p.store_id

      LEFT JOIN inventory_movements im
        ON im.batch_id = ib.id

      WHERE p.id = $1

      GROUP BY p.id, c.name;
      `,
      [id, useBatchWisePrice, defaultPriceCategory]
    );

    const updated = rows[0];

    // 5. Emit via Socket.IO
    const io = getIO(req);
    ["Owner", "Manager"].forEach((role) => {
      io.to(`store_${storeId}_${role}`).emit("productUpdated", {
        message: "product_updated",
        responseData: updated,
      });
    });

    await client.query("COMMIT");

    // 6. Return enriched product
    res.status(200).json({
      message: t("product_updated", getLang(req)),
      product: updated,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update product error:", err.message);
    respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// Delete a product
export const deleteProduct = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user.current_store_id;
  const user_id = req.user.id;
  const ip = req.ip;
  try {
    const product = await pool.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);
    if (product.rows.length === 0) {
      return respondWithError(req, res, 404, "product_not_found");
    }

    const logDescription = { ...product.rows[0] };

    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, "delete_product", JSON.stringify(logDescription), ip, storeId]
    );

    // Delete image from Cloudinary if tracked
    if (product.rows[0].image_public_id) {
      cloudinary.uploader.destroy(product.rows[0].image_public_id).catch(() => {});
    }

    await pool.query("DELETE FROM products WHERE id = $1", [id]);

    const io = getIO(req);
    io.to(`store_${storeId}_Owner`).emit("productDeleted", {
      message: "product_deleted",
      id: id,
    });
    io.to(`store_${storeId}_Manager`).emit("productDeleted", {
      message: "product_deleted",
      id: id,
    });

    res.status(200).json({
      message: t("product_deleted", getLang(req)),
    });
  } catch (err) {
    console.error("Delete product error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Delete a product
export const deleteBulkProduct = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user.current_store_id;
  const user_id = req.user.id;
  const ip = req.ip;
  try {
    const product = await pool.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);
    if (product.rows.length === 0) {
      return respondWithError(req, res, 404, "product_not_found");
    }
    const logDescription = { ...product.rows[0] };

    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user_id,
        "delete_bulk_products",
        JSON.stringify(logDescription),
        ip,
        storeId,
      ]
    );

    // Delete image from Cloudinary if tracked
    if (product.rows[0].image_public_id) {
      cloudinary.uploader.destroy(product.rows[0].image_public_id).catch(() => {});
    }

    await pool.query("DELETE FROM products WHERE id = $1", [id]);

    const io = getIO(req);
    io.to(`store_${storeId}_Owner`).emit("productsBulkDeleted", {
      id: id,
    });
    io.to(`store_${storeId}_Manager`).emit("productsBulkDeleted", {
      id: id,
    });

    res.status(200).json({
      message: t("product_deleted", getLang(req)),
    });
  } catch (err) {
    console.error("Delete product error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

