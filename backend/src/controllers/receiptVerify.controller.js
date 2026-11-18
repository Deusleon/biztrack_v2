import pool from '../config/db.js';
import getStoreSettings from '../utils/getStoreSettings.js';
import { respondWithError } from '../utils/response.js';

/**
 * Public receipt verification — used when a printed receipt QR code is scanned.
 * Returns limited sale facts so a customer can confirm the receipt is genuine.
 * GET /api/public/receipts/verify?invoice=...&store=...
 */
export const verifyReceipt = async (req, res) => {
  const invoice = String(req.query.invoice || req.params.invoiceNumber || '').trim();
  const storeId = String(req.query.store || req.params.storeId || '').trim();

  if (!invoice || !storeId) {
    return res.status(400).json({
      success: false,
      message: 'invoice_and_store_required',
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         p.invoice_number,
         p.sales_date,
         p.total_amount,
         p.amount_paid,
         p.amount_due,
         p.payment_method,
         p.sale_type,
         s.name AS store_name,
         cust.name AS customer_name
       FROM payments p
       JOIN stores s ON s.id = p.store_id
       LEFT JOIN LATERAL (
         SELECT customer_id FROM cart
         WHERE cart_code = p.cart_code AND store_id = p.store_id
         LIMIT 1
       ) c ON true
       LEFT JOIN customers cust ON cust.id = c.customer_id
       WHERE p.invoice_number = $1 AND p.store_id = $2
       LIMIT 1`,
      [invoice, storeId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'receipt_not_found',
        verified: false,
      });
    }

    const row = result.rows[0];
    const settings = await getStoreSettings(storeId);
    const ops = settings.operations || settings;
    const systemDefaults = settings.systemDefaults || {};
    const businessInfo = settings.businessInfo || {};

    return res.json({
      success: true,
      verified: true,
      data: {
        invoice_number: row.invoice_number,
        sales_date: row.sales_date,
        total_amount: row.total_amount,
        amount_paid: row.amount_paid,
        amount_due: row.amount_due,
        payment_method: row.payment_method,
        sale_type: row.sale_type,
        store_name: row.store_name,
        business_name: businessInfo.businessName || ops.businessName || row.store_name,
        customer_name: row.customer_name || null,
        currency: ops.defaultCurrency || systemDefaults.defaultCurrency || null,
        decimal_places: ops.defaultDecimalPlaces ?? systemDefaults.defaultDecimalPlaces ?? 0,
        show_currency: (ops.showCurrency ?? systemDefaults.showCurrency) !== false,
        currency_position: ops.defaultCurrencyPosition || systemDefaults.defaultCurrencyPosition || 'before',
        date_format: ops.defaultDateFormat || systemDefaults.defaultDateFormat || '1',
      },
    });
  } catch (err) {
    console.error('Receipt verify error:', err);
    return respondWithError(req, res, 500, 'server_error');
  }
};
