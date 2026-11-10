import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO, emitToStore } from '../utils/socket.js';
import { notifyStore } from '../services/notification.service.js';
import * as smsService from '../utils/smsService.js';
import getStoreSettings from '../utils/getStoreSettings.js';
import { logActivity } from '../utils/activityLog.js';
// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate sequential invoice number for a store
 */
async function generateInvoiceNumber(store_id) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT last_invoice_number FROM store_invoice_counters WHERE store_id = $1 FOR UPDATE`,
      [store_id],
    );

    let newInvoiceNumber;

    if (rows.length === 0) {
      newInvoiceNumber = 1;
      await client.query(
        `INSERT INTO store_invoice_counters (store_id, last_invoice_number) VALUES ($1, $2)`,
        [store_id, newInvoiceNumber],
      );
    } else {
      newInvoiceNumber = rows[0].last_invoice_number + 1;
      await client.query(
        `UPDATE store_invoice_counters SET last_invoice_number = $1 WHERE store_id = $2`,
        [newInvoiceNumber, store_id],
      );
    }

    await client.query("COMMIT");

    return String(newInvoiceNumber).padStart(5, "0");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Generate sequential order number for a store
 */
async function generateOrderNumber(store_id) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT last_sales_order_number FROM store_invoice_counters WHERE store_id = $1 FOR UPDATE`,
      [store_id],
    );

    let newOrderNumber;

    if (rows.length === 0) {
      newOrderNumber = 1;
      await client.query(
        `INSERT INTO store_invoice_counters (store_id, last_sales_order_number) VALUES ($1, $2)`,
        [store_id, newOrderNumber],
      );
    } else {
      newOrderNumber = rows[0].last_sales_order_number + 1;
      await client.query(
        `UPDATE store_invoice_counters SET last_sales_order_number = $1 WHERE store_id = $2`,
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
 * Generate sequential return number for a store
 */
async function generateReturnNumber(store_id) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT last_sales_return_number FROM store_invoice_counters WHERE store_id = $1 FOR UPDATE`,
      [store_id],
    );

    let newReturnNumber;

    if (rows.length === 0) {
      newReturnNumber = 1;
      await client.query(
        `INSERT INTO store_invoice_counters (store_id, last_sales_return_number) VALUES ($1::uuid, $2::integer)
                 ON CONFLICT (store_id) DO UPDATE SET last_sales_return_number = $2::integer`,
        [store_id, newReturnNumber],
      );
    } else {
      newReturnNumber = (rows[0].last_sales_return_number || 0) + 1;
      await client.query(
        `UPDATE store_invoice_counters SET last_sales_return_number = $1 WHERE store_id = $2`,
        [newReturnNumber, store_id],
      );
    }

    await client.query("COMMIT");

    return `RET-${String(newReturnNumber).padStart(5, "0")}`;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check customer credit limit
 */
async function checkCustomerCreditLimit(customerId, storeId, amount) {
  try {
    const result = await pool.query(
      `SELECT credit_limit, current_balance FROM customers WHERE id = $1 AND store_id = $2`,
      [customerId, storeId],
    );

    if (result.rows.length === 0) {
      return { allowed: false, message: "customer_not_found" };
    }

    const customer = result.rows[0];
    const creditLimit = parseFloat(customer.credit_limit) || 0;
    const currentBalance = parseFloat(customer.current_balance) || 0;
    const availableCredit = creditLimit - currentBalance;

    if (amount > availableCredit) {
      return {
        allowed: false,
        message: "credit_limit_exceeded",
        availableCredit,
        requestedAmount: amount,
      };
    }

    return { allowed: true, availableCredit };
  } catch (err) {
    console.error("Error checking credit limit:", err);
    return { allowed: false, message: "error_checking_credit" };
  }
}

// =====================================================
// CART OPERATIONS
// =====================================================

/**
 * GET /api/sales/active-cart
 * Get the current user's active (OnProcess) cart with all items
 */
export const getActiveCart = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  try {
    // Find the OnProcess cart for this user/store
    const codeResult = await pool.query(
      `SELECT DISTINCT cart_code FROM cart
             WHERE (status = 'OnProcess' OR status = 'OrderEdit') AND store_id = $1 AND user_id = $2
             LIMIT 1`,
      [storeId, userId],
    );

    if (codeResult.rows.length === 0) {
      return res.json({ success: true, cart_code: null, items: [] });
    }

    const cart_code = codeResult.rows[0].cart_code;

    const itemsResult = await pool.query(
      `SELECT c.id, c.product_id, c.quantity, c.price, c.discount, c.cart_code, c.status,
                    p.name AS product_name, p.barcode, p.image_url, p.unit, p.status AS product_status
             FROM cart c
             JOIN products p ON c.product_id = p.id
             WHERE c.cart_code = $1 AND c.store_id = $2 AND c.user_id = $3 AND (c.status = 'OnProcess' OR c.status = 'OrderEdit')
             ORDER BY c.created_at ASC`,
      [cart_code, storeId, userId],
    );

    res.json({
      success: true,
      cart_code,
      status: itemsResult.rows[0].status,
      items: itemsResult.rows,
    });
  } catch (err) {
    console.error("Error fetching active cart:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/sales/sync-cart
 * Sync the full cart state from frontend to backend.
 * Replaces all OnProcess items for this user with the provided items.
 */
export const syncActiveCart = async (req, res) => {
  const { items, cart_code } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const groupCode = cart_code || `S-ID-${Date.now()}`;

    // Delete all existing OnProcess items for this user/store with same cart_code
    // If no cart_code was provided, delete ALL OnProcess items for the user
    if (cart_code) {
      await client.query(
        `DELETE FROM cart WHERE cart_code = $1 AND store_id = $2 AND user_id = $3 AND status = 'OnProcess'`,
        [cart_code, storeId, userId],
      );
    } else {
      await client.query(
        `DELETE FROM cart WHERE store_id = $1 AND user_id = $2 AND status = 'OnProcess'`,
        [storeId, userId],
      );
    }

    // Insert new items (only those with a product_id)
    const validItems = (items || []).filter(
      (i) => i.product_id && i.quantity > 0,
    );

    for (const item of validItems) {
      await client.query(
        `INSERT INTO cart (store_id, user_id, product_id, quantity, price, discount, status, discount_mode, cart_code, customer_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'OnProcess', $7, $8, $9)`,
        [
          storeId,
          userId,
          item.product_id,
          item.quantity,
          item.price || 0,
          item.discount || 0,
          item.discount_mode || "amount",
          groupCode,
          item.customer_id || null,
        ],
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: t("cart_synced", lang),
      cart_code: validItems.length > 0 ? groupCode : null,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error syncing cart:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

/**
 * POST /api/sales/cart
 * Add item to cart manually
 */
export const addToCart = async (req, res) => {
  const { storeId, product_id, cart_code, quantity, price, discount } =
    req.body;
  const userId = req.user.id;
  const lang = getLang(req);

  try {
    const groupCode = cart_code || `S-ID-${Date.now()}`;

    await pool.query(
      `
            INSERT INTO cart (store_id, user_id, product_id, quantity, price, discount, status, cart_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (store_id, user_id, status = 'OnProcess', product_id) 
            DO UPDATE SET 
                quantity = cart.quantity + EXCLUDED.quantity, 
                updated_at = NOW()
        `,
      [
        storeId,
        userId,
        product_id,
        quantity,
        price,
        discount,
        "OnProcess",
        groupCode,
      ],
    );

    res.status(201).json({
      success: true,
      message: t("added_to_cart", lang),
      cartCode: groupCode,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/sales/cart-by-barcode
 * Add item to cart by barcode scanning
 */
export const addToCartByBarcode = async (req, res) => {
  const { storeId, barcode, cart_code, quantity } = req.body;
  const userId = req.user.id;
  const lang = getLang(req);

  try {
    const groupCode = cart_code || `S-ID:${Date.now()}`;

    // 1. Find product by barcode
    const productRes = await pool.query(
      `
            SELECT * FROM products
            WHERE barcode = $1 AND store_id = $2
        `,
      [barcode, storeId],
    );

    if (productRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: t("product_not_found", lang),
      });
    }

    const productId = productRes.rows[0].id;

    // 2. Check available stock
    const stockRes = await pool.query(
      `
            SELECT 
                SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END) AS available_stock
            FROM inventory_batches ib
            LEFT JOIN inventory_movements im ON ib.id = im.batch_id
            WHERE ib.product_id = $1
            AND ib.store_id = $2
            AND ib.status IN ('in_use', 'pending')
        `,
      [productId, storeId],
    );

    const rawStock = parseFloat(stockRes.rows[0].available_stock);
    const availableStock = isNaN(rawStock)
      ? 0
      : parseFloat(rawStock.toFixed(2));

    // 3. Check if product is already in cart
    const cartCheckRes = await pool.query(
      `
            SELECT quantity FROM cart
            WHERE store_id = $1 AND cart_code = $2 AND product_id = $3 AND user_id = $4 AND status != 'Sold'
        `,
      [storeId, groupCode, productId, userId],
    );

    const currentCartQty =
      cartCheckRes.rows.length > 0
        ? parseFloat(cartCheckRes.rows[0].quantity)
        : 0;
    const requestedTotalQty = currentCartQty + quantity;

    if (requestedTotalQty > availableStock) {
      return res.status(400).json({
        success: false,
        message: "large_quantity",
        available: availableStock - currentCartQty,
      });
    }

    if (availableStock === 0) {
      return res.status(400).json({
        success: false,
        message: "out_of_stock",
      });
    }

    // 4. Get first available batch
    const batchRes = await pool.query(
      `
            SELECT 
                ib.id,
                ib.selling_price,
                ib.status,
                SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END) AS available_stock
            FROM inventory_batches ib
            LEFT JOIN inventory_movements im ON ib.id = im.batch_id
            WHERE ib.product_id = $1
            AND ib.store_id = $2
            AND ib.status IN ('in_use', 'pending')
            GROUP BY ib.id, ib.selling_price, ib.status
            HAVING SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END) > 0
            ORDER BY 
                COALESCE(ib.expiry_date, 'infinity') ASC,
                ib.created_at ASC
            LIMIT 1
        `,
      [productId, storeId],
    );

    const batch = batchRes.rows[0];

    // 5. Check invoice status
    const invoiceStatusRes = await pool.query(
      `
            SELECT status FROM cart
            WHERE store_id = $1 AND cart_code = $2
            LIMIT 1
        `,
      [storeId, groupCode],
    );

    if (
      invoiceStatusRes.rows.length > 0 &&
      invoiceStatusRes.rows[0].status === "Sold"
    ) {
      return res.status(400).json({
        success: false,
        message: t("invoice_is_sold", lang),
      });
    }

    if (
      invoiceStatusRes.rows.length > 0 &&
      ["Saved", "Pending"].includes(invoiceStatusRes.rows[0].status)
    ) {
      return res.status(400).json({
        success: false,
        message: t("invoice_is_locked", lang),
      });
    }

    // 6. Add to cart
    await pool.query(
      `
            INSERT INTO cart (
                store_id, user_id, product_id, cart_code,
                quantity, price, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (store_id, cart_code, product_id, user_id)
            DO UPDATE SET 
                quantity = cart.quantity + EXCLUDED.quantity,
                updated_at = NOW()
        `,
      [storeId, userId, productId, groupCode, quantity, batch.selling_price],
    );

    res.status(201).json({
      success: true,
      message: t("added_to_cart", lang),
      product_id: productId,
      quantity,
      price: batch.selling_price,
      cartCode: groupCode,
    });
  } catch (err) {
    console.error(err);
    return respondWithError(req, res, 500, "server_error");
  }
};

/**
 * PUT /api/sales/cart/:id
 * Update cart item
 */
export const updateCartItem = async (req, res) => {
  const cartItemId = req.params.id;
  const { storeId, cart_code, productId, quantity, selling_price, discount } =
    req.body;
  const userId = req.user.id;
  const lang = getLang(req);

  try {
    // 1. Check if item exists in cart
    const cartRes = await pool.query(
      `
            SELECT * FROM cart
            WHERE cart_code = $1 AND id = $2 AND user_id = $3 AND store_id = $4
        `,
      [cart_code, cartItemId, userId, storeId],
    );

    if (cartRes.rows.length === 0) {
      return respondWithError(req, res, 404, "item_not_found_in_cart");
    }

    // 2. Check available stock
    const stockRes = await pool.query(
      `
            SELECT 
                SUM(CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END) AS available_stock
            FROM inventory_batches ib
            LEFT JOIN inventory_movements im ON ib.id = im.batch_id
            WHERE ib.product_id = $1
            AND ib.store_id = $2
            AND ib.status IN ('in_use', 'pending')
        `,
      [productId, storeId],
    );

    const rawStock = parseFloat(stockRes.rows[0].available_stock);
    const availableStock = isNaN(rawStock)
      ? 0
      : parseFloat(rawStock.toFixed(2));

    if (quantity > availableStock) {
      return respondWithError(req, res, 400, "insufficient_stock");
    }

    // 3. Update cart item
    await pool.query(
      `
            UPDATE cart
            SET quantity = $1, price = $2, discount = $3, updated_at = NOW()
            WHERE cart_code = $4 AND id = $5 AND user_id = $6 AND store_id = $7
        `,
      [
        quantity,
        selling_price,
        discount,
        cart_code,
        cartItemId,
        userId,
        storeId,
      ],
    );

    res.status(200).json({
      success: true,
      message: t("cart_item_updated", lang),
    });
  } catch (err) {
    console.error(err);
    return respondWithError(req, res, 500, "server_error");
  }
};

/**
 * DELETE /api/sales/cart/:id
 * Remove item from cart
 */
export const removeCartItem = async (req, res) => {
  const id = req.params.id;
  const lang = getLang(req);

  try {
    await pool.query(`DELETE FROM cart WHERE id = $1`, [id]);
    res.json({ success: true, message: t("cart_item_removed", lang) });
  } catch (err) {
    console.error("Error removing cart item:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/sales/cart/:cartcode
 * Get cart items by cart code
 */
export const getCartByCartCode = async (req, res) => {
  let cart_code = req.params.cartcode;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;

  try {
    if (!cart_code || cart_code === "null" || cart_code === "undefined") {
      const findCartCodeQuery = `
                SELECT cart_code 
                FROM cart 
                WHERE status = $1 AND store_id = $2 AND user_id = $3 
                LIMIT 1
            `;
      const codeResult = await pool.query(findCartCodeQuery, [
        "OnProcess",
        storeId,
        userId,
      ]);

      if (codeResult.rows.length === 0) {
        return res.json({
          success: true,
          items: [],
          message: t("cart_is_empty", req),
        });
      }

      cart_code = codeResult.rows[0].cart_code;
    }

    const itemsQuery = `
            SELECT c.*, p.name, p.image_url 
            FROM cart c 
            JOIN products p ON c.product_id = p.id
            WHERE c.cart_code = $1 AND c.store_id = $2 AND c.user_id = $3
            ORDER BY c.created_at ASC
        `;
    const itemsResult = await pool.query(itemsQuery, [
      cart_code,
      storeId,
      userId,
    ]);

    res.json({ success: true, cart_code, cartDatas: itemsResult.rows });
  } catch (err) {
    console.error("Error fetching cart:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/sales/sell-cart
 * Process a sale (cash, credit, or order)
 */
export const recordSale = async (req, res) => {
  const {
    storeId,
    items,
    cart_code,
    customerId,
    customerName,
    customerPhone,
    subTotal,
    totalDiscount,
    amountTax,
    amountTotal,
    amountPaid,
    amountDue,
    amountChange,
    paymentMethod,
    paymentNotes,
    salesDate,
    saleType = "cash", // 'cash', 'credit', or 'order'
  } = req.body;
  const userId = req.user.id;
  const productNames = {};
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    // Get store settings
    const storeSettings = await getStoreSettings(storeId);

    // Validate credit sale
    if (saleType === "credit") {
      if (!storeSettings.operations.creditSalesSupport) {
        throw new Error(t("credit_sale_not_supported", lang));
      }

      if (!customerId) {
        throw new Error(t("customer_required_for_credit", lang));
      }

      // Check credit limit if enabled
      if (storeSettings.operations.customerCreditLimit) {
        const creditCheck = await checkCustomerCreditLimit(
          customerId,
          storeId,
          amountTotal,
        );
        if (!creditCheck.allowed) {
          throw new Error(t(creditCheck.message, lang));
        }
      }
    }

    const invoice_number = await generateInvoiceNumber(storeId);

    await client.query("BEGIN");
    const saleDetails = [];

    // 1. Check if order already sold
    const alreadySoldCheck = await client.query(
      "SELECT COUNT(*) FROM cart WHERE cart_code = $1 AND store_id = $2 AND status = $3",
      [cart_code, storeId, "Sold"],
    );

    if (parseInt(alreadySoldCheck.rows[0].count) > 0) {
      throw new Error(t("order_already_sold", lang));
    }

    // 2. Check if order is available for processing
    const onProcessCheck = await client.query(
      "SELECT COUNT(*) FROM cart WHERE cart_code = $1 AND store_id = $2 AND status = $3",
      [cart_code, storeId, "OnProcess"],
    );

    if (parseInt(onProcessCheck.rows[0].count) === 0) {
      throw new Error(t("order_not_found_or_invalid", lang));
    }

    // Pre-fetch product names
    const productIds = items.map((item) => item.product_id);
    const productsResult = await client.query(
      `SELECT id, name FROM products WHERE id = ANY($1)`,
      [productIds],
    );

    productsResult.rows.forEach((product) => {
      productNames[product.id] = product.name;
    });

    // Pre-fetch the REAL cart row ids for this cart_code (never trust an id
    // sent from the client). These are used to tag each OUT movement with
    // the exact cart line it was consumed by, so cost reports don't have to
    // guess by product+store+date.
    const cartRowsResult = await client.query(
      `SELECT id, product_id FROM cart WHERE cart_code = $1 AND store_id = $2`,
      [cart_code, storeId],
    );
    const cartIdByProduct = {};
    cartRowsResult.rows.forEach((row) => {
      cartIdByProduct[row.product_id] = row.id;
    });

    for (const item of items) {
      let remainingQty = item.quantity;
      const productId = item.product_id;
      const productName = productNames[productId];
      const cartLineId = cartIdByProduct[productId] || null;
      let batchesUsed = [];

      if (!productName) {
        throw new Error(`${t("product_not_found", lang)} (${productId})`);
      }

      // LOCK ALL batches for this product FIRST
      const lockResult = await client.query(
        `SELECT id
          FROM inventory_batches
          WHERE product_id = $1
            AND store_id = $2
            AND (expiry_date IS NULL OR expiry_date >= NOW())
          FOR UPDATE
          `,
        [productId, storeId],
      );

      if (lockResult.rows.length === 0) {
        throw new Error(`${productName} - ${t("insufficient_stock", lang)}`);
      }

      // Calculate stock safely (inside lock)
      const batchesResult = await client.query(
        `SELECT 
            ib.id,
            ib.batch_number,
            ib.selling_price,
            ib.cost_price,
            ib.status,
            ib.expiry_date,
            ib.created_at,
            COALESCE(SUM(
              CASE 
                WHEN im.type = 'IN' THEN im.quantity 
                ELSE -im.quantity 
              END
            ), 0) AS available_stock
          FROM inventory_batches ib
          LEFT JOIN inventory_movements im ON ib.id = im.batch_id
          WHERE ib.product_id = $1
            AND ib.store_id = $2
            AND (ib.expiry_date IS NULL OR ib.expiry_date >= NOW())
          GROUP BY ib.id
          HAVING COALESCE(SUM(
            CASE 
              WHEN im.type = 'IN' THEN im.quantity 
              ELSE -im.quantity 
            END
          ), 0) > 0
          ORDER BY 
            CASE WHEN ib.status = 'in_use' THEN 0 ELSE 1 END,
            COALESCE(ib.expiry_date, 'infinity') ASC,
            ib.created_at ASC
          `,
        [productId, storeId],
      );

      const batches = batchesResult.rows;

      if (batches.length === 0) {
        throw new Error(`${productName} - ${t("insufficient_stock", lang)}`);
      }

      // PROCESS SAFELY
      for (const batch of batches) {
        if (remainingQty <= 0) break;

        let availableStock = parseFloat(batch.available_stock);
        if (availableStock <= 0) continue;

        // AUTO ACTIVATE
        if (batch.status !== "in_use") {
          await client.query(
            `UPDATE inventory_batches SET status = 'in_use' WHERE id = $1`,
            [batch.id],
          );
        }

        const qtyToSell = Math.min(availableStock, remainingQty);

        // Record OUT movement
        await client.query(
          `
      INSERT INTO inventory_movements (
        store_id,
        product_id,
        batch_id,
        cart_id,
        quantity,
        type,
        note,
        created_by,
        created_at,
        transaction_date
      ) VALUES (
        $1, $2, $3, $4, $5,
        'OUT',
        $6,
        $7,
        NOW(),
        $8
      )
      `,
          [
            storeId,
            productId,
            batch.id,
            cartLineId,
            qtyToSell,
            `Sold in invoice ${invoice_number}`,
            userId,
            salesDate,
          ],
        );

        batchesUsed.push({
          batchId: batch.id,
          quantity: qtyToSell,
          price: item.selling_price,
          costPrice: batch.cost_price || 0,
          discount: item.discount || 0,
        });

        remainingQty -= qtyToSell;

        // Mark sold out
        if (availableStock - qtyToSell <= 0) {
          await client.query(
            `UPDATE inventory_batches SET status = 'sold_out' WHERE id = $1`,
            [batch.id],
          );
        }
      }

      if (remainingQty > 0) {
        throw new Error(`${productName} - ${t("insufficient_stock", lang)}`);
      }

      saleDetails.push({
        id: productId,
        name: productName,
        batches: batchesUsed,
        quantity: item.quantity,
        price: item.selling_price,
        discount: item.discount || 0,
      });
    }

    // Handle customer
    let resolvedCustomerId = customerId || null;
    let customerInfo = null;
    let creditDueDays = 0;
    if (!resolvedCustomerId && (customerName || customerPhone)) {
      const result = await client.query(
        "SELECT * FROM customers WHERE (name = $1 OR phone = $2) AND store_id = $3",
        [customerName, customerPhone, storeId],
      );

      customerInfo = result.rows[0] || null;
      if (result.rows.length > 0) {
        resolvedCustomerId = result.rows[0].id;
        creditDueDays = result.rows[0].credit_due_days || 0;
      } else {
        const insertResult = await client.query(
          `INSERT INTO customers (name, phone, created_by, store_id) 
                     VALUES ($1, $2, $3, $4) RETURNING id`,
          [customerName, customerPhone, userId, storeId],
        );
        resolvedCustomerId = insertResult.rows[0].id;
      }
    } else {
      if (resolvedCustomerId) {
        const result = await client.query(
          "SELECT * FROM customers WHERE id = $1 AND store_id = $2",
          [resolvedCustomerId, storeId],
        );
        customerInfo = result.rows[0] || null;
        creditDueDays = customerInfo?.credit_due_days || 0;
      }
    }

    // Insert payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (
                invoice_number, cart_code, store_id, user_id, total_amount, amount_paid, 
                amount_change, amount_due, created_at, payment_method, notes, sale_type, subtotal, total_discount, total_vat, sales_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        invoice_number,
        cart_code,
        storeId,
        userId,
        amountTotal,
        amountPaid,
        amountChange,
        amountDue,
        paymentMethod,
        paymentNotes,
        saleType,
        subTotal,
        totalDiscount,
        amountTax,
        salesDate,
      ],
    );

    const paymentInfo = paymentResult.rows[0];
    const paymentId = paymentResult.rows[0].id;
    const dueDays =
      creditDueDays || storeSettings.operations.defaultCreditDueDays || 0;
    const dueDate = dueDays
      ? new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000)
      : null;

    let status = null;
    if (amountDue == 0 && amountPaid >= amountTotal) {
      status = "paid";
    } else if (amountDue > 0 && amountPaid > 0) {
      status = "partial_paid";
    } else if (amountDue > 0 && amountPaid == 0) {
      status = "not_paid";
    }

    paymentInfo.payment_status = status;
    paymentInfo.due_date = dueDate;

    // Update cart status
    await client.query(
      `UPDATE cart SET status = 'Sold', invoice_number = $1, customer_id = $3, sale_type = $4 WHERE cart_code = $2`,
      [invoice_number, cart_code, resolvedCustomerId, saleType],
    );

    // Calculate profit/loss
    let profitLoss = 0;
    saleDetails.forEach((detail) => {
      detail.batches.forEach((batch) => {
        const profit = ((batch.price - batch.costPrice) - batch.discount) * batch.quantity;
        profitLoss += profit;
      });
    });

    await client.query(
      `INSERT INTO salesrecord (
                invoice_number, profit, loss, user_id, store_id, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6
            )`,
      [
        invoice_number,
        profitLoss > 0 ? profitLoss : 0,
        profitLoss < 0 ? Math.abs(profitLoss) : 0,
        userId,
        storeId,
        salesDate
      ],
    );

    // Handle credit sale
    if (saleType === "credit" && resolvedCustomerId) {
      await client.query(
        `INSERT INTO credit_sales (
                    cart_code, invoice_number, store_id, customer_id, user_id,
                    total_amount, amount_paid, amount_due, status, due_date, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          cart_code,
          invoice_number,
          storeId,
          resolvedCustomerId,
          userId,
          amountTotal,
          amountPaid,
          amountDue,
          amountDue > 0
            ? amountPaid > 0
              ? "partial_paid"
              : "not_paid"
            : "paid",
          dueDate,
          salesDate,
        ],
      );

      // Update customer balance
      await client.query(
        `UPDATE customers SET current_balance = current_balance + $1 WHERE id = $2`,
        [amountDue, resolvedCustomerId],
      );
    }

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "create_sale",
      description: {
        invoice_number,
        sale_type: saleType,
        total_amount: amountTotal,
        amount_paid: amountPaid,
        amount_due: amountDue,
        customer_id: resolvedCustomerId || undefined,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    const formatAmount = (amt) => {
      return new Intl.NumberFormat(lang === "sw" ? "sw-KE" : "en-US", {
        style: "currency",
        currency: storeSettings.operations.defaultCurrency || "USD",
      }).format(amt);
    };

    notifyStore({
      storeId,
      type: "new_sale",
      title: "New sale",
      message: `${t("a_sale_of", lang)} ${formatAmount(amountTotal)} ${t("was_processed_successfully", lang)}. ${t("invoice_no", lang)} ${invoice_number}.`,
      meta: { invoice_number, amount: amountTotal, sale_type: saleType, lang: lang },
      roles: ["Owner"],
    }).catch(() => { });

    res.status(201).json({
      success: true,
      message: "sale_processed_successfully",
      invoice_number,
      payment_id: paymentId,
      total_amount: amountTotal,
      sale_type: saleType,
      items: saleDetails,
      customerInfo: customerInfo,
      paymentInfo: paymentInfo,
    });
  } catch (err) {
    console.error("Error processing sale:", err);
    await client.query("ROLLBACK");

    const failedProducts = items.map((item) => ({
      id: item.product_id,
      name: productNames[item.product_id] || "Unknown Product",
      requested: item.quantity,
      available: item.quantity_left,
    }));

    res.status(400).json({
      success: false,
      error: err.message,
      failed_items: failedProducts,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// SALES ORDERS (PROFORMA)
// =====================================================
export const createSalesOrder = async (req, res) => {
  const {
    storeId,
    items,
    cart_code,
    customerId,
    customerName,
    customerPhone,
    amountTotal,
    amountPaid,
    orderType = "order",
    validDays = 30,
    notes,
  } = req.body;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderNumber = await generateOrderNumber(
      storeId,
      orderType === "proforma" ? "PRO" : "ORD",
    );
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    // Handle customer
    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId && (customerName || customerPhone)) {
      const result = await client.query(
        "SELECT id FROM customers WHERE (name = $1 OR phone = $2) AND store_id = $3",
        [customerName, customerPhone, storeId],
      );

      if (result.rows.length > 0) {
        resolvedCustomerId = result.rows[0].id;
      } else if (customerName) {
        const insertResult = await client.query(
          `INSERT INTO customers (name, phone, created_by, store_id) 
                     VALUES ($1, $2, $3, $4) RETURNING id`,
          [customerName, customerPhone, userId, storeId],
        );
        resolvedCustomerId = insertResult.rows[0].id;
      }
    }

    // Create sales order
    const orderResult = await client.query(
      `INSERT INTO sales_orders (
                order_number, cart_code, store_id, customer_id, user_id,
                total_amount, amount_paid, amount_due, status, order_type,
                valid_until, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            RETURNING *`,
      [
        orderNumber,
        cart_code,
        storeId,
        resolvedCustomerId,
        userId,
        amountTotal,
        amountPaid || 0,
        amountTotal - (amountPaid || 0),
        amountPaid >= amountTotal
          ? "paid"
          : amountPaid > 0
            ? "partial"
            : "pending",
        orderType,
        validUntil,
        notes,
      ],
    );

    // Update cart status
    await client.query(
      `UPDATE cart SET status = 'Order', customer_id = $3, sale_type = 'order'
             WHERE cart_code = $1 AND store_id = $2`,
      [cart_code, storeId, resolvedCustomerId],
    );

    // Record initial payment if any
    if (amountPaid > 0) {
      await client.query(
        `INSERT INTO sales_order_payments (
                    sales_order_id, store_id, user_id, amount, payment_method, notes
                ) VALUES ($1, $2, $3, $4, 'cash', 'Initial payment')`,
        [orderResult.rows[0].id, storeId, userId, amountPaid],
      );
    }

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "create_sales_order",
      description: {
        order_number: orderNumber,
        order_type: orderType,
        total_amount: amountTotal,
        amount_paid: amountPaid,
        customer_id: customerId || undefined,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "sales_order_created",
      order: orderResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({
      success: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/sales/orders
 * Get all sales orders
 */
export const getSalesOrders = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { status, orderType } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  try {
    let baseWhere = `WHERE so.store_id = $1`;
    const params = [storeId];

    if (status) {
      params.push(status);
      baseWhere += ` AND so.status = $${params.length}`;
    }

    if (orderType) {
      params.push(orderType);
      baseWhere += ` AND so.order_type = $${params.length}`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM sales_orders so ${baseWhere}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataParams = [...params, limit, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const result = await pool.query(
      `SELECT so.*, c.name as customer_name, c.phone as customer_phone, u.name as created_by_name
       FROM sales_orders so
       LEFT JOIN customers c ON so.customer_id = c.id
       LEFT JOIN users u ON so.user_id = u.id
       ${baseWhere}
       ORDER BY so.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams,
    );

    res.json({
      success: true,
      orders: result.rows,
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
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * GET /api/sales/orders/:id
 * Get sales order details
 */
export const getSalesOrderDetails = async (req, res) => {
  const orderId = req.params.id;
  const storeId = req.user.current_store_id;

  try {
    // Get order
    const orderResult = await pool.query(
      `SELECT so.*, c.name as customer_name, c.phone as customer_phone
             FROM sales_orders so
             LEFT JOIN customers c ON so.customer_id = c.id
             WHERE so.id = $1 AND so.store_id = $2`,
      [orderId, storeId],
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "order_not_found",
      });
    }

    // Get cart items
    const cartItems = await pool.query(
      `SELECT c.*, p.name, p.image_url
             FROM cart c
             JOIN products p ON c.product_id = p.id
             WHERE c.cart_code = $1`,
      [orderResult.rows[0].cart_code],
    );

    // Get payments
    const payments = await pool.query(
      `SELECT sop.*, u.name as received_by
             FROM sales_order_payments sop
             JOIN users u ON sop.user_id = u.id
             WHERE sop.sales_order_id = $1
             ORDER BY sop.created_at ASC`,
      [orderId],
    );

    res.json({
      success: true,
      order: orderResult.rows[0],
      items: cartItems.rows,
      payments: payments.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * POST /api/sales/orders/:id/payment
 * Record payment for sales order
 */
export const recordSalesOrderPayment = async (req, res) => {
  const orderId = req.params.id;
  const { amount, paymentMethod = "cash", referenceNumber, notes } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get order
    const orderResult = await client.query(
      `SELECT * FROM sales_orders WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [orderId, storeId],
    );

    if (orderResult.rows.length === 0) {
      throw new Error(t("order_not_found", lang));
    }

    const order = orderResult.rows[0];

    if (order.status === "completed" || order.status === "cancelled") {
      throw new Error(t("order_cannot_receive_payment", lang));
    }

    // Record payment
    await client.query(
      `INSERT INTO sales_order_payments (
                sales_order_id, store_id, user_id, amount, payment_method, reference_number, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId, storeId, userId, amount, paymentMethod, referenceNumber, notes],
    );

    // Update order
    const newAmountPaid = parseFloat(order.amount_paid) + parseFloat(amount);
    const newAmountDue = parseFloat(order.total_amount) - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? "paid" : "partial";

    await client.query(
      `UPDATE sales_orders SET amount_paid = $1, amount_due = $2, status = $3, updated_at = NOW()
             WHERE id = $4`,
      [newAmountPaid, Math.max(0, newAmountDue), newStatus, orderId],
    );

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "record_sales_order_payment",
      description: {
        amount,
        payment_method: paymentMethod,
        amount_due: Math.max(0, newAmountDue),
        status: newStatus,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    res.json({
      success: true,
      message: "payment_recorded",
      new_amount_paid: newAmountPaid,
      new_amount_due: Math.max(0, newAmountDue),
      status: newStatus,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({
      success: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
};

/**
 * POST /api/sales/orders/:id/complete
 * Complete a fully paid sales order
 */
export const completeSalesOrder = async (req, res) => {
  const orderId = req.params.id;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get order
    const orderResult = await client.query(
      `SELECT * FROM sales_orders WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [orderId, storeId],
    );

    if (orderResult.rows.length === 0) {
      throw new Error(t("order_not_found", lang));
    }

    const order = orderResult.rows[0];

    if (order.status !== "paid") {
      throw new Error(t("order_not_fully_paid", lang));
    }

    // Get cart items
    const cartItems = await client.query(
      `SELECT c.*, p.name FROM cart c
             JOIN products p ON c.product_id = p.id
             WHERE c.cart_code = $1`,
      [order.cart_code],
    );

    // Generate invoice and process as sale
    const invoice_number = await generateInvoiceNumber(storeId);

    // Process inventory
    for (const item of cartItems.rows) {
      let remainingQty = item.quantity;
      const productId = item.product_id;

      const activeBatches = await client.query(
        `SELECT 
                    ib.id, ib.selling_price, ib.cost_price,
                    COALESCE(SUM(
                        CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
                    ), 0) AS available_stock
                 FROM inventory_batches ib
                 LEFT JOIN inventory_movements im ON ib.id = im.batch_id
                 WHERE ib.product_id = $1 
                    AND ib.store_id = $2
                    AND ib.status = 'in_use'
                 GROUP BY ib.id
                 HAVING COALESCE(SUM(
                     CASE WHEN im.type = 'IN' THEN im.quantity ELSE -im.quantity END
                 ), 0) > 0
                 ORDER BY COALESCE(ib.expiry_date, 'infinity') ASC, ib.created_at ASC`,
        [productId, storeId],
      );

      for (const batch of activeBatches.rows) {
        if (remainingQty <= 0) break;

        const available = Math.min(batch.available_stock, remainingQty);
        if (available <= 0) continue;

        await client.query(
          `INSERT INTO inventory_movements (
                        store_id, product_id, batch_id, cart_id, quantity,
                        type, note, created_by, created_at, transaction_date
                    ) VALUES ($1, $2, $3, $4, $5, 'OUT', $6, $7, NOW(), NOW())`,
          [
            storeId,
            productId,
            batch.id,
            item.id,
            available,
            `Sold in invoice ${invoice_number}`,
            userId,
          ],
        );

        remainingQty -= available;

        if (batch.available_stock - available <= 0) {
          await client.query(
            `UPDATE inventory_batches SET status = 'sold_out' WHERE id = $1`,
            [batch.id],
          );
        }
      }

      if (remainingQty > 0) {
        throw new Error(`${item.name} - ${t("insufficient_stock", lang)}`);
      }
    }

    // Update cart status
    await client.query(
      `UPDATE cart SET status = 'Sold', invoice_number = $1 WHERE cart_code = $2`,
      [invoice_number, order.cart_code],
    );

    // Update order status
    await client.query(
      `UPDATE sales_orders SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [orderId],
    );

    // Record payment
    await client.query(
      `INSERT INTO payments (
                invoice_number, cart_code, store_id, user_id, total_amount, amount_paid,
                amount_change, amount_due, payment_method, sale_type, created_at
            ) VALUES ($1, $2, $3, $4, $5, $5, 0, 0, 'cash', 'order', NOW())`,
      [invoice_number, order.cart_code, storeId, userId, order.total_amount],
    );

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "complete_sales_order",
      description: {
        invoice_number,
        total_amount: order.total_amount,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    res.json({
      success: true,
      message: "order_completed",
      invoice_number,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({
      success: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// CREDIT SALES
// =====================================================

/**
 * GET /api/sales/credit
 * Get all credit sales
 */
export const getCreditSales = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { status, customerId, startDate, endDate, page = 1, limit = 25, search = "" } = req.query;

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(500, Math.max(1, Number(limit)));
  const offset = (pageNum - 1) * limitNum;

  // Overdue is computed dynamically — never stored as 'overdue' going forward.
  // We also normalise legacy 'pending' → 'not_paid' and 'partial' → 'partial_paid'.
  const effectiveStatusExpr = `
    CASE
      WHEN cs.status NOT IN ('paid', 'cancelled')
           AND cs.due_date IS NOT NULL
           AND cs.due_date < NOW()
      THEN 'overdue'
      WHEN cs.status = 'pending'  THEN 'not_paid'
      WHEN cs.status = 'partial'  THEN 'partial_paid'
      WHEN cs.status = 'overdue'  THEN 'not_paid'
      ELSE cs.status
    END`;

  try {
    // Build inner query that computes effective_status
    const innerParams = [storeId];
    let innerQuery = `
      SELECT
        cs.id, cs.cart_code, cs.invoice_number, cs.store_id, cs.customer_id, cs.user_id,
        cs.total_amount, cs.amount_paid, cs.amount_due,
        cs.due_date, cs.last_notified_at, cs.created_at, cs.updated_at, cs.paid_at,
        (${effectiveStatusExpr}) AS status,
        c.name  AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        c.credit_limit,
        c.current_balance,
        u.name  AS created_by_name
      FROM credit_sales cs
      LEFT JOIN customers c ON cs.customer_id = c.id
      LEFT JOIN users u    ON cs.user_id    = u.id
      WHERE cs.store_id = $1 AND cs.status <> 'cancelled'
        AND NOT (
          cs.amount_due <= 0 AND EXISTS (
            SELECT 1 FROM sales_returns sr
            WHERE sr.original_invoice_number = cs.invoice_number
              AND sr.store_id = cs.store_id
              AND sr.status IN ('completed', 'approved')
          )
        )`;

    if (customerId) {
      innerParams.push(customerId);
      innerQuery += ` AND cs.customer_id = $${innerParams.length}`;
    }
    if (startDate) {
      innerParams.push(startDate);
      innerQuery += ` AND DATE(cs.created_at) >= $${innerParams.length}::date`;
    }
    if (endDate) {
      innerParams.push(endDate);
      innerQuery += ` AND DATE(cs.created_at) <= $${innerParams.length}::date`;
    }

    // Wrap in outer query to filter by computed status + search
    const outerParams = [...innerParams];
    let outerWhere = "";

    const conditions = [];
    if (status) {
      outerParams.push(status);
      conditions.push(`computed.status = $${outerParams.length}`);
    }
    if (search) {
      const like = `%${search}%`;
      outerParams.push(like);
      conditions.push(`(computed.invoice_number ILIKE $${outerParams.length} OR computed.customer_name ILIKE $${outerParams.length})`);
    }
    if (conditions.length > 0) outerWhere = ` WHERE ${conditions.join(" AND ")}`;

    // Summary counts (no pagination)
    const summaryQuery = `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(amount_due) FILTER (WHERE status NOT IN ('paid','cancelled')), 0) AS total_outstanding,
        COALESCE(SUM(amount_due) FILTER (WHERE status = 'overdue'), 0) AS total_overdue,
        COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
        COALESCE(SUM(amount_paid) FILTER (WHERE DATE(updated_at) = CURRENT_DATE), 0) AS collected_today
      FROM (${innerQuery}) AS computed${outerWhere}`;

    const summaryResult = await pool.query(summaryQuery, outerParams);
    const s = summaryResult.rows[0];

    // Paginated data
    const dataQuery = `SELECT * FROM (${innerQuery}) AS computed${outerWhere} ORDER BY computed.created_at DESC LIMIT $${outerParams.length + 1} OFFSET $${outerParams.length + 2}`;
    const dataResult = await pool.query(dataQuery, [...outerParams, limitNum, offset]);

    res.json({
      success: true,
      credit_sales: dataResult.rows,
      summary: {
        total: Number(s.total),
        totalOutstanding: Number(s.total_outstanding),
        totalOverdue: Number(s.total_overdue),
        overdueCount: Number(s.overdue_count),
        collectedToday: Number(s.collected_today),
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(s.total),
        totalPages: Math.ceil(Number(s.total) / limitNum),
      },
    });
  } catch (err) {
    console.error(err);
    respondWithError(req, res, 500, "server_error");
  }
};

/**
 * POST /api/sales/credit/mark-overdue
 * Mark all pending/partial credit sales whose due_date has passed as overdue
 */
export const markOverdueCreditSales = async (req, res) => {
  // Overdue status is now computed dynamically on fetch — no DB update needed.
  res.json({ success: true, updated: 0 });
};

/**
 * POST /api/sales/credit/:id/notify
 * Record that a reminder notification was sent to the customer for a credit sale
 */
export const notifyCreditSale = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const { message } = req.body;
  const lang = getLang(req);

  try {
    const saleResult = await pool.query(
      `SELECT cs.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
       FROM credit_sales cs
       LEFT JOIN customers c ON cs.customer_id = c.id
       WHERE cs.id = $1 AND cs.store_id = $2`,
      [id, storeId],
    );

    if (saleResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: t("credit_sale_not_found", lang) });
    }

    const sale = saleResult.rows[0];
    const smsSent = smsService.send(sale.customer_phone, message);
    // Update last_notified_at timestamp
    await pool.query(
      `UPDATE credit_sales SET last_notified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    );

    await logActivity(pool, {
      userId: userId,
      storeId: storeId,
      action: "notify_credit_sale",
      description: {
        invoice_number: sale.invoice_number,
        customer_id: sale.customer_id,
        amount_due: sale.amount_due,
      },
      ip: req.ip,
    });
    
    // Emit in-app socket notification to store users
    try {
      const io = getIO();
      io.to(`store_${storeId}`).emit("debitReminderSent", {
        credit_sale_id: id,
        customer_name: sale.customer_name,
        amount_due: sale.amount_due,
        invoice_number: sale.invoice_number,
        notified_by: userId,
        message: t("debit_reminder_sent", lang),
      });
    } catch (_) {
      /* socket unavailable – non-fatal */
    }

    res.json({
      success: true,
      message: t("notification_sent_successfully", lang),
      last_notified_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/sales/credit/:id
 * Get credit sale details
 */
export const getCreditSaleDetails = async (req, res) => {
  const creditSaleId = req.params.id;
  const storeId = req.user.current_store_id;

  try {
    // Get credit sale
    const saleResult = await pool.query(
      `SELECT cs.id, cs.cart_code, cs.invoice_number, cs.store_id, cs.customer_id, cs.user_id,
              cs.total_amount, cs.amount_paid, cs.amount_due,
              cs.due_date, cs.last_notified_at, cs.created_at, cs.updated_at, cs.paid_at,
              CASE
                WHEN cs.status NOT IN ('paid', 'cancelled')
                     AND cs.due_date IS NOT NULL
                     AND cs.due_date < NOW()
                THEN 'overdue'
                WHEN cs.status = 'pending'  THEN 'not_paid'
                WHEN cs.status = 'partial'  THEN 'partial_paid'
                WHEN cs.status = 'overdue'  THEN 'not_paid'
                ELSE cs.status
              END AS status,
              c.name as customer_name, c.phone as customer_phone,
              u.name as created_by_name
             FROM credit_sales cs
             LEFT JOIN customers c ON cs.customer_id = c.id
             LEFT JOIN users u ON u.id = cs.user_id
             WHERE cs.id = $1 AND cs.store_id = $2`,
      [creditSaleId, storeId],
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "credit_sale_not_found",
      });
    }

    // Get cart items
    const cartItems = await pool.query(
      `SELECT c.*, p.name, p.image_url
             FROM cart c
             JOIN products p ON c.product_id = p.id
             WHERE c.cart_code = $1`,
      [saleResult.rows[0].cart_code],
    );

    // Get payments
    const payments = await pool.query(
      `SELECT cp.*, u.name as received_by
             FROM credit_payments cp
             JOIN users u ON cp.user_id = u.id
             WHERE cp.credit_sale_id = $1
             ORDER BY cp.created_at ASC`,
      [creditSaleId],
    );

    res.json({
      success: true,
      credit_sale: saleResult.rows[0],
      items: cartItems.rows,
      payments: payments.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * POST /api/sales/credit/:id/payment
 * Record payment for credit sale
 */
export const recordCreditPayment = async (req, res) => {
  const creditSaleId = req.params.id;
  const { amount, paymentMethod = "cash", referenceNumber, notes } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get credit sale
    const saleResult = await client.query(
      `SELECT * FROM credit_sales WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [creditSaleId, storeId],
    );

    if (saleResult.rows.length === 0) {
      throw new Error(t("credit_sale_not_found", lang));
    }

    const sale = saleResult.rows[0];

    if (sale.status === "paid" || sale.status === "cancelled") {
      throw new Error(t("credit_sale_cannot_receive_payment", lang));
    }

    // The amount must be a positive number and may not be more than what is still owed — otherwise the debt would
    // be closed by an overpayment and the customer's balance pushed below what they really owe.
    const payAmount = Number(amount);
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      throw new Error("amount_required");
    }
    if (payAmount > Number(sale.amount_due) + 0.005) {
      throw new Error("payment_exceeds_due");
    }

    // Record payment
    await client.query(
      `INSERT INTO credit_payments (
                credit_sale_id, store_id, user_id, amount, payment_method, reference_number, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        creditSaleId,
        storeId,
        userId,
        amount,
        paymentMethod,
        referenceNumber,
        notes,
      ],
    );

    // Update credit sale
    const newAmountPaid = parseFloat(sale.amount_paid) + parseFloat(amount);
    const newAmountDue = parseFloat(sale.total_amount) - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? "paid" : "partial_paid";

    await client.query(
      `UPDATE credit_sales SET amount_paid = $1, amount_due = $2, status = $3, 
             updated_at = NOW() ${newStatus === "paid" ? ", paid_at = NOW()" : ""}
             WHERE id = $4`,
      [newAmountPaid, Math.max(0, newAmountDue), newStatus, creditSaleId],
    );

    // Update customer balance
    await client.query(
      `UPDATE customers SET current_balance = current_balance - $1 WHERE id = $2`,
      [amount, sale.customer_id],
    );

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "record_credit_payment",
      description: {
        invoice_number: sale.invoice_number,
        customer_id: sale.customer_id,
        amount,
        status: newStatus,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    res.json({
      success: true,
      message: "payment_recorded",
      new_amount_paid: newAmountPaid,
      new_amount_due: Math.max(0, newAmountDue),
      status: newStatus,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({
      success: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// SALES HISTORY
// =====================================================

/**
 * GET /api/sales/history
 * Get sales history with filters
 */
export const getSalesHistory = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { saleType, startDate, endDate } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const search = req.query.search?.trim() || '';

  try {
    let baseWhere = `WHERE p.store_id = $1 AND c.status = 'Sold'`;
    const params = [storeId];

    if (saleType && saleType !== "all") {
      params.push(saleType);
      baseWhere += ` AND p.sale_type = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      baseWhere += ` AND DATE(p.sales_date) >= $${params.length}::date`;
    }

    if (endDate) {
      params.push(endDate);
      baseWhere += ` AND DATE(p.sales_date) <= $${params.length}::date`;
    }

    if (search) {
      params.push(`%${search}%`);
      baseWhere += ` AND (p.invoice_number ILIKE $${params.length} OR cust.name ILIKE $${params.length} OR u.name ILIKE $${params.length})`;
    }

    // Total count (include joins so search filters on cust/user work)
    const countRes = await pool.query(
      `SELECT COUNT(DISTINCT p.invoice_number)
       FROM payments p
       LEFT JOIN cart c ON p.cart_code = c.cart_code
       LEFT JOIN customers cust ON c.customer_id = cust.id
       LEFT JOIN users u ON p.user_id = u.id
       ${baseWhere}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count, 10);

    // Paginated results
    const dataParams = [...params, limit, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const query = `
      SELECT DISTINCT ON (p.invoice_number) 
          p.*, c.status as cart_status, c.sale_type,
          cust.name as customer_name, cust.phone as customer_phone,
          u.name as cashier_name,
          EXISTS (
            SELECT 1 FROM sales_returns sr
            WHERE sr.original_invoice_number = p.invoice_number
              AND sr.store_id = p.store_id
              AND sr.status IN ('completed', 'approved')
          ) AS was_returned
      FROM payments p
      LEFT JOIN cart c ON p.cart_code = c.cart_code
      LEFT JOIN customers cust ON c.customer_id = cust.id
      LEFT JOIN users u ON p.user_id = u.id
      ${baseWhere}
      ORDER BY p.invoice_number DESC, p.sales_date DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await pool.query(query, dataParams);

    res.json({
      success: true,
      sales: result.rows,
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
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * GET /api/sales/history/:invoiceNumber
 * Get sale details by invoice number
 */
export const getSaleDetails = async (req, res) => {
  const invoiceNumber = req.params.invoiceNumber;
  const storeId = req.user.current_store_id;

  try {
    // Get payment info
    const paymentResult = await pool.query(
      `SELECT p.*, u.name as cashier_name
             FROM payments p
             JOIN users u ON p.user_id = u.id
             WHERE p.invoice_number = $1 AND p.store_id = $2`,
      [invoiceNumber, storeId],
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "sale_not_found",
      });
    }

    // Get cart items
    const cartItems = await pool.query(
      `SELECT c.*, p.name, p.image_url, cust.name as customer_name, cust.phone as customer_phone
             FROM cart c
             JOIN products p ON c.product_id = p.id
             LEFT JOIN customers cust ON c.customer_id = cust.id
             WHERE c.invoice_number = $1 AND c.store_id = $2`,
      [invoiceNumber, storeId],
    );

    // Get sales record
    const salesRecord = await pool.query(
      `SELECT * FROM salesrecord WHERE invoice_number = $1 AND store_id = $2`,
      [invoiceNumber, storeId],
    );

    const returns = await pool.query(
      `SELECT sr.return_number, sr.status, sr.total_amount, sr.refund_amount, sr.refund_method,
              sr.reason, sr.created_at, sr.completed_at, u.name AS returned_by
       FROM sales_returns sr
       LEFT JOIN users u ON u.id = sr.user_id
       WHERE sr.original_invoice_number = $1 AND sr.store_id = $2
       ORDER BY sr.created_at`,
      [invoiceNumber, storeId],
    );

    res.json({
      success: true,
      payment: paymentResult.rows[0],
      items: cartItems.rows,
      salesRecord: salesRecord.rows[0] || null,
      returns: returns.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =====================================================
// SALES RETURNS
// =====================================================

/**
 * POST /api/sales/returns
 * Create a sales return
 */
export const createSalesReturn = async (req, res) => {
  const {
    invoiceNumber,
    items,
    reason,
    notes,
    refundMethod = "cash",
  } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get original sale
    const saleResult = await client.query(
      `SELECT c.*, p.invoice_number, p.total_amount, p.payment_method
             FROM cart c
             JOIN payments p ON c.cart_code = p.cart_code
             WHERE p.invoice_number = $1 AND c.store_id = $2 AND c.status = 'Sold'
             LIMIT 1`,
      [invoiceNumber, storeId],
    );

    if (saleResult.rows.length === 0) {
      throw new Error(t("sale_not_found", lang));
    }

    const originalSale = saleResult.rows[0];

    // A return may only cover goods that were on THIS invoice, and never more than is still sold: the invoice's quantity
    // already drops when a return is approved, so only returns still WAITING for approval are subtracted.
    const asked = new Map();
    for (const item of items || []) {
      const q = Number(item.quantity);
      if (!Number.isFinite(q) || q <= 0) throw new Error("quantity_must_be_positive");
      asked.set(item.product_id, (asked.get(item.product_id) || 0) + q);
    }
    for (const [productId, q] of asked) {
      const sold = await client.query(
        `SELECT COALESCE(SUM(quantity), 0) AS qty FROM cart WHERE cart_code = $1 AND store_id = $2 AND product_id = $3 AND status = 'Sold'`,
        [originalSale.cart_code, storeId, productId],
      );
      if (Number(sold.rows[0].qty) <= 0) throw new Error("product_not_in_invoice");
      const already = await client.query(
        `SELECT COALESCE(SUM(i.quantity), 0) AS qty FROM sales_return_items i JOIN sales_returns r ON r.id = i.sales_return_id
         WHERE r.original_cart_code = $1 AND r.store_id = $2 AND i.product_id = $3 AND r.status = 'pending'`,
        [originalSale.cart_code, storeId, productId],
      );
      if (q > Number(sold.rows[0].qty) - Number(already.rows[0].qty) + 0.0001) throw new Error("return_quantity_exceeds_sold");
    }

    const returnNumber = await generateReturnNumber(storeId);

    // Calculate total return amount
    let totalReturnAmount = 0;
    for (const item of items) {
      totalReturnAmount += item.quantity * item.price;
    }

    // Create return header
    const returnResult = await client.query(
      `INSERT INTO sales_returns (
                return_number, original_invoice_number, original_cart_code,
                store_id, customer_id, user_id, total_amount, refund_amount,
                refund_method, status, reason, notes
            ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::numeric, $8::numeric, $9, 'pending', $10, $11)
            RETURNING *`,
      [
        returnNumber,
        invoiceNumber,
        originalSale.cart_code,
        storeId,
        originalSale.customer_id,
        userId,
        totalReturnAmount,
        totalReturnAmount,
        refundMethod,
        reason,
        notes,
      ],
    );

    const salesReturnId = returnResult.rows[0].id;

    // Create return items
    for (const item of items) {
      await client.query(
        `INSERT INTO sales_return_items (
                    sales_return_id, product_id, batch_id, quantity, price,
                    return_reason, condition, restock
                ) VALUES ($1, $2, $3::uuid, $4::numeric, $5::numeric, $6, $7, $8)`,
        [
          salesReturnId,
          item.product_id,
          item.batch_id || null,
          item.quantity,
          item.price,
          item.reason || reason,
          item.condition || "good",
          item.restock !== false,
        ],
      );
    }

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "create_sales_return",
      description: {
        invoice_number: invoiceNumber,
        items: items.length,
        reason: reason || undefined,
        refund_method: refundMethod,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    notifyStore({
      storeId,
      type: "sales_return",
      title: "Sales return created",
      message: "A new sales return is awaiting review",
      meta: { return_number: returnNumber, invoice_number: invoiceNumber, amount: totalReturnAmount },
    }).catch(() => { });

    res.status(201).json({
      success: true,
      message: "sales_return_created",
      return: returnResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({
      success: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/sales/returns
 * Get all sales returns
 */
export const getSalesReturns = async (req, res) => {
  const storeId = req.user.current_store_id;
  const { status, startDate, endDate, page = 1, limit = 25, search = "" } = req.query;
  const lang = getLang(req);

  try {
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(500, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    let baseWhere = `WHERE sr.store_id = $1`;
    const baseParams = [storeId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      baseWhere += ` AND sr.status = $${paramCount}`;
      baseParams.push(status);
    }

    if (startDate) {
      paramCount++;
      baseWhere += ` AND DATE(sr.created_at) >= $${paramCount}::date`;
      baseParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      baseWhere += ` AND DATE(sr.created_at) <= $${paramCount}::date`;
      baseParams.push(endDate);
    }

    if (search) {
      const like = `%${search}%`;
      paramCount++;
      baseWhere += ` AND (sr.return_number ILIKE $${paramCount} OR sr.original_invoice_number ILIKE $${paramCount} OR c.name ILIKE $${paramCount})`;
      baseParams.push(like);
    }

    // Summary (all matching rows)
    const summaryResult = await pool.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE sr.status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE sr.status IN ('approved','completed')) AS approved,
        COALESCE(SUM(sr.total_amount) FILTER (WHERE sr.status IN ('approved','completed')), 0) AS total_refunded
      FROM sales_returns sr
      LEFT JOIN customers c ON sr.customer_id = c.id
      ${baseWhere}`,
      baseParams,
    );

    const summary = summaryResult.rows[0];

    // Paginated data
    const dataResult = await pool.query(
      `SELECT sr.*, c.name as customer_name, c.phone as customer_phone, u.name as created_by_name
      FROM sales_returns sr
      LEFT JOIN customers c ON sr.customer_id = c.id
      LEFT JOIN users u ON sr.user_id = u.id
      ${baseWhere}
      ORDER BY sr.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...baseParams, limitNum, offset],
    );

    res.json({
      success: true,
      returns: dataResult.rows,
      summary: {
        total: Number(summary.total),
        pending: Number(summary.pending),
        approved: Number(summary.approved),
        totalRefunded: Number(summary.total_refunded),
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(summary.total),
        totalPages: Math.ceil(Number(summary.total) / limitNum),
      },
    });
  } catch (err) {
    console.error(err);
    respondWithError(req, res, 500, "server_error");
  }
};

/**
 * GET /api/sales/returns/:id
 * Get sales return details
 */
export const getSalesReturnDetails = async (req, res) => {
  const returnId = req.params.id;
  const storeId = req.user.current_store_id;

  try {
    // Get return
    const returnResult = await pool.query(
      `SELECT sr.*, c.name as customer_name, c.phone as customer_phone, u.name as created_by_name
             FROM sales_returns sr
             LEFT JOIN customers c ON sr.customer_id = c.id
             LEFT JOIN users u ON u.id = sr.user_id
             WHERE sr.id = $1 AND sr.store_id = $2`,
      [returnId, storeId],
    );

    if (returnResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "return_not_found",
      });
    }

    // Get return items
    const items = await pool.query(
      `SELECT sri.*, p.name as product_name, p.image_url
             FROM sales_return_items sri
             JOIN products p ON sri.product_id = p.id
             WHERE sri.sales_return_id = $1`,
      [returnId],
    );

    res.json({
      success: true,
      return: returnResult.rows[0],
      items: items.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * POST /api/sales/returns/:id/approve
 * Approve and complete a sales return
 */
export const approveSalesReturn = async (req, res) => {
  const returnId = req.params.id;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();

  const toNumber = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  try {
    await client.query("BEGIN");

    // ─────────────────────────────────────────────────────────────
    // 1. Get and lock the sales return
    // Prevent the same return from being approved twice
    // ─────────────────────────────────────────────────────────────
    const returnResult = await client.query(
      `SELECT *
       FROM sales_returns
       WHERE id = $1
         AND store_id = $2
       FOR UPDATE`,
      [returnId, storeId],
    );

    if (returnResult.rows.length === 0) {
      throw new Error(t("return_not_found", lang));
    }

    const salesReturn = returnResult.rows[0];

    if (salesReturn.status !== "pending") {
      throw new Error(t("return_already_processed", lang));
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Get return items
    //
    // original_discount_mode comes from the original cart item.
    // original_cost_price comes from the batch originally used
    // during the sale.
    // ─────────────────────────────────────────────────────────────
    const itemsResult = await client.query(
      `SELECT
         sri.*,
         c.discount_mode AS original_discount_mode,
         ib.cost_price AS original_cost_price
       FROM sales_return_items sri
       LEFT JOIN cart c
         ON c.store_id = $2::uuid
        AND c.invoice_number = $3
        AND c.product_id = sri.product_id
        AND c.status = 'Sold'
       LEFT JOIN inventory_batches ib
         ON ib.id = sri.batch_id
        AND ib.store_id = $2::uuid
        AND ib.product_id = sri.product_id
       WHERE sri.sales_return_id = $1`,
      [
        returnId,
        storeId,
        salesReturn.original_invoice_number,
      ],
    );

    if (itemsResult.rows.length === 0) {
      throw new Error("No return items were found for this sales return.");
    }

    let returnedProfit = 0;

    // ─────────────────────────────────────────────────────────────
    // 3. Process every returned item
    // ─────────────────────────────────────────────────────────────
    for (const item of itemsResult.rows) {
      const quantity = toNumber(item.quantity);
      const price = toNumber(item.price);
      const discount = toNumber(item.discount);
      const costPrice = toNumber(item.original_cost_price);

      if (quantity <= 0) {
        throw new Error(
          `Invalid return quantity for product ${item.product_id}.`,
        );
      }

      // ───────────────────────────────────────────────────────────
      // 3A. Restock the item when required
      //
      // The returned item is put into the latest active batch,
      // because the original batch may already be sold out.
      // ───────────────────────────────────────────────────────────
      if (item.restock) {
        const activeBatchResult = await client.query(
          `SELECT id
           FROM inventory_batches
           WHERE product_id = $1
             AND store_id = $2
             AND status = 'in_use'
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [item.product_id, storeId],
        );

        if (activeBatchResult.rows.length === 0) {
          throw new Error(
            `No active inventory batch was found for product ${item.product_id}.`,
          );
        }

        const activeBatchId = activeBatchResult.rows[0].id;

        await client.query(
          `INSERT INTO inventory_movements (
             store_id,
             product_id,
             batch_id,
             quantity,
             type,
             note,
             created_by,
             transaction_date
           )
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric, 'IN', $5::text, $6::uuid, NOW())`,
          [
            storeId,
            item.product_id,
            activeBatchId,
            quantity,
            `Returned from ${salesReturn.return_number}`,
            userId,
          ],
        );
      }

      // ───────────────────────────────────────────────────────────
      // 3B. Reduce quantity from the original cart item
      // ───────────────────────────────────────────────────────────
      const cartUpdateResult = await client.query(
        `UPDATE cart
         SET quantity = quantity - $1::numeric
         WHERE store_id = $2::uuid
           AND invoice_number = $3
           AND product_id = $4::uuid
           AND status = 'Sold'
           AND quantity >= $1::numeric
         RETURNING id, quantity`,
        [
          quantity,
          storeId,
          salesReturn.original_invoice_number,
          item.product_id,
        ],
      );

      if (cartUpdateResult.rows.length === 0) {
        throw new Error(
          `The returned quantity for product ${item.product_id} is greater than the remaining sold quantity.`,
        );
      }

      // ───────────────────────────────────────────────────────────
      // 3C. Calculate the profit that must be reversed
      //
      // Percentage:
      // price * discount / 100
      //
      // Fixed:
      // discount amount per unit
      // ───────────────────────────────────────────────────────────
      const discountMode =
        item.original_discount_mode || "fixed";

      const unitDiscount =
        discountMode === "percentage"
          ? (price * discount) / 100
          : discount;

      const unitNetSellingPrice = price - unitDiscount;
      const unitProfit = unitNetSellingPrice - costPrice;

      returnedProfit += unitProfit * quantity;
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Reverse returned profit
    // ─────────────────────────────────────────────────────────────
    if (Math.abs(returnedProfit) > 0.000001) {
      await client.query(
        `UPDATE salesrecord
         SET profit = profit - $1
         WHERE invoice_number = $2
           AND store_id = $3`,
        [
          returnedProfit,
          salesReturn.original_invoice_number,
          storeId,
        ],
      );
    }

    // ─────────────────────────────────────────────────────────────
    // 5. Recalculate invoice totals using remaining cart quantities
    // ─────────────────────────────────────────────────────────────
    const recalcResult = await client.query(
      `SELECT
         COALESCE(SUM(quantity * price), 0) AS new_subtotal,

         COALESCE(
           SUM(
             CASE
               WHEN discount_mode = 'percentage'
                 THEN quantity * price * discount / 100
               ELSE quantity * discount
             END
           ),
           0
         ) AS new_discount

       FROM cart
       WHERE store_id = $1
         AND invoice_number = $2
         AND status = 'Sold'`,
      [
        storeId,
        salesReturn.original_invoice_number,
      ],
    );

    const newSubtotal = toNumber(
      recalcResult.rows[0].new_subtotal,
    );

    const newDiscount = toNumber(
      recalcResult.rows[0].new_discount,
    );

    // ─────────────────────────────────────────────────────────────
    // 6. Get and lock the original payment
    //
    // Calculate the VAT rate from the previous invoice values so
    // that the same VAT rate is maintained after the return.
    // ─────────────────────────────────────────────────────────────
    const originalPaymentResult = await client.query(
      `SELECT
         subtotal,
         total_discount,
         total_vat,
         total_amount,
         amount_paid,
         amount_due,
         sale_type
       FROM payments
       WHERE invoice_number = $1
         AND store_id = $2
       FOR UPDATE`,
      [
        salesReturn.original_invoice_number,
        storeId,
      ],
    );

    let vatRate = 0;

    if (originalPaymentResult.rows.length > 0) {
      const originalPayment =
        originalPaymentResult.rows[0];

      const originalSubtotal = toNumber(
        originalPayment.subtotal,
      );

      const originalDiscount = toNumber(
        originalPayment.total_discount,
      );

      const originalVat = toNumber(
        originalPayment.total_vat,
      );

      const originalAfterDiscount =
        originalSubtotal - originalDiscount;

      if (originalAfterDiscount > 0) {
        vatRate =
          originalVat / originalAfterDiscount;
      }
    }

    // Avoid a negative taxable amount when discounts somehow exceed
    // the subtotal.
    const newAfterDiscount = Math.max(
      0,
      newSubtotal - newDiscount,
    );

    const newVat = newAfterDiscount * vatRate;
    const newTotal = newAfterDiscount + newVat;
    const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

    // A credit invoice keeps its own debit. The returned goods come off that
    // debit first. Money the customer already paid stays, and only what is
    // left above the new invoice total is handed back.
    const originalPay = originalPaymentResult.rows[0] || {};
    let nextPaid = round2(Math.min(toNumber(originalPay.amount_paid), newTotal));
    let nextDue = 0;

    const creditResult = await client.query(
      `SELECT * FROM credit_sales
       WHERE invoice_number = $1 AND store_id = $2 AND status <> 'cancelled'
       FOR UPDATE`,
      [salesReturn.original_invoice_number, storeId],
    );

    if (creditResult.rows.length > 0) {
      const credit = creditResult.rows[0];
      const alreadyPaid = toNumber(credit.amount_paid);
      const appliedPaid = round2(Math.min(alreadyPaid, newTotal));
      const newDue = round2(Math.max(0, newTotal - appliedPaid));
      const cashBack = round2(Math.max(0, alreadyPaid - appliedPaid));
      const dueReduction = round2(Math.max(0, toNumber(credit.amount_due) - newDue));
      const creditNote = String(salesReturn.refund_method || '').toLowerCase() === 'credit_note';
      const balanceDrop = round2(dueReduction + (creditNote ? cashBack : 0));
      const stillOwed = newDue > 0.005;
      const pastDue = credit.due_date && new Date(credit.due_date).getTime() < Date.now();
      let creditStatus = 'not_paid';
      if (newTotal <= 0.005) creditStatus = 'cancelled';
      else if (!stillOwed) creditStatus = 'paid';
      else if (credit.status === 'overdue' || pastDue) creditStatus = 'overdue';
      else if (appliedPaid > 0.005) creditStatus = 'partial_paid';

      await client.query(
        `UPDATE credit_sales
         SET total_amount = $1, amount_paid = $2, amount_due = $3, status = $4::varchar,
             paid_at = CASE WHEN $4::varchar = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END,
             notes = CONCAT_WS(E'\n', NULLIF(notes, ''), $5::text),
             updated_at = NOW()
         WHERE id = $6`,
        [round2(newTotal), appliedPaid, newDue, creditStatus, `Return ${salesReturn.return_number}`, credit.id],
      );

      if (balanceDrop > 0.005 && credit.customer_id) {
        await client.query(
          `UPDATE customers
           SET current_balance = ${creditNote ? 'current_balance - $1' : 'GREATEST(current_balance - $1, 0)'}
           WHERE id = $2`,
          [balanceDrop, credit.customer_id],
        );
      }
      nextPaid = appliedPaid;
      nextDue = newDue;
    } else if (String(originalPay.sale_type) === 'credit') {
      nextDue = round2(Math.max(0, newTotal - nextPaid));
    }

    // ─────────────────────────────────────────────────────────────
    // 7. Update payment totals
    // ─────────────────────────────────────────────────────────────
    await client.query(
      `UPDATE payments
       SET
         subtotal = $1::numeric,
         total_discount = $2::numeric,
         total_vat = $3::numeric,
         total_amount = $4::numeric,
         amount_paid = $5::numeric,
         amount_due = $6::numeric
       WHERE invoice_number = $7
         AND store_id = $8::uuid`,
      [
        newSubtotal,
        newDiscount,
        newVat,
        newTotal,
        nextPaid,
        nextDue,
        salesReturn.original_invoice_number,
        storeId,
      ],
    );

    // ─────────────────────────────────────────────────────────────
    // 8. Mark the return as completed
    // ─────────────────────────────────────────────────────────────
    await client.query(
      `UPDATE sales_returns
       SET
         status = 'completed',
         completed_at = NOW()
       WHERE id = $1
         AND store_id = $2`,
      [returnId, storeId],
    );

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "approve_sales_return",
      description: {
        invoice_number: salesReturn.original_invoice_number,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    emitToStore(storeId, 'sales_return', { return_number: salesReturn.return_number });

    notifyStore({
      storeId,
      type: "sales_return",
      title: "Sales return approved",
      message: "A sales return was approved and completed",
      meta: { return_number: salesReturn.return_number, refund_amount: salesReturn.refund_amount },
    }).catch(() => { });

    return res.json({
      success: true,
      message: "return_approved",
      refund_amount: salesReturn.refund_amount,
    });
  } catch (err) {
    await client.query("ROLLBACK");

    console.error("Approve sales return error:", err);

    return res.status(400).json({
      success: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
};
/**
 * POST /api/sales/returns/:id/reject
 * Reject a sales return
 */
export const rejectSalesReturn = async (req, res) => {
  const returnId = req.params.id;
  const { reason } = req.body;
  const storeId = req.user.current_store_id;
  const lang = getLang(req);

  try {
    const result = await pool.query(
      `UPDATE sales_returns SET status = 'rejected', notes = COALESCE(notes, '') || ' Rejected: ' || $1
             WHERE id = $2 AND store_id = $3 AND status = 'pending'
             RETURNING *`,
      [reason || "No reason provided", returnId, storeId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: t("return_not_found_or_processed", lang),
      });
    }

    await logActivity(pool, {
      userId: req.user.id,
      storeId: storeId,
      action: "reject_sales_return",
      description: {
        invoice_number: result.rows[0].original_invoice_number,
        reason: reason || undefined,
      },
      ip: req.ip,
    });
    
    notifyStore({
      storeId,
      type: "sales_return",
      title: "Sales return rejected",
      message: "A sales return was rejected",
      meta: { return_number: result.rows[0].return_number, reason: reason || "No reason provided" },
    }).catch(() => { });

    res.json({
      success: true,
      message: "return_rejected",
      return: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =====================================================
// PENDING/SAVED ORDERS (EXISTING)
// =====================================================

/**
 * POST /api/sales/save-order
 * Save order as draft
 */
export const saveOrder = async (req, res) => {
  let {
    storeId,
    cart_code,
    priceCategory,
    salesDate,
    customerId,
    customerName,
    customerPhone,
    subTotal,
    amountTax,
    totalDiscount,
    amountTotal,
    amountPaid,
    amountDue,
    amountChange,
    paymentMethod,
    notes,
  } = req.body;
  const userId = req.user.id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cartItemsResult = await client.query(
      `SELECT product_id, quantity, price
             FROM cart
             WHERE cart_code = $1 AND store_id = $2 AND status = 'OnProcess'`,
      [cart_code, storeId],
    );

    if (cartItemsResult.rows.length === 0) {
      throw new Error(t("cart_empty_or_already_saved", lang));
    }

    if (customerId == null && customerName && customerPhone) {
      const result = await client.query(
        "SELECT id FROM customers WHERE (name = $1 AND phone = $2) AND store_id = $3",
        [customerName, customerPhone, storeId],
      );

      if (result.rows.length > 0) {
        customerId = result.rows[0].id;
      } else {
        const insertResult = await client.query(
          `INSERT INTO customers (name, phone, created_by, store_id) 
                     VALUES ($1, $2, $3, $4) RETURNING id`,
          [customerName, customerPhone, userId, storeId],
        );
        customerId = insertResult.rows[0].id;
      }

      await client.query(
        `UPDATE cart SET status = 'Saved', customer_id = $3
             WHERE cart_code = $1 AND store_id = $2 AND status = 'OnProcess'`,
        [cart_code, storeId, customerId],
      );
    }

    await client.query(
      `UPDATE cart SET status = 'Saved'
             WHERE cart_code = $1 AND store_id = $2 AND status = 'OnProcess'`,
      [cart_code, storeId],
    );

    const paidAmount = Number(String(amountPaid ?? 0).replace(/,/g, '')) || 0;
    const dueAmount = Number(String(amountDue ?? 0).replace(/,/g, '')) || 0;
    const changeAmount = Number(String(amountChange ?? 0).replace(/,/g, '')) || 0;
    const orderNote = String(notes || req.body.paymentNotes || '').trim();
    if (orderNote) {
      await client.query(
        `UPDATE cart SET note = $1 WHERE cart_code = $2 AND store_id = $3`,
        [orderNote, cart_code, storeId],
      );
    }

    let paymentId = null;
    if (paidAmount > 0) {
      const paymentResult = await client.query(
        `INSERT INTO pending_orders_payments (
                cart_code, store_id, user_id, total_amount, amount_paid, amount_change,
                amount_due, created_at, payment_method
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, NOW(), $8
            ) RETURNING id`,
        [
          cart_code,
          storeId,
          userId,
          amountTotal,
          paidAmount,
          changeAmount,
          dueAmount,
          paymentMethod,
        ],
      );

      paymentId = paymentResult.rows[0].id;
    }

    const order_number = await generateOrderNumber(storeId);

    const orderResult = await client.query(
      `INSERT INTO pending_orders (
                order_number, cart_code, total_amount, subtotal, total_discount, total_vat)
                VALUES ($1, $2, $3, $4, $5, $6) RETURNING order_number`,
      [
        order_number,
        cart_code,
        amountTotal,
        subTotal,
        totalDiscount,
        amountTax,
      ],
    );

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "create_pending_order",
      description: {
        order_number,
        total_amount: amountTotal,
        amount_paid: amountPaid,
        customer_id: customerId || undefined,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "order_saved",
      cart_code,
      order_number: orderResult.rows[0].order_number,
      payment_id: paymentId,
      total_amount: amountTotal,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({
      success: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
};

/**
 * POST /api/sales/update-saved-order
 * Update a saved order
 */
export const saveOrderChanges = async (req, res) => {
  const {
    storeId,
    cart_code,
    orderNumber,
    items,
    customerId,
    subTotal,
    amountTax,
    totalDiscount,
    discountMode,
    amountTotal,
    amountPaid,
    amountDue,
    amountChange,
    note,
  } = req.body;
  const userId = req.user.id;
  const lang = getLang(req);
  const userNote = typeof note === 'string' ? note.trim() : '';
  const noteToSave = userNote && !/^order_modified_on_/i.test(userNote) ? userNote : '';

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const item of items) {
      // Check if item exists in cart
      const cartItemResult = await client.query(
        `SELECT * FROM cart WHERE cart_code = $1 AND product_id = $2`,
        [cart_code, item.product_id],
      );
      if (cartItemResult.rows.length === 0) {
        // Insert new item
        await client.query(
          `INSERT INTO cart (store_id, user_id,  product_id, quantity, price, discount, status, 
          cart_code, customer_id, discount_mode, note)
              VALUES ($1, $2, $3, $4, $5, $6, 'Saved', $7, $8, $9, $10)`,
          [
            storeId,
            userId,
            item.product_id,
            item.quantity,
            item.selling_price,
            item.discount,
            cart_code,
            customerId,
            discountMode,
            noteToSave || null,
          ],
        );
      } else if (noteToSave) {
        await client.query(
          `UPDATE cart SET quantity = $1, price = $2, discount = $3, discount_mode = $4, note = $5
               WHERE cart_code = $6 AND product_id = $7`,
          [item.quantity, item.selling_price, item.discount, discountMode, noteToSave, cart_code, item.product_id],
        );
      } else {
        await client.query(
          `UPDATE cart SET quantity = $1, price = $2, discount = $3, discount_mode = $4
               WHERE cart_code = $5 AND product_id = $6`,
          [item.quantity, item.selling_price, item.discount, discountMode, cart_code, item.product_id],
        );
      }
    }

    const keptIds = items.map((item) => item.product_id);
    await client.query(
      `DELETE FROM cart WHERE cart_code = $1 AND store_id = $2 AND NOT (product_id = ANY($3::uuid[]))`,
      [cart_code, storeId, keptIds],
    );
    await client.query(
      `UPDATE cart SET customer_id = $1 WHERE cart_code = $2 AND store_id = $3`,
      [customerId || null, cart_code, storeId],
    );

    await client.query(
      `UPDATE pending_orders SET total_amount = $1, subtotal = $2, total_discount = $3, total_vat = $4
             WHERE cart_code = $5 AND order_number = $6`,
      [amountTotal, subTotal, totalDiscount, amountTax, cart_code, orderNumber],
    );

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "update_pending_order",
      description: {
        order_number: orderNumber,
        total_amount: amountTotal,
        amount_paid: amountPaid,
        items: items.length,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "order_updated",
      cart_code,
      order_number: orderNumber,
      total_amount: amountTotal,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({
      success: false,
      error: err.message,
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/sales/get-orders
 */
export const getOrders = async (req, res) => {
  const storeId = req.user.current_store_id;
  // 'Saved' = waiting orders (default); ?status=Cancelled lists the cancelled ones.
  const wanted = req.query?.status === "Cancelled" ? "Cancelled" : "Saved";

  try {
    const ordersQuery = `
            SELECT DISTINCT ON (ct.cart_code)
                ct.cart_code, ct.status as order_status,
                cst.name AS customer_name, cst.phone AS customer_phone, 
                po.order_number AS order_number,
                po.total_amount AS order_value, ct.created_at,
                COALESCE(pay.amount_paid, 0) AS amount_paid,
                COALESCE(pay.has_payment, false) AS has_payment
            FROM cart ct
            LEFT JOIN customers cst ON ct.customer_id = cst.id
            LEFT JOIN pending_orders po ON ct.cart_code = po.cart_code
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(pop.amount_paid), 0) AS amount_paid,
                       COUNT(*) FILTER (
                         WHERE pop.amount_paid > 0
                           AND COALESCE(pop.payment_method, '') NOT LIKE 'mod_by_%'
                       ) > 0 AS has_payment
                FROM pending_orders_payments pop
                WHERE pop.cart_code = ct.cart_code
            ) pay ON true
            WHERE ct.status = $1 AND ct.store_id = $2
            ORDER BY ct.cart_code, po.order_number ASC;
        `;
    const ordersResult = await pool.query(ordersQuery, [wanted, storeId]);

    res.json({ success: true, orderDatas: ordersResult.rows });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/sales/get-orders/:cartCode
 */
export const getOrderDetails = async (req, res) => {
  const cart_code = req.params.cartCode;
  const storeId = req.user.current_store_id;

  try {
    const cartQuery = `
            SELECT c.*, po.order_number, po.total_amount, po.subtotal, po.total_discount, po.total_vat, p.name, p.image_url, cst.name AS customer_name, cst.phone AS customer_phone
            FROM cart c
            JOIN products p ON c.product_id = p.id
            LEFT JOIN customers cst ON c.customer_id = cst.id
            LEFT JOIN pending_orders po ON c.cart_code = po.cart_code
            WHERE c.cart_code = $1 AND c.store_id = $2
            ORDER BY p.name ASC
        `;
    const cartResult = await pool.query(cartQuery, [cart_code, storeId]);

    const paymentQuery = `
            SELECT pop.*, u.name AS receiver
            FROM pending_orders_payments pop
            JOIN users u ON pop.user_id = u.id
            WHERE pop.cart_code = $1
            ORDER BY pop.created_at ASC
        `;
    const paymentResult = await pool.query(paymentQuery, [cart_code]);

    res.json({
      success: true,
      cart_code,
      order_number: cartResult.rows[0]?.order_number || null,
      cartDatas: cartResult.rows,
      paymentDatas: paymentResult.rows,
    });
  } catch (err) {
    console.error("Error fetching orderDetails:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/sales/edit-orders/:cartCode
 */
export const getOrderDetailsForEdit = async (req, res) => {
  const cart_code = req.params.cartCode;
  const storeId = req.user.current_store_id;

  try {
    const cartQuery = `
            SELECT c.*, po.order_number, po.total_amount, po.subtotal, po.total_discount, po.total_vat, p.name, p.image_url, p.unit, p.status, cst.name AS customer_name, cst.phone AS customer_phone
            FROM cart c
            JOIN products p ON c.product_id = p.id
            LEFT JOIN customers cst ON c.customer_id = cst.id
            LEFT JOIN pending_orders po ON c.cart_code = po.cart_code
            WHERE c.cart_code = $1 AND c.store_id = $2
            ORDER BY p.name ASC
        `;
    const cartResult = await pool.query(cartQuery, [cart_code, storeId]);

    const paymentQuery = `
            SELECT pop.*, u.name AS receiver
            FROM pending_orders_payments pop
            JOIN users u ON pop.user_id = u.id
            WHERE pop.cart_code = $1
            ORDER BY pop.created_at ASC
        `;
    const paymentResult = await pool.query(paymentQuery, [cart_code]);

    res.json({
      success: true,
      cart_code,
      order_number: cartResult.rows[0]?.order_number || null,
      cartDatas: cartResult.rows,
      paymentDatas: paymentResult.rows,
    });
  } catch (err) {
    console.error("Error fetching orderDetails:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/sales/order-payments
 */
export const saveOrderPayments = async (req, res) => {
  const { amount, amount_paid, amount_due, cart_code, payment_method } =
    req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;

  try {
    const diff = amount_due - amount_paid;
    const dueAmt = diff > 0 ? diff : 0;
    const changeAmt = diff < 0 ? Math.abs(diff) : 0;

    const payment = await pool.query(
      `INSERT INTO pending_orders_payments (
                cart_code, store_id, user_id, total_amount, amount_paid, amount_change,
                amount_due, created_at, payment_method
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, NOW(), $8
            ) RETURNING *`,
      [
        cart_code,
        storeId,
        userId,
        amount,
        amount_paid,
        changeAmt,
        dueAmt,
        payment_method,
      ],
    );

    await logActivity(pool, {
      userId: userId,
      storeId: storeId,
      action: "record_order_payment",
      description: {
        order: cart_code,
        total_amount: amount,
        amount_paid,
        payment_method,
      },
      ip: req.ip,
    });
    
    res.json({
      success: true,
      paymentDatas: payment.rows,
    });
  } catch (err) {
    console.error("Error recording payment:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/sales/orders/:cartCode/cancel
 */
export const cancelOrder = async (req, res) => {
  const cartCode = req.params.cartCode;
  const storeId = req.user.current_store_id;
  const lang = getLang(req);
  const reason = String(req.body?.note || req.body?.reason || '').trim();

  try {
    const paid = await pool.query(
      `SELECT COUNT(*)::int AS count FROM pending_orders_payments
       WHERE cart_code = $1 AND store_id = $2 AND amount_paid > 0
         AND COALESCE(payment_method, '') NOT LIKE 'mod_by_%'`,
      [cartCode, storeId],
    );
    if (paid.rows[0].count > 0 && reason.length < 3) {
      return res.status(400).json({ success: false, message: t('cancel_reason_required', lang) });
    }

    const result = await pool.query(
      `UPDATE cart SET status = 'Cancelled', note = CASE WHEN $3 = '' THEN note ELSE $3 END
             WHERE cart_code = $1 AND store_id = $2 AND status IN ('Pending', 'Saved', 'OnProcess')
             RETURNING *`,
      [cartCode, storeId, reason],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: t("order_not_found", lang),
      });
    }

    await logActivity(pool, {
      userId: req.user.id,
      storeId: storeId,
      action: "cancel_order",
      description: {
        order: cartCode,
      },
      ip: req.ip,
    });
    
    res.json({
      success: true,
      message: "order_cancelled",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * POST /api/sales/orders/:cartCode/sell
 * Sell a pending/saved order directly (cash if fully paid, credit if allowed)
 */
export const sellPendingOrder = async (req, res) => {
  const cartCode = req.params.cartCode;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  const productNames = {};
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Get store settings
    const storeSettings = await getStoreSettings(storeId);

    // 2. Fetch cart items with product info and pending_orders data
    const cartResult = await client.query(
      `SELECT c.*, po.order_number, po.total_amount, po.subtotal,
              po.total_discount, po.total_vat,
              p.name AS product_name, p.barcode AS product_barcode, p.unit AS product_unit, p.image_url,
              cst.name AS customer_name, cst.phone AS customer_phone
       FROM cart c
       JOIN products p ON c.product_id = p.id
       LEFT JOIN customers cst ON c.customer_id = cst.id
       LEFT JOIN pending_orders po ON c.cart_code = po.cart_code
       WHERE c.cart_code = $1 AND c.store_id = $2 AND c.status IN ('Pending', 'Saved')
       ORDER BY p.name ASC`,
      [cartCode, storeId],
    );

    if (cartResult.rows.length === 0) {
      throw new Error(t("order_not_found_or_invalid", lang));
    }

    const cartItems = cartResult.rows;
    const firstRow = cartItems[0];

    // Order totals from pending_orders table
    const amountTotal = parseFloat(firstRow.total_amount) || 0;
    const subTotal = parseFloat(firstRow.subtotal) || 0;
    const totalDiscount = parseFloat(firstRow.total_discount) || 0;
    const totalVat = parseFloat(firstRow.total_vat) || 0;
    const customerId = firstRow.customer_id || null;
    const orderNumber = firstRow.order_number;

    // 3. Check if order already sold (guard against double-processing)
    const alreadySoldCheck = await client.query(
      "SELECT COUNT(*) FROM cart WHERE cart_code = $1 AND store_id = $2 AND status = $3",
      [cartCode, storeId, "Sold"],
    );

    if (parseInt(alreadySoldCheck.rows[0].count) > 0) {
      throw new Error(t("order_already_sold", lang));
    }

    // 4. Get total payments made
    const paymentsResult = await client.query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM pending_orders_payments
       WHERE cart_code = $1`,
      [cartCode],
    );
    const totalPaid = parseFloat(paymentsResult.rows[0].total_paid) || 0;
    const outstanding = amountTotal - totalPaid;

    // 5. Determine sale type
    let saleType;
    if (outstanding <= 0) {
      saleType = "cash";
    } else {
      // Not fully paid - check if credit sales are supported
      if (!storeSettings.operations?.creditSalesSupport) {
        throw new Error(t("order_not_fully_paid", lang));
      }
      saleType = "credit";

      if (!customerId) {
        throw new Error(t("customer_required_for_credit", lang));
      }

      // Check credit limit if enabled
      if (storeSettings.operations?.customerCreditLimit) {
        const creditCheck = await checkCustomerCreditLimit(
          customerId,
          storeId,
          outstanding,
        );
        if (!creditCheck.allowed) {
          throw new Error(t(creditCheck.message, lang));
        }
      }
    }

    // 6. Reopen order (set to OnProcess)
    await client.query(
      `UPDATE cart SET status = 'OnProcess', user_id = $3, updated_at = NOW()
       WHERE cart_code = $1 AND store_id = $2`,
      [cartCode, storeId, userId],
    );

    // 7. Generate invoice number
    const invoice_number = await generateInvoiceNumber(storeId);

    // 8. Process inventory - deduct stock from batches
    const saleDetails = [];

    for (const item of cartItems) {
      let remainingQty = parseFloat(item.quantity);
      const productId = item.product_id;
      const productBarcode = item.product_barcode;
      const productName = item.product_name;
      productNames[productId] = productName;
      let batchesUsed = [];

      // LOCK ALL batches for this product FIRST (prevents race conditions)
      const lockResult = await client.query(
        `SELECT id
         FROM inventory_batches
         WHERE product_id = $1
           AND store_id = $2
           AND (expiry_date IS NULL OR expiry_date >= NOW())
         FOR UPDATE`,
        [productId, storeId],
      );

      if (lockResult.rows.length === 0) {
        throw new Error(`${productName} - ${t("insufficient_stock", lang)}`);
      }

      // Calculate stock safely (inside lock), include non-expired batches of any status
      const batchesResult = await client.query(
        `SELECT
            ib.id,
            ib.batch_number,
            ib.selling_price,
            ib.cost_price,
            ib.status,
            ib.expiry_date,
            ib.created_at,
            COALESCE(SUM(
              CASE
                WHEN im.type = 'IN' THEN im.quantity
                ELSE -im.quantity
              END
            ), 0) AS available_stock
         FROM inventory_batches ib
         LEFT JOIN inventory_movements im ON ib.id = im.batch_id
         WHERE ib.product_id = $1
           AND ib.store_id = $2
           AND (ib.expiry_date IS NULL OR ib.expiry_date >= NOW())
         GROUP BY ib.id
         HAVING COALESCE(SUM(
           CASE
             WHEN im.type = 'IN' THEN im.quantity
             ELSE -im.quantity
           END
         ), 0) > 0
         ORDER BY
           CASE WHEN ib.status = 'in_use' THEN 0 ELSE 1 END,
           COALESCE(ib.expiry_date, 'infinity') ASC,
           ib.created_at ASC`,
        [productId, storeId],
      );

      const batches = batchesResult.rows;

      if (batches.length === 0) {
        throw new Error(`${productName} - ${t("insufficient_stock", lang)}`);
      }

      // Process batches safely
      for (const batch of batches) {
        if (remainingQty <= 0) break;

        let availableStock = parseFloat(batch.available_stock);
        if (availableStock <= 0) continue;

        // Auto-activate batch if not yet in use
        if (batch.status !== "in_use") {
          await client.query(
            `UPDATE inventory_batches SET status = 'in_use' WHERE id = $1`,
            [batch.id],
          );
        }

        const qtyToSell = Math.min(availableStock, remainingQty);
        const costPrice = batch.cost_price || 0;

        // Record OUT movement
        await client.query(
          `INSERT INTO inventory_movements (
              store_id, product_id, batch_id, cart_id, quantity,
              type, note, created_by, created_at, transaction_date
          ) VALUES ($1, $2, $3, $4, $5, 'OUT', $6, $7, NOW(), NOW())`,
          [
            storeId,
            productId,
            batch.id,
            item.id,
            qtyToSell,
            `Sold in invoice ${invoice_number}`,
            userId,
          ],
        );

        batchesUsed.push({
          batchId: batch.id,
          quantity: qtyToSell,
          price: parseFloat(item.price),
          costPrice: costPrice,
          discount: parseFloat(item.discount || 0),
        });

        remainingQty -= qtyToSell;

        // Mark sold_out using local availableStock (not raw DB value)
        if (availableStock - qtyToSell <= 0) {
          await client.query(
            `UPDATE inventory_batches SET status = 'sold_out' WHERE id = $1`,
            [batch.id],
          );
        }
      }

      if (remainingQty > 0) {
        throw new Error(
          `${productName} (${productBarcode}) - ${t("insufficient_stock", lang)}`,
        );
      }

      saleDetails.push({
        id: productId,
        name: productName,
        batches: batchesUsed,
        quantity: parseFloat(item.quantity),
        price: parseFloat(item.price),
        discount: parseFloat(item.discount || 0),
      });
    }

    // 9. Resolve customer info
    let resolvedCustomerId = customerId;
    let customerInfo = null;
    let creditDueDays = 0;
    if (resolvedCustomerId) {
      const custResult = await client.query(
        "SELECT * FROM customers WHERE id = $1 AND store_id = $2",
        [resolvedCustomerId, storeId],
      );
      customerInfo = custResult.rows[0] || null;
      creditDueDays = customerInfo?.credit_due_days || 0;
    }

    // 10. Calculate payment amounts
    const amountPaid = totalPaid;
    const amountDue = Math.max(0, outstanding);
    const amountChange = totalPaid > amountTotal ? totalPaid - amountTotal : 0;
    const paymentMethod = saleType === "credit" ? "credit" : "cash";

    // 11. Insert payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (
          invoice_number, cart_code, store_id, user_id, total_amount, amount_paid,
          amount_change, amount_due, created_at, payment_method, notes, sale_type,
          subtotal, total_discount, total_vat, sales_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13, $14, NOW())
      RETURNING *`,
      [
        invoice_number,
        cartCode,
        storeId,
        userId,
        amountTotal,
        amountPaid,
        amountChange,
        amountDue,
        paymentMethod,
        `Sold from pending order #${orderNumber}`,
        saleType,
        subTotal,
        totalDiscount,
        totalVat,
      ],
    );

    const paymentInfo = paymentResult.rows[0];
    const dueDays =
      creditDueDays || storeSettings.operations?.defaultCreditDueDays || 0;
    const dueDate = dueDays
      ? new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000)
      : null;

    let status = null;
    if (amountDue === 0 && amountPaid >= amountTotal) {
      status = "paid";
    } else if (amountDue > 0 && amountPaid > 0) {
      status = "partial_paid";
    } else if (amountDue > 0 && amountPaid === 0) {
      status = "not_paid";
    }

    paymentInfo.payment_status = status;
    paymentInfo.due_date = dueDate;

    // 12. Update cart status to Sold
    await client.query(
      `UPDATE cart SET status = 'Sold', invoice_number = $1, customer_id = $3, sale_type = $4
       WHERE cart_code = $2`,
      [invoice_number, cartCode, resolvedCustomerId, saleType],
    );

    // 13. Calculate profit/loss
    let profitLoss = 0;
    saleDetails.forEach((detail) => {
      detail.batches.forEach((batch) => {
        profitLoss += ((batch.price - batch.costPrice) - (batch.discount || 0)) * batch.quantity;
      });
    });

    await client.query(
      `INSERT INTO salesrecord (
          invoice_number, profit, loss, user_id, store_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        invoice_number,
        profitLoss > 0 ? profitLoss : 0,
        profitLoss < 0 ? Math.abs(profitLoss) : 0,
        userId,
        storeId,
      ],
    );

    // 14. Handle credit sale
    if (saleType === "credit" && resolvedCustomerId) {
      await client.query(
        `INSERT INTO credit_sales (
            cart_code, invoice_number, store_id, customer_id, user_id,
            total_amount, amount_paid, amount_due, status, due_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          cartCode,
          invoice_number,
          storeId,
          resolvedCustomerId,
          userId,
          amountTotal,
          amountPaid,
          amountDue,
          amountDue > 0
            ? amountPaid > 0
              ? "partial_paid"
              : "not_paid"
            : "paid",
          dueDate,
        ],
      );

      // Update customer balance
      await client.query(
        `UPDATE customers SET current_balance = current_balance + $1 WHERE id = $2`,
        [amountDue, resolvedCustomerId],
      );
    }

    await logActivity(client, {
      userId: userId,
      storeId: storeId,
      action: "sell_pending_order",
      description: {
        invoice_number,
        order: cartCode,
        total_amount: amountTotal,
        amount_paid: amountPaid,
        amount_due: amountDue,
        customer_id: resolvedCustomerId || undefined,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    notifyStore({
      storeId,
      type: "new_sale",
      title: "New sale",
      message: "A sale was processed successfully",
      meta: { invoice_number, amount: amountTotal, sale_type: saleType },
    }).catch(() => { });

    res.status(201).json({
      success: true,
      message: "sale_processed_successfully",
      invoice_number,
      payment_id: paymentInfo.id,
      total_amount: amountTotal,
      sale_type: saleType,
      items: saleDetails,
      customerInfo: customerInfo,
      paymentInfo: paymentInfo,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error selling pending order:", err);

    const failedItems = cartItems?.map((item) => ({
      id: item.product_id,
      name: productNames[item.product_id] || item.product_name || "Unknown Product",
      requested: parseFloat(item.quantity),
    })) ?? [];

    res.status(400).json({
      success: false,
      error: err.message,
      failed_items: failedItems,
    });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/sales/orders/:cartCode/reopen
 */
export const reopenOrder = async (req, res) => {
  const cartCode = req.params.cartCode;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = getLang(req);

  try {
    const result = await pool.query(
      `UPDATE cart SET status = CASE WHEN status = 'Cancelled' THEN 'Saved' ELSE 'OnProcess' END, user_id = $3, updated_at = NOW() 
             WHERE cart_code = $1 AND store_id = $2 AND status IN ('Pending', 'Saved', 'Cancelled')
             RETURNING *`,
      [cartCode, storeId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: t("order_not_found", lang),
      });
    }

    await logActivity(pool, {
      userId: userId,
      storeId: storeId,
      action: "reopen_order",
      description: {
        order: cartCode,
      },
      ip: req.ip,
    });
    
    res.json({
      success: true,
      message: "order_reopened",
      cart_code: cartCode,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * DELETE /api/sales/orders/:cartCode
 * Delete pending/saved order only when no payments have been recorded
 */
export const deletePendingOrder = async (req, res) => {
  const cartCode = req.params.cartCode;
  const storeId = req.user.current_store_id;
  const lang = getLang(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentCheck = await client.query(
      `SELECT (
          (SELECT COUNT(*) FROM payments WHERE cart_code = $1 AND store_id = $2)
          + (SELECT COUNT(*) FROM pending_orders_payments
             WHERE cart_code = $1 AND store_id = $2 AND amount_paid > 0
               AND COALESCE(payment_method, '') NOT LIKE 'mod_by_%')
        )::int AS count`,
      [cartCode, storeId],
    );

    if (paymentCheck.rows[0].count > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: t("cannot_delete_order_with_payments", lang),
      });
    }

    const deleted = await client.query(
      `DELETE FROM cart
             WHERE cart_code = $1 AND store_id = $2 AND status IN ('Pending', 'Saved')
             RETURNING id`,
      [cartCode, storeId],
    );

    if (deleted.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: t("order_not_found", lang),
      });
    }

    await logActivity(client, {
      userId: req.user.id,
      storeId: storeId,
      action: "delete_pending_order",
      description: {
        order: cartCode,
      },
      ip: req.ip,
    });
    
    await client.query("COMMIT");

    res.json({
      success: true,
      message: "order_deleted",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    client.release();
  }
};

