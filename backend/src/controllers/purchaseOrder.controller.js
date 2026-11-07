import pool from '../config/db.js';
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
import { notifyStore } from '../services/notification.service.js';
// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Get store settings for purchase module
 */
const getStoreSettings = async (storeId) => {
  const result = await pool.query(
    `SELECT settings FROM store_settings WHERE store_id = $1`,
    [storeId],
  );
  return result.rows[0].settings || {};
};

/**
 * Determine the selling price that should be applied to a newly received
 * inventory batch.
 *
 * - Kama duka linatumia "batchwise price" (useBatchWisePrice = true), kila
 *   batch mpya LAZIMA ipewe bei yake ya kuuza wakati wa "goods receiving",
 *   kwa sababu batch tofauti zinaweza kuwa na bei tofauti.
 * - Kama SIYO batchwise, bei ya mwisho iliyokuwa ikitumika kwa bidhaa hiyo
 *   inatunzwa (carry-forward) badala ya kuwa 0, ili "goods receiving"
 *   isiathiri bei ya mauzo iliyopo.
 */
async function resolveBatchSellingPrice(
  client,
  { storeId, productId, useBatchWisePrice, providedPrice },
) {
  if (useBatchWisePrice) {
    const price = parseFloat(providedPrice);
    if (providedPrice === undefined || providedPrice === null || isNaN(price) || price <= 0) {
      const err = new Error("selling_price_required_for_batchwise_pricing");
      err.code = "SELLING_PRICE_REQUIRED";
      throw err;
    }
    return price;
  }

  // Not batchwise: keep whatever selling price is currently in use for this product.
  const lastBatch = await client.query(
    `SELECT selling_price FROM inventory_batches
     WHERE store_id = $1 AND product_id = $2 AND selling_price IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [storeId, productId],
  );
  if (lastBatch.rows.length && lastBatch.rows[0].selling_price != null) {
    return parseFloat(lastBatch.rows[0].selling_price);
  }

  const product = await client.query(
    `SELECT price FROM products WHERE id = $1 AND store_id = $2`,
    [productId, storeId],
  );
  if (product.rows.length && product.rows[0].price != null) {
    return parseFloat(product.rows[0].price);
  }

  return parseFloat(providedPrice) || 0;
}

/**
 * Generate next number for purchase documents
 */
async function generatePurchaseNumber(store_id) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT last_purchase_order_number FROM store_invoice_counters WHERE store_id = $1 FOR UPDATE`,
      [store_id],
    );

    let newOrderNumber;

    if (rows.length === 0) {
      newOrderNumber = 1;
      await client.query(
        `INSERT INTO store_invoice_counters (store_id, last_purchase_order_number) VALUES ($1, $2)`,
        [store_id, newOrderNumber],
      );
    } else {
      newOrderNumber = rows[0].last_purchase_order_number + 1;
      await client.query(
        `UPDATE store_invoice_counters SET last_purchase_order_number = $1 WHERE store_id = $2`,
        [newOrderNumber, store_id],
      );
    }

    await client.query("COMMIT");

    return String(newOrderNumber).padStart(5, "0");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Log purchase action to system_logs
 */
const logPurchaseAction = async (
  userId,
  action,
  description,
  storeId,
  ipAddress = null,
) => {
  try {
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id, ip_address)
             VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, JSON.stringify(description), storeId, ipAddress],
    );
  } catch (err) {
    console.error("Failed to log purchase action:", err);
  }
};

/**
 * Emit socket event to store users
 */
const emitToStore = (storeId, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(`store_${storeId}`).emit(event, data);
    }
  } catch (err) {
    console.error("Failed to emit socket event:", err);
  }
};

const hasPurchaseCartState = ({
  supplier_id,
  expected_delivery_date,
  delivery_address,
  payment_terms,
  notes,
  internal_notes,
  items,
}) => {
  return Boolean(
    supplier_id ||
    expected_delivery_date ||
    delivery_address ||
    payment_terms ||
    notes ||
    internal_notes ||
    (Array.isArray(items) && items.length > 0),
  );
};

// =====================================================
// ACTIVE PURCHASE CART
// =====================================================

