import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
import { notifyStore } from '../services/notification.service.js';
// ==================== STOCK TRANSFER FUNCTIONS ====================

/**
 * Create a new stock transfer between stores
 * Transfers stock from source store to destination store
 */
export const createStockTransfer = async (req, res) => {
  const userId = req.user.id;
  const sourceStoreId = req.user?.current_store_id;
  const { destination_store_id, items, notes } = req.body;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Validate destination store exists
    const destStoreResult = await client.query(
      `SELECT id, name FROM stores WHERE id = $1`,
      [destination_store_id]
    );

    if (destStoreResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "destination_store_not_found");
    }

    const destStore = destStoreResult.rows[0];

    // Sending stock to the store it is already in would only create movements out of and back into the same shelf.
    if (destination_store_id === sourceStoreId) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 400, "cannot_transfer_to_same_store");
    }

    // Get source store name
    const sourceStoreResult = await client.query(
      `SELECT name FROM stores WHERE id = $1`,
      [sourceStoreId]
    );
    const sourceStoreName = sourceStoreResult.rows[0]?.name || "Unknown";

    // 2. Generate transfer reference number
    const transferRef = `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // 3. Create transfer record
    const transferResult = await client.query(
      `INSERT INTO stock_transfers (
        reference_number, source_store_id, destination_store_id, 
        status, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [transferRef, sourceStoreId, destination_store_id, "pending_approval", notes || null, userId]
    );

    const transfer = transferResult.rows[0];
    const transferId = transfer.id;
    const transferItems = [];

    // 4. Process each item
    for (const item of items) {
      const { product_id, quantity, batch_id } = item;

      // Get product info
      const productResult = await client.query(
        `SELECT id, name, unit FROM products WHERE id = $1 AND store_id = $2`,
        [product_id, sourceStoreId]
      );

      if (productResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: t("product_not_found", lang),
          product_id,
        });
      }

      const product = productResult.rows[0];

      // Determine source batch (use provided or find oldest with stock)
      let sourceBatchId = batch_id;
      let batchNumber = null;

      if (!sourceBatchId) {
        // Find oldest batch with available stock
        const batchResult = await client.query(
          `SELECT ib.id, ib.batch_number, 
                  COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END), 0) AS available
           FROM inventory_batches ib
           LEFT JOIN inventory_movements im ON ib.id = im.batch_id
           WHERE ib.product_id = $1 AND ib.store_id = $2
           GROUP BY ib.id
           HAVING COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END), 0) > 0
           ORDER BY ib.created_at ASC
           LIMIT 1`,
          [product_id, sourceStoreId]
        );

        if (batchResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: t("no_batch_found", lang),
            product_name: product.name,
          });
        }

        sourceBatchId = batchResult.rows[0].id;
        batchNumber = batchResult.rows[0].batch_number;

        if (batchResult.rows[0].available < quantity) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: t("insufficient_stock", lang),
            product_name: product.name,
            available: batchResult.rows[0].available,
            requested: quantity,
          });
        }
      } else {
        // Verify batch has enough stock
        const batchStockResult = await client.query(
          `SELECT ib.batch_number,
                  COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END), 0) AS available
           FROM inventory_batches ib
           LEFT JOIN inventory_movements im ON ib.id = im.batch_id
           WHERE ib.id = $1
           GROUP BY ib.id, ib.batch_number`,
          [sourceBatchId]
        );

        if (batchStockResult.rows.length === 0 || batchStockResult.rows[0].available < quantity) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: t("insufficient_batch_stock", lang),
            product_name: product.name,
            available: batchStockResult.rows[0]?.available || 0,
            requested: quantity,
          });
        }

        batchNumber = batchStockResult.rows[0].batch_number;
      }

      // Get batch details for destination
      const batchDetailsResult = await client.query(
        `SELECT cost_price, selling_price, expiry_date FROM inventory_batches WHERE id = $1`,
        [sourceBatchId]
      );
      const batchDetails = batchDetailsResult.rows[0];

      // Create transfer item record
      await client.query(
        `INSERT INTO stock_transfer_items (
          transfer_id, product_id, source_batch_id, quantity, batch_number
        ) VALUES ($1, $2, $3, $4, $5)`,
        [transferId, product_id, sourceBatchId, quantity, batchNumber]
      );

      transferItems.push({
        product_id,
        product_name: product.name,
        unit: product.unit,
        quantity,
        batch_number: batchNumber,
        batch_details: batchDetails,
      });
      // Note: OUT movements are created at approval time, not creation
    }

    // 5. Log the transfer creation
    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        "create_stock_transfer",
        JSON.stringify({
          transfer_id: transferId,
          reference_number: transferRef,
          source_store_id: sourceStoreId,
          destination_store_id: destination_store_id,
          items_count: items.length,
          items: transferItems.map((i) => ({
            product_name: i.product_name,
            quantity: i.quantity,
          })),
        }),
        req.ip,
        sourceStoreId,
      ]
    );

    await client.query("COMMIT");

    // Emit realtime events to both stores
    const io = getIO();
    io.to(sourceStoreId).emit("transfer:created", {
      message: t("stock_transfer_created", lang),
      transfer: {
        ...transfer,
        destination_store_name: destStore.name,
        items: transferItems,
      },
    });

    notifyStore({
      storeId: sourceStoreId,
      type: "stock_transfer",
      title: "Stock transfer created",
      message: "A stock transfer was created",
      meta: { transfer_id: transfer.id, destination_store: destStore.name },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: t("stock_transfer_created", lang),
      transfer: {
        ...transfer,
        source_store_name: sourceStoreName,
        destination_store_name: destStore.name,
        items: transferItems,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create stock transfer error:", err.message);
    respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

/**
 * Get transfer history with filters
 */
export const getTransferHistory = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const {
    direction, // 'outgoing', 'incoming', or 'all'
    status,
    page = 1,
    limit = 25,
    search = "",
    startDate,
    endDate,
  } = req.query;
  const lang = getLang(req);

  try {
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        st.id,
        st.reference_number,
        st.source_store_id,
        st.destination_store_id,
        st.status,
        st.notes,
        st.created_at,
        st.received_at,
        st.received_by,
        source_store.name AS source_store_name,
        dest_store.name AS destination_store_name,
        creator.name AS created_by_name,
        receiver.name AS received_by_name,
        (SELECT COUNT(*) FROM stock_transfer_items WHERE transfer_id = st.id) AS items_count,
        (SELECT SUM(quantity) FROM stock_transfer_items WHERE transfer_id = st.id) AS total_quantity
      FROM stock_transfers st
      LEFT JOIN stores source_store ON st.source_store_id = source_store.id
      LEFT JOIN stores dest_store ON st.destination_store_id = dest_store.id
      LEFT JOIN users creator ON st.created_by = creator.id
      LEFT JOIN users receiver ON st.received_by = receiver.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    // Filter by direction, while hiding pending/cancelled transfers from the destination store
    if (direction === "outgoing") {
      paramCount++;
      query += ` AND st.source_store_id = $${paramCount}`;
      params.push(storeId);
    } else if (direction === "incoming") {
      paramCount++;
      query += ` AND st.destination_store_id = $${paramCount} AND st.status NOT IN ('pending_approval', 'cancelled')`;
      params.push(storeId);
    } else {
      paramCount++;
      query += ` AND (st.source_store_id = $${paramCount} OR (st.destination_store_id = $${paramCount} AND st.status NOT IN ('pending_approval', 'cancelled'))) `;
      params.push(storeId);
    }

    if (status) {
      paramCount++;
      query += ` AND st.status = $${paramCount}`;
      params.push(status);
    }

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

    if (search) {
      const like = `%${search}%`;
      paramCount++;
      query += ` AND (st.reference_number ILIKE $${paramCount} OR source_store.name ILIKE $${paramCount} OR dest_store.name ILIKE $${paramCount} OR st.status ILIKE $${paramCount})`;
      params.push(like);
    }

    query += ` ORDER BY st.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const transfersResult = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM stock_transfers st
      LEFT JOIN stores source_store ON st.source_store_id = source_store.id
      LEFT JOIN stores dest_store ON st.destination_store_id = dest_store.id
      WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;

    if (direction === "outgoing") {
      countParamCount++;
      countQuery += ` AND st.source_store_id = $${countParamCount}`;
      countParams.push(storeId);
    } else if (direction === "incoming") {
      countParamCount++;
      countQuery += ` AND st.destination_store_id = $${countParamCount} AND st.status NOT IN ('pending_approval', 'cancelled')`;
      countParams.push(storeId);
    } else {
      countParamCount++;
      countQuery += ` AND (st.source_store_id = $${countParamCount} OR (st.destination_store_id = $${countParamCount} AND st.status NOT IN ('pending_approval', 'cancelled'))) `;
      countParams.push(storeId);
    }

    if (status) {
      countParamCount++;
      countQuery += ` AND st.status = $${countParamCount}`;
      countParams.push(status);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND st.created_at >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND st.created_at < ($${countParamCount}::date + interval '1 day')`;
      countParams.push(endDate);
    }

    if (search) {
      const like = `%${search}%`;
      countParamCount++;
      countQuery += ` AND (st.reference_number ILIKE $${countParamCount} OR source_store.name ILIKE $${countParamCount} OR dest_store.name ILIKE $${countParamCount} OR st.status ILIKE $${countParamCount})`;
      countParams.push(like);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = Number(countResult.rows[0].count);

    res.status(200).json({
      success: true,
      message: t("transfers_fetched", lang),
      transfers: transfersResult.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get transfer history error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

/**
 * Get single transfer detail with items
 */
export const getTransferDetail = async (req, res) => {
  const storeId = req.user?.current_store_id;
  const { transferId } = req.params;
  const lang = getLang(req);

  try {
    // Get transfer record
    const transferResult = await pool.query(
      `SELECT 
        st.*,
        source_store.name AS source_store_name,
        dest_store.name AS destination_store_name,
        creator.name AS created_by_name,
        receiver.name AS received_by_name,
        approver.name AS approved_by_name
      FROM stock_transfers st
      LEFT JOIN stores source_store ON st.source_store_id = source_store.id
      LEFT JOIN stores dest_store ON st.destination_store_id = dest_store.id
      LEFT JOIN users creator ON st.created_by = creator.id
      LEFT JOIN users receiver ON st.received_by = receiver.id
      LEFT JOIN users approver ON st.approved_by = approver.id
      WHERE st.id = $1 
        AND (
          st.source_store_id = $2
          OR (st.destination_store_id = $2 AND st.status NOT IN ('pending_approval', 'cancelled'))
        )`,
      [transferId, storeId]
    );

    if (transferResult.rows.length === 0) {
      return respondWithError(req, res, 404, "transfer_not_found");
    }

    const transfer = transferResult.rows[0];

    // Get transfer items
    const itemsResult = await pool.query(
      `SELECT 
        sti.*,
        p.name AS product_name,
        p.unit AS product_unit
      FROM stock_transfer_items sti
      LEFT JOIN products p ON sti.product_id = p.id
      WHERE sti.transfer_id = $1
      ORDER BY p.name`,
      [transferId]
    );

    res.status(200).json({
      success: true,
      transfer: {
        ...transfer,
        items: itemsResult.rows,
      },
    });
  } catch (err) {
    console.error("Get transfer detail error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

/**
 * Receive/Accept incoming transfer
 * Creates IN movements in destination store
 */
export const receiveTransfer = async (req, res) => {
  const userId = req.user.id;
  const storeId = req.user?.current_store_id;
  const { transferId } = req.params;
  const { items: receivedItems } = req.body; // [{transfer_item_id, received_quantity, condition, condition_notes}]
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Get and validate transfer
    const transferResult = await client.query(
      `SELECT * FROM stock_transfers WHERE id = $1 AND destination_store_id = $2`,
      [transferId, storeId]
    );

    if (transferResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "transfer_not_found");
    }

    const transfer = transferResult.rows[0];

    if (transfer.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: t("transfer_already_processed", lang),
        status: transfer.status,
      });
    }

    // 2. Get transfer items
    const itemsResult = await client.query(
      `SELECT sti.*, ib.cost_price, ib.selling_price, ib.expiry_date
       FROM stock_transfer_items sti
       LEFT JOIN inventory_batches ib ON sti.source_batch_id = ib.id
       WHERE sti.transfer_id = $1`,
      [transferId]
    );

    const items = itemsResult.rows;

    // Build lookup for received item overrides
    const receivedMap = {};
    if (Array.isArray(receivedItems)) {
      for (const ri of receivedItems) {
        receivedMap[ri.transfer_item_id] = ri;
      }
    }

    // 3. Process each item - create batches and movements in destination store
    for (const item of items) {
      const override = receivedMap[item.id] || {};
      const receivedQty = override.received_quantity != null ? Number(override.received_quantity) : item.quantity;
      const condition = override.condition || "good";
      const conditionNotes = override.condition_notes || null;
      // Resolve destination product first; create it only if it does not exist.
      let destProductId = null;

      const productCheck = await client.query(
        `SELECT id FROM products WHERE id = $1 AND store_id = $2`,
        [item.product_id, storeId]
      );

      if (productCheck.rows.length > 0) {
        destProductId = productCheck.rows[0].id;
      } else {
        const sourceProductResult = await client.query(
          `SELECT * FROM products WHERE id = $1`,
          [item.product_id]
        );

        if (sourceProductResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: t("product_not_found", lang),
            product_id: item.product_id,
          });
        }

        const sourceProduct = sourceProductResult.rows[0];

        const matchByNameAndBarcode = await client.query(
          `SELECT id
           FROM products
           WHERE store_id = $1
             AND LOWER(TRIM(name)) = LOWER(TRIM($2))
             AND COALESCE(NULLIF(TRIM(barcode), ''), '') = COALESCE(NULLIF(TRIM($3), ''), '')
           LIMIT 1`,
          [storeId, sourceProduct.name, sourceProduct.barcode]
        );

        if (matchByNameAndBarcode.rows.length > 0) {
          destProductId = matchByNameAndBarcode.rows[0].id;
        } else {
          const newProductResult = await client.query(
            `INSERT INTO products (
              name, description, category_id, store_id, price,
              minimum_stock, unit, barcode, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
            RETURNING id`,
            [
              sourceProduct.name,
              sourceProduct.description,
              sourceProduct.category_id,
              storeId,
              sourceProduct.price,
              sourceProduct.minimum_stock,
              sourceProduct.unit,
              sourceProduct.barcode,
            ]
          );

          destProductId = newProductResult.rows[0].id;
        }
      }

      await client.query(
        `UPDATE stock_transfer_items SET destination_product_id = $1 WHERE id = $2`,
        [destProductId, item.id]
      );

      // Create new batch in destination store
      const newBatchNumber = `${item.batch_number}-TRF`;
      const batchResult = await client.query(
        `INSERT INTO inventory_batches (
          store_id, product_id, batch_number, cost_price, 
          selling_price, expiry_date, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
        RETURNING id`,
        [
          storeId,
          destProductId,
          newBatchNumber,
          item.cost_price,
          item.selling_price,
          item.expiry_date,
          userId,
        ]
      );

      const newBatchId = batchResult.rows[0].id;

      // Create IN movement in destination store
      await client.query(
        `INSERT INTO inventory_movements (
          store_id, product_id, batch_id, quantity, type, note, created_by, transaction_date
        ) VALUES ($1, $2, $3, $4, 'IN', $5, $6, NOW())`,
        [
          storeId,
          destProductId,
          newBatchId,
          receivedQty,
          `Received from transfer (Ref: ${transfer.reference_number})${condition !== "good" ? ` [Condition: ${condition}]` : ""}`,
          userId,
        ]
      );

      // Update transfer item with received quantity and condition
      await client.query(
        `UPDATE stock_transfer_items 
         SET destination_batch_id = $1, received_quantity = $2, condition = $3, condition_notes = $4
         WHERE id = $5`,
        [newBatchId, receivedQty, condition, conditionNotes, item.id]
      );
    }

    // 4. Update transfer status
    await client.query(
      `UPDATE stock_transfers 
       SET status = 'completed', received_at = NOW(), received_by = $1
       WHERE id = $2`,
      [userId, transferId]
    );

    // 5. Log the transfer receipt
    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        "receive_stock_transfer",
        JSON.stringify({
          transfer_id: transferId,
          reference_number: transfer.reference_number,
          source_store_id: transfer.source_store_id,
          items_count: items.length,
        }),
        req.ip,
        storeId,
      ]
    );

    await client.query("COMMIT");

    // Emit realtime events
    const io = getIO();
    io.to(storeId).emit("transfer:received", {
      message: t("transfer_received", lang),
      transferId,
    });

    io.to(transfer.source_store_id).emit("transfer:completed", {
      message: t("transfer_completed_notification", lang),
      transferId,
    });

    res.status(200).json({
      success: true,
      message: t("transfer_received", lang),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Receive transfer error:", err.message);
    respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

/**
 * Cancel a pending transfer
 * Restores stock to source store
 */
export const cancelTransfer = async (req, res) => {
  const userId = req.user.id;
  const storeId = req.user?.current_store_id;
  const { transferId } = req.params;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Get and validate transfer
    const transferResult = await client.query(
      `SELECT * FROM stock_transfers WHERE id = $1 AND source_store_id = $2`,
      [transferId, storeId]
    );

    if (transferResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "transfer_not_found");
    }

    const transfer = transferResult.rows[0];

    if (!["pending_approval", "pending"].includes(transfer.status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: t("transfer_cannot_be_cancelled", lang),
        status: transfer.status,
      });
    }

    // 2. If transfer was already approved (status=pending), restore stock via IN movements
    if (transfer.status === "pending") {
      const itemsResult = await client.query(
        `SELECT * FROM stock_transfer_items WHERE transfer_id = $1`,
        [transferId]
      );

      for (const item of itemsResult.rows) {
        await client.query(
          `INSERT INTO inventory_movements (
            store_id, product_id, batch_id, quantity, type, note, created_by, transaction_date
          ) VALUES ($1, $2, $3, $4, 'IN', $5, $6, NOW())`,
          [
            storeId,
            item.product_id,
            item.source_batch_id,
            item.quantity,
            `Transfer cancelled - stock restored (Ref: ${transfer.reference_number})`,
            userId,
          ]
        );
      }
    }

    // 4. Update transfer status
    await client.query(
      `UPDATE stock_transfers SET status = 'cancelled' WHERE id = $1`,
      [transferId]
    );

    // 5. Log the cancellation
    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        "cancel_stock_transfer",
        JSON.stringify({
          transfer_id: transferId,
          reference_number: transfer.reference_number,
        }),
        req.ip,
        storeId,
      ]
    );

    await client.query("COMMIT");

    // Emit realtime events
    const io = getIO();
    io.to(storeId).emit("transfer:cancelled", {
      message: t("transfer_cancelled", lang),
      transferId,
    });

    res.status(200).json({
      success: true,
      message: t("transfer_cancelled", lang),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Cancel transfer error:", err.message);
    respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

/**
 * Approve a pending_approval transfer
 * Deducts stock from source store and changes status to 'pending'
 */
export const approveTransfer = async (req, res) => {
  const userId = req.user.id;
  const storeId = req.user?.current_store_id;
  const { transferId } = req.params;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Get and validate transfer
    const transferResult = await client.query(
      `SELECT st.*, s.name AS destination_store_name
       FROM stock_transfers st
       LEFT JOIN stores s ON st.destination_store_id = s.id
       WHERE st.id = $1 AND st.source_store_id = $2`,
      [transferId, storeId]
    );

    if (transferResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "transfer_not_found");
    }

    const transfer = transferResult.rows[0];

    if (transfer.status !== "pending_approval") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: t("transfer_cannot_be_approved", lang),
        status: transfer.status,
      });
    }

    // 2. Get transfer items
    const itemsResult = await client.query(
      `SELECT sti.*, p.name AS product_name
       FROM stock_transfer_items sti
       LEFT JOIN products p ON sti.product_id = p.id
       WHERE sti.transfer_id = $1`,
      [transferId]
    );

    // 3. Validate stock and create OUT movements
    for (const item of itemsResult.rows) {
      // Check available stock in source batch
      const stockResult = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE -quantity END), 0) AS available
         FROM inventory_movements
         WHERE batch_id = $1`,
        [item.source_batch_id]
      );

      const available = Number(stockResult.rows[0].available);
      if (available < item.quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: t("insufficient_stock", lang),
          product_name: item.product_name,
          available,
          requested: item.quantity,
        });
      }

      // Create OUT movement in source store
      await client.query(
        `INSERT INTO inventory_movements (
          store_id, product_id, batch_id, quantity, type, note, created_by, transaction_date
        ) VALUES ($1, $2, $3, $4, 'OUT', $5, $6, NOW())`,
        [
          storeId,
          item.product_id,
          item.source_batch_id,
          item.quantity,
          `Transfer to ${transfer.destination_store_name} (Ref: ${transfer.reference_number})`,
          userId,
        ]
      );
    }

    // 4. Update transfer status to pending
    const updatedTransfer = await client.query(
      `UPDATE stock_transfers 
       SET status = 'pending', approved_by = $1, approved_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [userId, transferId]
    );

    // 5. Log the approval
    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        "approve_stock_transfer",
        JSON.stringify({
          transfer_id: transferId,
          reference_number: transfer.reference_number,
          destination_store_id: transfer.destination_store_id,
        }),
        req.ip,
        storeId,
      ]
    );

    await client.query("COMMIT");

    // Notify destination store of incoming transfer
    const io = getIO();
    io.to(transfer.destination_store_id).emit("transfer:incoming", {
      message: t("incoming_transfer_notification", lang),
      transferId,
    });

    notifyStore({
      storeId: transfer.destination_store_id,
      type: "stock_transfer",
      title: "Incoming stock transfer",
      message: "A stock transfer is on the way to your store",
      meta: { transfer_id: transferId },
    }).catch(() => {});

    io.to(storeId).emit("transfer:approved", {
      message: t("transfer_approved", lang),
      transferId,
    });

    res.status(200).json({
      success: true,
      message: t("transfer_approved", lang),
      transfer: updatedTransfer.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Approve transfer error:", err.message);
    respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

/**
 * Delete a transfer before approval or after cancellation
 */
export const deleteTransfer = async (req, res) => {
  const userId = req.user.id;
  const storeId = req.user?.current_store_id;
  const { transferId } = req.params;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const transferResult = await client.query(
      `SELECT * FROM stock_transfers WHERE id = $1 AND source_store_id = $2`,
      [transferId, storeId]
    );

    if (transferResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "transfer_not_found");
    }

    const transfer = transferResult.rows[0];

    if (!["pending_approval", "cancelled"].includes(transfer.status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: t("transfer_cannot_be_deleted", lang),
        status: transfer.status,
      });
    }

    await client.query(`DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [transferId]);
    await client.query(`DELETE FROM stock_transfers WHERE id = $1`, [transferId]);

    await client.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        "delete_stock_transfer",
        JSON.stringify({
          transfer_id: transferId,
          reference_number: transfer.reference_number,
        }),
        req.ip,
        storeId,
      ]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: t("transfer_deleted", lang),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete transfer error:", err.message);
    respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