export const getActivePurchaseCart = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId = req.user.id;

  try {
    const cartResult = await pool.query(
      `SELECT * FROM purchase_carts WHERE store_id = $1 AND user_id = $2 LIMIT 1`,
      [storeId, userId],
    );

    if (cartResult.rows.length === 0) {
      return res.json({
        success: true,
        cart_code: null,
        form_data: null,
        items: [],
      });
    }

    const cart = cartResult.rows[0];
    const itemsResult = await pool.query(
      `SELECT
                pci.*,
                p.name AS product_name,
                p.barcode,
                p.image_url,
                p.unit
             FROM purchase_cart_items pci
             JOIN products p ON pci.product_id = p.id
             WHERE pci.purchase_cart_id = $1
             ORDER BY pci.created_at ASC`,
      [cart.id],
    );

    res.json({
      success: true,
      cart_code: cart.cart_code,
      form_data: {
        supplier_id: cart.supplier_id,
        expected_delivery_date: cart.expected_delivery_date,
        delivery_address: cart.delivery_address,
        payment_terms: cart.payment_terms,
        notes: cart.notes,
        internal_notes: cart.internal_notes,
      },
      items: itemsResult.rows,
    });
  } catch (err) {
    console.error("Error fetching active purchase cart:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

export const syncActivePurchaseCart = async (req, res) => {
  const {
    supplier_id,
    expected_delivery_date,
    delivery_address,
    payment_terms,
    notes,
    internal_notes,
    items,
    cart_code,
  } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const validItems = (items || []).filter(
    (item) => item.product_id && parseFloat(item.quantity) > 0,
  );

  if (
    !hasPurchaseCartState({
      supplier_id,
      expected_delivery_date,
      delivery_address,
      payment_terms,
      notes,
      internal_notes,
      items: validItems,
    })
  ) {
    try {
      await pool.query(
        `DELETE FROM purchase_carts WHERE store_id = $1 AND user_id = $2`,
        [storeId, userId],
      );

      return res.json({
        success: true,
        message: t("cart_synced", lang),
        cart_code: null,
      });
    } catch (err) {
      console.error("Error clearing active purchase cart:", err);
      return respondWithError(req, res, 500, "server_error");
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const groupCode = cart_code || `PO-CART-${Date.now()}`;

    const upsertResult = await client.query(
      `INSERT INTO purchase_carts (
                store_id, user_id, cart_code, supplier_id,
                expected_delivery_date, delivery_address, payment_terms,
                notes, internal_notes, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (store_id, user_id)
             DO UPDATE SET
                cart_code = EXCLUDED.cart_code,
                supplier_id = EXCLUDED.supplier_id,
                expected_delivery_date = EXCLUDED.expected_delivery_date,
                delivery_address = EXCLUDED.delivery_address,
                payment_terms = EXCLUDED.payment_terms,
                notes = EXCLUDED.notes,
                internal_notes = EXCLUDED.internal_notes,
                updated_at = NOW()
             RETURNING id, cart_code`,
      [
        storeId,
        userId,
        groupCode,
        supplier_id || null,
        expected_delivery_date || null,
        delivery_address || null,
        payment_terms || null,
        notes || null,
        internal_notes || null,
      ],
    );

    const cartId = upsertResult.rows[0].id;

    await client.query(
      `DELETE FROM purchase_cart_items WHERE purchase_cart_id = $1`,
      [cartId],
    );

    for (const item of validItems) {
      await client.query(
        `INSERT INTO purchase_cart_items (
                    purchase_cart_id, product_id, quantity, unit_price,
                    tax_rate, discount_percent, notes, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          cartId,
          item.product_id,
          item.quantity,
          item.unit_price || 0,
          item.tax_rate || 0,
          item.discount_percent || 0,
          item.notes || null,
        ],
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: t("cart_synced", lang),
      cart_code: upsertResult.rows[0].cart_code,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error syncing active purchase cart:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

// =====================================================
// PURCHASE ORDERS
// =====================================================

/**
 * GET /api/purchases/orders
 * Get all purchase orders for a store
 */
export const getPurchaseOrders = async (req, res) => {
  const storeId = req.user.current_store_id;
  const lang = getLang(req);
  const {
    page = 1,
    limit = 20,
    status,
    supplier_id,
    from_date,
    to_date,
    search,
  } = req.query;

  try {
    let whereClause = "WHERE po.store_id = $1";
    const params = [storeId];
    let paramIndex = 2;

    if (status) {
      const statuses = status.split(",");

      whereClause += ` AND po.status = ANY($${paramIndex})`;
      params.push(statuses);
      paramIndex++;
    }

    if (supplier_id) {
      whereClause += ` AND po.supplier_id = $${paramIndex}`;
      params.push(supplier_id);
      paramIndex++;
    }

    if (from_date) {
      whereClause += ` AND po.order_date >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      whereClause += ` AND po.order_date <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (po.po_number ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM purchase_orders po
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             ${whereClause}`,
      params,
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated results
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT 
                po.*,
                s.name AS supplier_name,
                s.contact_person AS supplier_contact,
                u.name AS created_by_name,
                au.name AS approved_by_name,
                (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) AS items_count
             FROM purchase_orders po
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN users u ON po.created_by = u.id
             LEFT JOIN users au ON po.status_by = au.id
             ${whereClause}
             ORDER BY po.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params,
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching purchase orders:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

/**
 * GET /api/purchases/orders/:id
 * Get single purchase order with items
 */
export const getPurchaseOrderById = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user.current_store_id;
  const lang = getLang(req);

  try {
    // Get purchase order
    const poResult = await pool.query(
      `SELECT 
                po.*,
                s.name AS supplier_name,
                s.contact_person AS supplier_contact,
                s.email AS supplier_email,
                s.phone AS supplier_phone,
                s.address AS supplier_address,
                u.name AS created_by_name,
                au.name AS approved_by_name
             FROM purchase_orders po
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN users u ON po.created_by = u.id
             LEFT JOIN users au ON po.status_by = au.id
             WHERE po.id = $1 AND po.store_id = $2`,
      [id, storeId],
    );

    if (poResult.rows.length === 0) {
      return respondWithError(req, res, 404, "purchase_order_not_found");
    }

    // Get items
    const itemsResult = await pool.query(
      `SELECT 
                poi.*,
                p.name AS product_name,
                p.barcode,
                p.image_url
             FROM purchase_order_items poi
             LEFT JOIN products p ON poi.product_id = p.id
             WHERE poi.purchase_order_id = $1
             ORDER BY poi.created_at ASC`,
      [id],
    );

    res.json({
      success: true,
      data: {
        ...poResult.rows[0],
        items: itemsResult.rows,
      },
    });
  } catch (err) {
    console.error("Error fetching purchase order:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

/**
 * POST /api/purchases/orders
 * Create new purchase order
 */
export const createPurchaseOrder = async (req, res) => {
  const {
    supplier_id,
    expected_delivery_date,
    delivery_address,
    payment_terms,
    notes,
    internal_notes,
    items,
  } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Generate PO number
    const po_number = await generatePurchaseNumber(storeId, "po", client);

    // Get store settings
    const settings = await getStoreSettings(storeId);
    const currency = settings.defaultCurrency || "TZS";

    // Calculate totals
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    for (const item of items) {
      const lineTotal = item.quantity * item.unit_price;
      const taxAmount = (lineTotal * (item.tax_rate || 0)) / 100;
      const discountAmount = (lineTotal * (item.discount_percent || 0)) / 100;

      subtotal += lineTotal;
      totalTax += taxAmount;
      totalDiscount += discountAmount;
    }

    const totalAmount = subtotal + totalTax - totalDiscount;

    // New purchase orders should always enter approval flow.
    const status = "pending_approval";

    // Create purchase order
    const poResult = await client.query(
      `INSERT INTO purchase_orders (
                store_id, supplier_id, po_number, expected_delivery_date,
                delivery_address, payment_terms, notes, internal_notes,
                subtotal, tax_amount, discount_amount, total_amount,
                currency, status, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
      [
        storeId,
        supplier_id,
        po_number,
        expected_delivery_date,
        delivery_address,
        payment_terms,
        notes,
        internal_notes,
        subtotal,
        totalTax,
        totalDiscount,
        totalAmount,
        currency,
        status,
        userId,
      ],
    );

    const purchaseOrder = poResult.rows[0];

    // Create items
    for (const item of items) {
      const lineTotal = item.quantity * item.unit_price;
      const taxAmount = (lineTotal * (item.tax_rate || 0)) / 100;
      const discountAmount = (lineTotal * (item.discount_percent || 0)) / 100;

      await client.query(
        `INSERT INTO purchase_order_items (
                    purchase_order_id, product_id, quantity, unit_price,
                    tax_rate, tax_amount, discount_percent, discount_amount,
                    line_total, specifications, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          purchaseOrder.id,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.tax_rate || 0,
          taxAmount,
          item.discount_percent || 0,
          discountAmount,
          lineTotal + taxAmount - discountAmount,
          item.specifications,
          item.notes,
        ],
      );
    }

    await client.query("COMMIT");

    await client.query(
      `DELETE FROM purchase_carts WHERE store_id = $1 AND user_id = $2`,
      [storeId, userId],
    );

    // Log action
    await logPurchaseAction(
      userId,
      "create_purchase_order",
      {
        po_number,
        supplier_id,
        total_amount: totalAmount,
        items_count: items.length,
      },
      storeId,
      req.ip,
    );

    // Emit socket event
    emitToStore(storeId, "purchaseOrderCreated", {
      purchaseOrder,
      message: "purchase_order_created",
    });

    res.status(201).json({
      success: true,
      message: t("purchase_order_created", lang),
      data: purchaseOrder,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating purchase order:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

/**
 * PUT /api/purchases/orders/:id
 * Update purchase order
 */
export const updatePurchaseOrder = async (req, res) => {
  const { id } = req.params;
  const {
    supplier_id,
    expected_delivery_date,
    delivery_address,
    payment_terms,
    notes,
    internal_notes,
    items,
    status,
  } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if PO exists and can be updated
    const existingPO = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [id, storeId],
    );

    if (existingPO.rows.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "purchase_order_not_found");
    }

    const po = existingPO.rows[0];

    // Only allow updates to draft or pending_approval orders
    if (!["draft", "pending_approval"].includes(po.status)) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 400, "cannot_update_processed_order");
    }

    // Calculate new totals if items provided
    let subtotal = po.subtotal;
    let totalTax = po.tax_amount;
    let totalDiscount = po.discount_amount;
    let totalAmount = po.total_amount;

    if (items && items.length > 0) {
      // Delete existing items
      await client.query(
        `DELETE FROM purchase_order_items WHERE purchase_order_id = $1`,
        [id],
      );

      subtotal = 0;
      totalTax = 0;
      totalDiscount = 0;

      for (const item of items) {
        const lineTotal = item.quantity * item.unit_price;
        const taxAmount = (lineTotal * (item.tax_rate || 0)) / 100;
        const discountAmount = (lineTotal * (item.discount_percent || 0)) / 100;

        subtotal += lineTotal;
        totalTax += taxAmount;
        totalDiscount += discountAmount;

        await client.query(
          `INSERT INTO purchase_order_items (
                        purchase_order_id, product_id, quantity, unit_price,
                        tax_rate, tax_amount, discount_percent, discount_amount,
                        line_total, specifications, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            item.product_id,
            item.quantity,
            item.unit_price,
            item.tax_rate || 0,
            taxAmount,
            item.discount_percent || 0,
            discountAmount,
            lineTotal + taxAmount - discountAmount,
            item.specifications,
            item.notes,
          ],
        );
      }

      totalAmount = subtotal + totalTax - totalDiscount;
    }

    // Update purchase order
    const updateResult = await client.query(
      `UPDATE purchase_orders SET
                supplier_id = COALESCE($1, supplier_id),
                expected_delivery_date = COALESCE($2, expected_delivery_date),
                delivery_address = COALESCE($3, delivery_address),
                payment_terms = COALESCE($4, payment_terms),
                notes = COALESCE($5, notes),
                internal_notes = COALESCE($6, internal_notes),
                subtotal = $7,
                tax_amount = $8,
                discount_amount = $9,
                total_amount = $10,
                status = COALESCE($11, status),
                updated_by = $12,
                updated_at = NOW()
             WHERE id = $13 AND store_id = $14
             RETURNING *`,
      [
        supplier_id,
        expected_delivery_date,
        delivery_address,
        payment_terms,
        notes,
        internal_notes,
        subtotal,
        totalTax,
        totalDiscount,
        totalAmount,
        status,
        userId,
        id,
        storeId,
      ],
    );

    await client.query("COMMIT");

    // Log action
    await logPurchaseAction(
      userId,
      "update_purchase_order",
      { po_number: po.po_number, changes: req.body },
      storeId,
      req.ip,
    );

    // Emit socket event
    emitToStore(storeId, "purchaseOrderUpdated", {
      purchaseOrder: updateResult.rows[0],
      message: "purchase_order_updated",
    });

    res.json({
      success: true,
      message: t("purchase_order_updated", lang),
      data: updateResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error updating purchase order:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

/**
 * POST /api/purchases/orders/:id/approve
 * Approve or reject purchase order
 */
export const approvePurchaseOrder = async (req, res) => {
  const { id } = req.params;
  const { approval_status, rejection_reason } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  try {
    // Check if PO exists
    const existingPO = await pool.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND store_id = $2`,
      [id, storeId],
    );

    if (existingPO.rows.length === 0) {
      return respondWithError(req, res, 404, "purchase_order_not_found");
    }

    const po = existingPO.rows[0];

    if (po.status !== "pending_approval") {
      return respondWithError(req, res, 400, "order_not_pending_approval");
    }

    const newStatus = approval_status === "approved" ? "approved" : "cancelled";

    await pool.query(
      `UPDATE purchase_orders SET
                status = $1,
                status_by = $2,
                status_at = NOW(),
                updated_at = NOW()
             WHERE id = $3`,
      [newStatus, userId, id],
    );

    // Log action
    await logPurchaseAction(
      userId,
      approval_status === "approved"
        ? "approve_purchase_order"
        : "REJECT_PURCHASE_ORDER",
      { po_number: po.po_number, rejection_reason },
      storeId,
      req.ip,
    );

    res.json({
      success: true,
      message: t(
        approval_status === "approved"
          ? "purchase_order_approved"
          : "purchase_order_cancelled",
        lang,
      ),
    });
  } catch (err) {
    console.error("Error approving purchase order:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

/**
 * DELETE /api/purchases/orders/:id
 * Delete purchase order (only draft orders)
 */
export const deletePurchaseOrder = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  try {
    // Check if PO exists and is deletable
    const existingPO = await pool.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND store_id = $2`,
      [id, storeId],
    );

    if (existingPO.rows.length === 0) {
      return respondWithError(req, res, 404, "purchase_order_not_found");
    }

    const po = existingPO.rows[0];

    if (po.status !== "draft") {
      return respondWithError(req, res, 400, "cannot_delete_non_draft_order");
    }

    // Check for related GRNs
    const relatedGRN = await pool.query(
      `SELECT COUNT(*) FROM goods_received_notes WHERE purchase_order_id = $1`,
      [id],
    );

    if (parseInt(relatedGRN.rows[0].count) > 0) {
      return respondWithError(req, res, 400, "cannot_delete_order_with_grn");
    }

    await pool.query(`DELETE FROM purchase_orders WHERE id = $1`, [id]);

    // Log action
    await logPurchaseAction(
      userId,
      "delete_purchase_order",
      { po_number: po.po_number },
      storeId,
      req.ip,
    );

    // Emit socket event
    emitToStore(storeId, "purchaseOrderDeleted", {
      id,
      message: "purchase_order_deleted",
    });

    res.json({
      success: true,
      message: t("purchase_order_deleted", lang),
    });
  } catch (err) {
    console.error("Error deleting purchase order:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

// =====================================================
// GOODS RECEIVED NOTES (GRN)
// =====================================================

/**
 * GET /api/purchases/grn
 * Get all GRNs for a store
 */
export const getGRNs = async (req, res) => {
  const storeId = req.user.current_store_id;
  const {
    page = 1,
    limit = 20,
    status,
    supplier_id,
    from_date,
    to_date,
    search,
  } = req.query;

  try {
    let whereClause = "WHERE grn.store_id = $1";
    const params = [storeId];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND grn.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (supplier_id) {
      whereClause += ` AND grn.supplier_id = $${paramIndex}`;
      params.push(supplier_id);
      paramIndex++;
    }

    if (from_date) {
      whereClause += ` AND grn.received_date >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      whereClause += ` AND grn.received_date <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (grn.grn_number ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM goods_received_notes grn
             LEFT JOIN suppliers s ON grn.supplier_id = s.id
             ${whereClause}`,
      params,
    );
    const totalCount = parseInt(countResult.rows[0].count);

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT 
                grn.*,
                s.name AS supplier_name,
                po.po_number,
                u.name AS received_by_name,
                iu.name AS inspected_by_name
             FROM goods_received_notes grn
             LEFT JOIN suppliers s ON grn.supplier_id = s.id
             LEFT JOIN purchase_orders po ON grn.purchase_order_id = po.id
             LEFT JOIN users u ON grn.received_by = u.id
             LEFT JOIN users iu ON grn.inspected_by = iu.id
             ${whereClause}
             ORDER BY grn.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params,
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching GRNs:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

/**
 * GET /api/purchases/grn/:id
 * Get single GRN with items
 */
export const getGRNById = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user.current_store_id;

  try {
    const grnResult = await pool.query(
      `SELECT 
                grn.*,
                s.name AS supplier_name,
                s.contact_person AS supplier_contact,
                po.po_number,
                u.name AS received_by_name,
                cu.name AS created_by_name,
                iu.name AS inspected_by_name
             FROM goods_received_notes grn
             LEFT JOIN suppliers s ON grn.supplier_id = s.id
             LEFT JOIN purchase_orders po ON grn.purchase_order_id = po.id
             LEFT JOIN users u ON grn.received_by = u.id
             LEFT JOIN users cu ON grn.created_by = cu.id
             LEFT JOIN users iu ON grn.inspected_by = iu.id
             WHERE grn.id = $1 AND grn.store_id = $2`,
      [id, storeId],
    );

    if (grnResult.rows.length === 0) {
      return respondWithError(req, res, 404, "grn_not_found");
    }

    const itemsResult = await pool.query(
      `SELECT 
                gi.*,
                p.name AS product_name,
                p.barcode,
                p.image_url,
                ib.batch_number AS inventory_batch_number,
                COALESCE(ret.returned_quantity, 0) AS already_returned_quantity,
                GREATEST(gi.received_quantity - COALESCE(ret.returned_quantity, 0), 0) AS remaining_returnable_quantity
             FROM grn_items gi
             LEFT JOIN products p ON gi.product_id = p.id
             LEFT JOIN inventory_batches ib ON gi.batch_id = ib.id
             LEFT JOIN (
                SELECT
                    sri.grn_item_id,
                    SUM(sri.quantity) AS returned_quantity
                FROM supplier_return_items sri
                INNER JOIN supplier_returns sr ON sr.id = sri.supplier_return_id
                WHERE sr.store_id = $2
                  AND sr.status != 'cancelled'
                GROUP BY sri.grn_item_id
             ) ret ON ret.grn_item_id = gi.id
             WHERE gi.grn_id = $1
             ORDER BY gi.created_at ASC`,
      [id, storeId],
    );

    res.json({
      success: true,
      data: {
        ...grnResult.rows[0],
        items: itemsResult.rows,
      },
    });
  } catch (err) {
    console.error("Error fetching GRN:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

/**
 * POST /api/purchases/grn
 * Create new GRN and update inventory
 */
export const createGRN = async (req, res) => {
  const {
    supplier_id,
    purchase_order_id,
    supplier_delivery_note,
    supplier_invoice_number,
    notes,
    items,
  } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let resolvedSupplierId = supplier_id || null;
    if (!resolvedSupplierId && purchase_order_id) {
      const poResult = await client.query(
        `SELECT supplier_id FROM purchase_orders WHERE id = $1 AND store_id = $2`,
        [purchase_order_id, storeId],
      );

      if (poResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return respondWithError(req, res, 404, "purchase_order_not_found");
      }

      resolvedSupplierId = poResult.rows[0].supplier_id;
    }

    if (!resolvedSupplierId) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 400, "supplier_required");
    }

    // Generate GRN number
    const grn_number = await generatePurchaseNumber(storeId, "grn", client);

    // Get store settings
    const settings = await getStoreSettings(storeId);
    const requireInspection = settings.purchases?.requireGRNInspection || false;
    const useBatchWisePrice = settings.operations?.useBatchWisePrice || false;
    const defaultPriceCategory = settings.operations?.defaultPriceCategory || null;

    // Calculate totals
    let totalItems = items.length;
    let totalQuantity = 0;
    let totalValue = 0;

    for (const item of items) {
      const unitCost = parseFloat(item.unit_cost ?? item.unit_price ?? 0);
      const qty = parseFloat(
        item.received_quantity ?? item.quantity_received ?? 0,
      );
      totalQuantity += qty;
      totalValue += qty * unitCost;
    }

    // Create GRN
    const grnResult = await client.query(
      `INSERT INTO goods_received_notes (
                store_id, supplier_id, purchase_order_id, grn_number,
                supplier_delivery_note, supplier_invoice_number,
                status, total_items, total_quantity, total_value,
                notes, received_by, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
      [
        storeId,
        resolvedSupplierId,
        purchase_order_id,
        grn_number,
        supplier_delivery_note,
        supplier_invoice_number,
        requireInspection ? "pending_inspection" : "approved",
        totalItems,
        totalQuantity,
        totalValue,
        notes,
        userId,
        userId,
      ],
    );

    const grn = grnResult.rows[0];

    // Process items and create inventory
    for (const item of items) {
      let batchId = null;
      const receivedQty = parseFloat(
        item.received_quantity ?? item.quantity_received ?? 0,
      );
      const unitCost = parseFloat(item.unit_cost ?? item.unit_price ?? 0);

      // Resolve the selling price to use for this item's batch now, even if
      // the GRN still needs inspection — this way the price the user set (or
      // the carried-forward price) is preserved on grn_items and can be
      // re-applied later once inspection approves the batch.
      let sellingPrice;
      try {
        sellingPrice = await resolveBatchSellingPrice(client, {
          storeId,
          productId: item.product_id,
          useBatchWisePrice,
          providedPrice: item.selling_price,
        });
      } catch (priceErr) {
        await client.query("ROLLBACK");
        return respondWithError(
          req,
          res,
          400,
          "selling_price_required_for_batchwise_pricing",
        );
      }

      // If GRN is auto-approved, create inventory batch and movement
      if (!requireInspection) {
        // Create inventory batch
        const batchResult = await client.query(
          `INSERT INTO inventory_batches (
                        store_id, product_id, batch_number,
                        cost_price, selling_price, manufacturing_date, expiry_date,
                        status, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
                    RETURNING id`,
          [
            storeId,
            item.product_id,
            item.batch_number || grn_number,
            unitCost,
            sellingPrice,
            item.manufacturing_date,
            item.expiry_date,
            userId,
          ],
        );
        batchId = batchResult.rows[0].id;

        // Keep the per-price-category table (selling_prices) in sync so that
        // reports/product listings that read price via that table don't fall
        // back to 0 for the newly received batch.
        if (defaultPriceCategory) {
          await client.query(
            `INSERT INTO selling_prices (batch_id, price_category_id, price)
             VALUES ($1, $2, $3)`,
            [batchId, defaultPriceCategory, sellingPrice],
          );
        }

        // Create inventory movement (IN)
        if (receivedQty > 0) {
          await client.query(
            `INSERT INTO inventory_movements (
                        store_id, product_id, batch_id, quantity,
                        type, note, created_by, transaction_date
                    ) VALUES ($1, $2, $3, $4, 'IN', $5, $6, NOW())`,
            [
              storeId,
              item.product_id,
              batchId,
              receivedQty,
              `GRN: ${grn_number}`,
              userId,
            ],
          );
        }
      }

      // Get PO item ID if linked
      let poItemId = null;
      if (
        purchase_order_id &&
        (item.purchase_order_item_id || item.po_item_id)
      ) {
        poItemId = item.purchase_order_item_id || item.po_item_id;

        // Update PO item received quantity
        await client.query(
          `UPDATE purchase_order_items 
                     SET received_quantity = received_quantity + $1, updated_at = NOW()
                     WHERE id = $2`,
          [receivedQty, poItemId],
        );
      }

      // Create GRN item
      await client.query(
        `INSERT INTO grn_items (
                    grn_id, purchase_order_item_id, product_id, batch_id,
                    expected_quantity, received_quantity, accepted_quantity,
                    unit_cost, line_total, batch_number, manufacturing_date, expiry_date,
                    inspection_status, notes, selling_price
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          grn.id,
          poItemId,
          item.product_id,
          batchId,
          item.expected_quantity || receivedQty,
          receivedQty,
          requireInspection ? 0 : receivedQty,
          unitCost,
          receivedQty * unitCost,
          item.batch_number,
          item.manufacturing_date,
          item.expiry_date,
          requireInspection ? "pending" : "accepted",
          item.notes,
          sellingPrice,
        ],
      );
    }

    // Update PO status if linked
    if (purchase_order_id) {
      // Check if all items are received
      const poItemsCheck = await client.query(
        `SELECT 
                    SUM(quantity) AS total_ordered,
                    SUM(received_quantity) AS total_received
                 FROM purchase_order_items
                 WHERE purchase_order_id = $1`,
        [purchase_order_id],
      );

      const { total_ordered, total_received } = poItemsCheck.rows[0];
      let newPOStatus = "partially_received";

      if (parseFloat(total_received) >= parseFloat(total_ordered)) {
        newPOStatus = "received";
      }

      await client.query(
        `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newPOStatus, purchase_order_id],
      );
    }

    await client.query("COMMIT");

    // Log action
    await logPurchaseAction(
      userId,
      "create_grn",
      {
        grn_number,
        supplier_id: resolvedSupplierId,
        total_value: totalValue,
        items_count: totalItems,
      },
      storeId,
      req.ip,
    );

    // Emit socket event
    emitToStore(storeId, "grnCreated", {
      grn,
      message: "grn_created",
    });

    notifyStore({
      storeId,
      type: "purchase_received",
      title: "Purchase received",
      message: "A goods received note was created",
      meta: { grn_number: grn.grn_number },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: t("grn_created", lang),
      data: grn,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating GRN:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

/**
 * POST /api/purchases/grn/:id/inspect
 * Inspect GRN items (accept/reject)
 */
export const inspectGRN = async (req, res) => {
  const { id } = req.params;
  const { inspection_status, inspection_notes, items } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const settings = await getStoreSettings(storeId);
    const useBatchWisePrice = settings.operations?.useBatchWisePrice || false;
    const defaultPriceCategory = settings.operations?.defaultPriceCategory || null;

    // Get GRN
    const grnResult = await client.query(
      `SELECT * FROM goods_received_notes WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [id, storeId],
    );

    if (grnResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 404, "grn_not_found");
    }

    const grn = grnResult.rows[0];

    if (grn.status !== "pending_inspection") {
      await client.query("ROLLBACK");
      return respondWithError(req, res, 400, "grn_not_pending_inspection");
    }

    // Process each item
    for (const item of items || []) {
      const acceptedQty = item.accepted_quantity || 0;
      const rejectedQty = item.rejected_quantity || 0;

      // Update GRN item
      await client.query(
        `UPDATE grn_items SET
                    accepted_quantity = $1,
                    rejected_quantity = $2,
                    inspection_status = $3,
                    rejection_reason = $4,
                    updated_at = NOW()
                 WHERE id = $5`,
        [
          acceptedQty,
          rejectedQty,
          acceptedQty > 0
            ? rejectedQty > 0
              ? "partial"
              : "accepted"
            : "rejected",
          item.rejection_reason,
          item.id,
        ],
      );

      // Create inventory for accepted items
      if (acceptedQty > 0) {
        const grnItem = await client.query(
          `SELECT * FROM grn_items WHERE id = $1`,
          [item.id],
        );
        const itemData = grnItem.rows[0];

        let sellingPrice;
        try {
          sellingPrice = await resolveBatchSellingPrice(client, {
            storeId,
            productId: itemData.product_id,
            useBatchWisePrice,
            providedPrice: itemData.selling_price,
          });
        } catch (priceErr) {
          await client.query("ROLLBACK");
          return respondWithError(
            req,
            res,
            400,
            "selling_price_required_for_batchwise_pricing",
          );
        }

        // Create inventory batch
        const batchResult = await client.query(
          `INSERT INTO inventory_batches (
                        store_id, product_id, batch_number,
                        cost_price, selling_price, manufacturing_date, expiry_date,
                        status, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
                    RETURNING id`,
          [
            storeId,
            itemData.product_id,
            itemData.batch_number || grn.grn_number,
            itemData.unit_cost,
            sellingPrice,
            itemData.manufacturing_date,
            itemData.expiry_date,
            userId,
          ],
        );

        if (defaultPriceCategory) {
          await client.query(
            `INSERT INTO selling_prices (batch_id, price_category_id, price)
             VALUES ($1, $2, $3)`,
            [batchResult.rows[0].id, defaultPriceCategory, sellingPrice],
          );
        }

        // Create inventory movement
        await client.query(
          `INSERT INTO inventory_movements (
                        store_id, product_id, batch_id, quantity,
                        type, note, created_by, transaction_date
                    ) VALUES ($1, $2, $3, $4, 'IN', $5, $6, NOW())`,
          [
            storeId,
            itemData.product_id,
            batchResult.rows[0].id,
            acceptedQty,
            `GRN: ${grn.grn_number} (Inspected)`,
            userId,
          ],
        );

        // Update GRN item with batch ID
        await client.query(`UPDATE grn_items SET batch_id = $1 WHERE id = $2`, [
          batchResult.rows[0].id,
          item.id,
        ]);
      }
    }

    // Update GRN status
    await client.query(
      `UPDATE goods_received_notes SET
                status = 'approved',
                inspection_status = $1,
                inspected_by = $2,
                inspected_at = NOW(),
                inspection_notes = $3,
                updated_at = NOW()
             WHERE id = $4`,
      [inspection_status, userId, inspection_notes, id],
    );

    // Auto-create supplier invoice if setting is enabled
    if (settings.purchases?.autoCreateSupplierInvoice) {
      // Fetch accepted GRN items
      const grnItemsResult = await client.query(
        `SELECT gi.*, p.name AS product_name
         FROM grn_items gi
         LEFT JOIN products p ON p.id = gi.product_id
         WHERE gi.grn_id = $1 AND COALESCE(gi.inspection_status, 'accepted') != 'rejected'`,
        [id],
      );

      const invoiceItems = grnItemsResult.rows
        .map((item) => ({
          product_id: item.product_id,
          grn_item_id: item.id,
          description: item.product_name,
          quantity: parseFloat(item.accepted_quantity) || 0,
          unit_price: parseFloat(item.unit_cost) || 0,
          line_total: (parseFloat(item.accepted_quantity) || 0) * (parseFloat(item.unit_cost) || 0),
        }))
        .filter((item) => item.quantity > 0);

      if (invoiceItems.length > 0) {
        const invoiceSubtotal = invoiceItems.reduce((sum, i) => sum + i.line_total, 0);

        // Generate bill number
        await client.query(
          `INSERT INTO store_invoice_counters (store_id) VALUES ($1) ON CONFLICT (store_id) DO NOTHING`,
          [storeId],
        );
        const billCounterResult = await client.query(
          `UPDATE store_invoice_counters SET last_bill_number = last_bill_number + 1
           WHERE store_id = $1 RETURNING last_bill_number`,
          [storeId],
        );
        const billNum = billCounterResult.rows[0].last_bill_number;
        const year = new Date().getFullYear();
        const bill_number = `BILL-${year}-${String(billNum).padStart(6, "0")}`;

        // Insert supplier invoice
        const invoiceResult = await client.query(
          `INSERT INTO supplier_invoices (
              store_id, supplier_id, purchase_order_id, grn_id,
              bill_number, invoice_date, subtotal, tax_amount, discount_amount,
              shipping_cost, other_charges, total_amount, currency, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, 0, 0, 0, 0, $7, $8, $9, $10)
          RETURNING id`,
          [
            storeId,
            grn.supplier_id,
            grn.purchase_order_id,
            grn.id,
            bill_number,
            invoiceSubtotal,
            invoiceSubtotal,
            settings.defaultCurrency || "TZS",
            `Auto-created from GRN ${grn.grn_number}`,
            userId,
          ],
        );

        const invoiceId = invoiceResult.rows[0].id;

        // Insert invoice line items
        for (const item of invoiceItems) {
          await client.query(
            `INSERT INTO supplier_invoice_items (
                supplier_invoice_id, product_id, grn_item_id,
                description, quantity, unit_price, tax_rate, tax_amount,
                discount_amount, line_total
            ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, $7)`,
            [
              invoiceId,
              item.product_id,
              item.grn_item_id,
              item.description,
              item.quantity,
              item.unit_price,
              item.line_total,
            ],
          );
        }
      }
    }

    await client.query("COMMIT");

    // Emit invoice created event if auto-created
    if (settings?.purchases?.autoCreateSupplierInvoice) {
      emitToStore(storeId, "supplierInvoiceCreated", {
        message: "supplier_invoice_auto_created",
      });
    }

    // Log action
    await logPurchaseAction(
      userId,
      "inspect_grn",
      { grn_number: grn.grn_number, inspection_status },
      storeId,
      req.ip,
    );

    res.json({
      success: true,
      message: t("grn_inspected", lang),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error inspecting GRN:", err);
    return respondWithError(req, res, 500, "server_error");
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/purchases/grn/:id
 * Delete GRN (only draft GRNs)
 */
export const deleteGRN = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  try {
    const existingGRN = await pool.query(
      `SELECT * FROM goods_received_notes WHERE id = $1 AND store_id = $2`,
      [id, storeId],
    );

    if (existingGRN.rows.length === 0) {
      return respondWithError(req, res, 404, "grn_not_found");
    }

    const grn = existingGRN.rows[0];

    if (grn.status !== "draft") {
      return respondWithError(req, res, 400, "cannot_delete_non_draft_grn");
    }

    await pool.query(`DELETE FROM goods_received_notes WHERE id = $1`, [id]);

    // Log action
    await logPurchaseAction(
      userId,
      "delete_grn",
      { grn_number: grn.grn_number },
      storeId,
      req.ip,
    );

    res.json({
      success: true,
      message: t("grn_deleted", lang),
    });
  } catch (err) {
    console.error("Error deleting GRN:", err);
    return respondWithError(req, res, 500, "server_error");
  }
};

