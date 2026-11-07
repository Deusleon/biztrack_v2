import pool from '../config/db.js';
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
// =====================================================
// UTILITY FUNCTIONS
// =====================================================

const getStoreSettings = async (storeId) => {
    const result = await pool.query(
        `SELECT settings FROM store_settings WHERE store_id = $1`,
        [storeId]
    );
    return result.rows[0]?.settings || {};
};

const generatePurchaseNumber = async (storeId, type, client = pool) => {
    const columnMap = {
        bill: 'last_bill_number',
        payment: 'last_supplier_payment_number',
        return: 'last_purchase_return_number'
    };
    
    await client.query(
        `INSERT INTO store_invoice_counters (store_id)
         VALUES ($1)
         ON CONFLICT (store_id) DO NOTHING`,
        [storeId]
    );

    const column = columnMap[type];
    const result = await client.query(
        `UPDATE store_invoice_counters 
         SET ${column} = ${column} + 1
         WHERE store_id = $1
         RETURNING ${column}`,
        [storeId]
    );

    const nextNumber = result.rows[0][column];
    return `${String(nextNumber).padStart(5, '0')}`;
};

const logPurchaseAction = async (userId, action, description, storeId, ipAddress = null) => {
    try {
        await pool.query(
            `INSERT INTO system_logs (user_id, action, description, store_id, ip_address)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, action, JSON.stringify(description), storeId, ipAddress]
        );
    } catch (err) {
        console.error('Failed to log action:', err);
    }
};

const emitToStore = (storeId, event, data) => {
    try {
        const io = getIO();
        if (io) {
            io.to(`store_${storeId}`).emit(event, data);
        }
    } catch (err) {
        console.error('Failed to emit socket event:', err);
    }
};

// =====================================================
// SUPPLIER INVOICES (BILLS)
// =====================================================

/**
 * GET /api/purchases/invoices
 * Get all supplier invoices
 */
export const getSupplierInvoices = async (req, res) => {
    const storeId = req.user.current_store_id;
    const { 
        page = 1, 
        limit = 20, 
        status, 
        payment_status,
        supplier_id,
        grn_id,
        from_date,
        to_date,
        search
    } = req.query;

    try {
        let whereClause = 'WHERE si.store_id = $1';
        const params = [storeId];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND si.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (payment_status) {
            whereClause += ` AND si.payment_status = $${paramIndex}`;
            params.push(payment_status);
            paramIndex++;
        }

        if (supplier_id) {
            whereClause += ` AND si.supplier_id = $${paramIndex}`;
            params.push(supplier_id);
            paramIndex++;
        }

        if (grn_id) {
            whereClause += ` AND si.grn_id = $${paramIndex}`;
            params.push(grn_id);
            paramIndex++;
        }

        if (from_date) {
            whereClause += ` AND si.invoice_date >= $${paramIndex}`;
            params.push(from_date);
            paramIndex++;
        }

        if (to_date) {
            whereClause += ` AND si.invoice_date <= $${paramIndex}`;
            params.push(to_date);
            paramIndex++;
        }

        if (search) {
            whereClause += ` AND (si.bill_number ILIKE $${paramIndex} OR si.supplier_invoice_number ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM supplier_invoices si
             LEFT JOIN suppliers s ON si.supplier_id = s.id
             ${whereClause}`,
            params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        const offset = (page - 1) * limit;
        params.push(limit, offset);

        const result = await pool.query(
            `SELECT 
                si.*,
                s.name AS supplier_name,
                po.po_number,
                grn.grn_number,
                u.name AS created_by_name,
                au.name AS approved_by_name,
                CASE 
                    WHEN si.due_date < CURRENT_DATE AND si.payment_status != 'paid' THEN true 
                    ELSE false 
                END AS is_overdue
             FROM supplier_invoices si
             LEFT JOIN suppliers s ON si.supplier_id = s.id
             LEFT JOIN purchase_orders po ON si.purchase_order_id = po.id
             LEFT JOIN goods_received_notes grn ON si.grn_id = grn.id
             LEFT JOIN users u ON si.created_by = u.id
             LEFT JOIN users au ON si.approved_by = au.id
             ${whereClause}
             ORDER BY si.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching supplier invoices:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

/**
 * GET /api/purchases/invoices/:id
 * Get single supplier invoice with items
 */
export const getSupplierInvoiceById = async (req, res) => {
    const { id } = req.params;
    const storeId = req.user.current_store_id;

    try {
        const invoiceResult = await pool.query(
            `SELECT 
                si.*,
                s.name AS supplier_name,
                s.contact_person AS supplier_contact,
                s.email AS supplier_email,
                s.phone AS supplier_phone,
                s.address AS supplier_address,
                po.po_number,
                grn.grn_number,
                u.name AS created_by_name,
                au.name AS approved_by_name
             FROM supplier_invoices si
             LEFT JOIN suppliers s ON si.supplier_id = s.id
             LEFT JOIN purchase_orders po ON si.purchase_order_id = po.id
             LEFT JOIN goods_received_notes grn ON si.grn_id = grn.id
             LEFT JOIN users u ON si.created_by = u.id
             LEFT JOIN users au ON si.approved_by = au.id
             WHERE si.id = $1 AND si.store_id = $2`,
            [id, storeId]
        );

        if (invoiceResult.rows.length === 0) {
            return respondWithError(req, res, 404, 'supplier_invoice_not_found');
        }

        // Get invoice items
        const itemsResult = await pool.query(
            `SELECT 
                sii.*,
                p.name AS product_name,
                p.barcode
             FROM supplier_invoice_items sii
             LEFT JOIN products p ON sii.product_id = p.id
             WHERE sii.supplier_invoice_id = $1
             ORDER BY sii.created_at ASC`,
            [id]
        );

        // Get payments
        const paymentsResult = await pool.query(
            `SELECT 
                sp.*,
                u.name AS created_by_name
             FROM supplier_payments sp
             LEFT JOIN users u ON sp.created_by = u.id
             WHERE sp.supplier_invoice_id = $1
             ORDER BY sp.payment_date DESC`,
            [id]
        );

        // Get approved supplier returns linked to this invoice (for auditing)
        const returnsResult = await pool.query(
            `SELECT 
                sr.id,
                sr.return_number,
                sr.return_reason,
                sr.total_value,
                sr.approved_at,
                sr.created_at
             FROM supplier_returns sr
             WHERE sr.supplier_invoice_id = $1
               AND sr.status = 'approved'
             ORDER BY sr.approved_at ASC`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...invoiceResult.rows[0],
                items: itemsResult.rows,
                payments: paymentsResult.rows,
                supplier_returns: returnsResult.rows
            }
        });
    } catch (err) {
        console.error('Error fetching supplier invoice:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

/**
 * POST /api/purchases/invoices
 * Create supplier invoice
 */
export const createSupplierInvoice = async (req, res) => {
    const {
        supplier_id,
        purchase_order_id,
        grn_id,
        supplier_invoice_number,
        invoice_date,
        due_date,
        subtotal,
        tax_amount,
        discount_amount,
        shipping_cost,
        other_charges,
        total_amount,
        notes,
        items
    } = req.body;
    const storeId = req.user.current_store_id;
    const userId = req.user.id;
    const lang = getLang(req);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Generate bill number
        const bill_number = await generatePurchaseNumber(storeId, 'bill', client);

        // Get store settings
        const settings = await getStoreSettings(storeId);
        const currency = settings.defaultCurrency || 'TZS';

        // Create invoice
        const invoiceResult = await client.query(
            `INSERT INTO supplier_invoices (
                store_id, supplier_id, purchase_order_id, grn_id,
                bill_number, supplier_invoice_number, invoice_date, due_date,
                subtotal, tax_amount, discount_amount, shipping_cost, other_charges,
                total_amount, currency, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *`,
            [
                storeId, supplier_id, purchase_order_id, grn_id,
                bill_number, supplier_invoice_number, invoice_date, due_date || null,
                subtotal || 0, tax_amount || 0, discount_amount || 0, 
                shipping_cost || 0, other_charges || 0,
                total_amount, currency, notes, userId
            ]
        );

        const invoice = invoiceResult.rows[0];

        // Create invoice items if provided
        if (items && items.length > 0) {
            for (const item of items) {
                const lineTotal = (item.quantity * item.unit_price) + (item.tax_amount || 0) - (item.discount_amount || 0);
                
                await client.query(
                    `INSERT INTO supplier_invoice_items (
                        supplier_invoice_id, product_id, grn_item_id,
                        description, quantity, unit_price,
                        tax_rate, tax_amount, discount_amount, line_total, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [
                        invoice.id, item.product_id, item.grn_item_id,
                        item.description || item.product_name,
                        item.quantity, item.unit_price,
                        item.tax_rate || 0, item.tax_amount || 0, 
                        item.discount_amount || 0, lineTotal, item.notes
                    ]
                );
            }
        }

        await client.query('COMMIT');

        // Log action
        await logPurchaseAction(
            userId,
            'create_supplier_invoice',
            { bill_number, supplier_id, total_amount },
            storeId,
            req.ip
        );

        emitToStore(storeId, 'supplierInvoiceCreated', {
            invoice,
            message: 'supplier_invoice_created'
        });

        res.status(201).json({
            success: true,
            message: t('supplier_invoice_created', lang),
            data: invoice
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating supplier invoice:', err);
        return respondWithError(req, res, 500, 'server_error');
    } finally {
        client.release();
    }
};

/**
 * PUT /api/purchases/invoices/:id
 * Update supplier invoice
 */
export const updateSupplierInvoice = async (req, res) => {
    const { id } = req.params;
    const {
        supplier_invoice_number,
        invoice_date,
        due_date,
        subtotal,
        tax_amount,
        discount_amount,
        shipping_cost,
        other_charges,
        total_amount,
        notes,
        status
    } = req.body;
    const storeId = req.user.current_store_id;
    const userId = req.user.id;
    const lang = getLang(req);

    try {
        const existingInvoice = await pool.query(
            `SELECT * FROM supplier_invoices WHERE id = $1 AND store_id = $2`,
            [id, storeId]
        );

        if (existingInvoice.rows.length === 0) {
            return respondWithError(req, res, 404, 'supplier_invoice_not_found');
        }

        const invoice = existingInvoice.rows[0];

        if (invoice.payment_status === 'paid') {
            return respondWithError(req, res, 400, 'cannot_update_paid_invoice');
        }

        const updateResult = await pool.query(
            `UPDATE supplier_invoices SET
                supplier_invoice_number = COALESCE($1, supplier_invoice_number),
                invoice_date = COALESCE($2, invoice_date),
                due_date = COALESCE($3, due_date),
                subtotal = COALESCE($4, subtotal),
                tax_amount = COALESCE($5, tax_amount),
                discount_amount = COALESCE($6, discount_amount),
                shipping_cost = COALESCE($7, shipping_cost),
                other_charges = COALESCE($8, other_charges),
                total_amount = COALESCE($9, total_amount),
                notes = COALESCE($10, notes),
                status = COALESCE($11, status),
                updated_by = $12,
                updated_at = NOW()
             WHERE id = $13 AND store_id = $14
             RETURNING *`,
            [
                supplier_invoice_number, invoice_date, due_date,
                subtotal, tax_amount, discount_amount,
                shipping_cost, other_charges, total_amount,
                notes, status, userId, id, storeId
            ]
        );

        await logPurchaseAction(
            userId,
            'update_supplier_invoice',
            { bill_number: invoice.bill_number },
            storeId,
            req.ip
        );

        res.json({
            success: true,
            message: t('supplier_invoice_updated', lang),
            data: updateResult.rows[0]
        });
    } catch (err) {
        console.error('Error updating supplier invoice:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

/**
 * DELETE /api/purchases/invoices/:id
 * Delete supplier invoice
 */
export const deleteSupplierInvoice = async (req, res) => {
    const { id } = req.params;
    const storeId = req.user.current_store_id;
    const userId = req.user.id;
    const lang = getLang(req);

    try {
        const existingInvoice = await pool.query(
            `SELECT * FROM supplier_invoices WHERE id = $1 AND store_id = $2`,
            [id, storeId]
        );

        if (existingInvoice.rows.length === 0) {
            return respondWithError(req, res, 404, 'supplier_invoice_not_found');
        }

        const invoice = existingInvoice.rows[0];

        if (invoice.amount_paid > 0) {
            return respondWithError(req, res, 400, 'cannot_delete_invoice_with_payments');
        }

        await pool.query(`DELETE FROM supplier_invoices WHERE id = $1`, [id]);

        await logPurchaseAction(
            userId,
            'delete_supplier_invoice',
            { bill_number: invoice.bill_number },
            storeId,
            req.ip
        );

        res.json({
            success: true,
            message: t('supplier_invoice_deleted', lang)
        });
    } catch (err) {
        console.error('Error deleting supplier invoice:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

// =====================================================
// SUPPLIER PAYMENTS
// =====================================================

/**
 * GET /api/purchases/payments
 * Get all supplier payments
 */
export const getSupplierPayments = async (req, res) => {
    const storeId = req.user.current_store_id;
    const { 
        page = 1, 
        limit = 20, 
        status, 
        supplier_id,
        payment_method,
        from_date, 
        to_date, 
        search 
    } = req.query;

    try {
        let whereClause = 'WHERE sp.store_id = $1';
        const params = [storeId];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND sp.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (supplier_id) {
            whereClause += ` AND sp.supplier_id = $${paramIndex}`;
            params.push(supplier_id);
            paramIndex++;
        }

        if (payment_method) {
            whereClause += ` AND sp.payment_method = $${paramIndex}`;
            params.push(payment_method);
            paramIndex++;
        }

        if (from_date) {
            whereClause += ` AND sp.payment_date >= $${paramIndex}`;
            params.push(from_date);
            paramIndex++;
        }

        if (to_date) {
            whereClause += ` AND sp.payment_date <= $${paramIndex}`;
            params.push(to_date);
            paramIndex++;
        }

        if (search) {
            whereClause += ` AND (sp.payment_number ILIKE $${paramIndex} OR sp.reference_number ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM supplier_payments sp
             LEFT JOIN suppliers s ON sp.supplier_id = s.id
             ${whereClause}`,
            params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        const offset = (page - 1) * limit;
        params.push(limit, offset);

        const result = await pool.query(
            `SELECT 
                sp.*,
                s.name AS supplier_name,
                si.bill_number,
                si.supplier_invoice_number,
                u.name AS created_by_name
             FROM supplier_payments sp
             LEFT JOIN suppliers s ON sp.supplier_id = s.id
             LEFT JOIN supplier_invoices si ON sp.supplier_invoice_id = si.id
             LEFT JOIN users u ON sp.created_by = u.id
             ${whereClause}
             ORDER BY sp.payment_date DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching supplier payments:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

/**
 * GET /api/purchases/payments/:id
 * Get single supplier payment
 */
export const getSupplierPaymentById = async (req, res) => {
    const { id } = req.params;
    const storeId = req.user.current_store_id;

    try {
        const result = await pool.query(
            `SELECT 
                sp.*,
                s.name AS supplier_name,
                s.contact_person AS supplier_contact,
                si.bill_number,
                si.supplier_invoice_number,
                si.total_amount AS invoice_total,
                si.balance_due AS invoice_balance,
                u.name AS created_by_name,
                au.name AS approved_by_name
             FROM supplier_payments sp
             LEFT JOIN suppliers s ON sp.supplier_id = s.id
             LEFT JOIN supplier_invoices si ON sp.supplier_invoice_id = si.id
             LEFT JOIN users u ON sp.created_by = u.id
             LEFT JOIN users au ON sp.approved_by = au.id
             WHERE sp.id = $1 AND sp.store_id = $2`,
            [id, storeId]
        );

        if (result.rows.length === 0) {
            return respondWithError(req, res, 404, 'supplier_payment_not_found');
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (err) {
        console.error('Error fetching supplier payment:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

/**
 * POST /api/purchases/payments
 * Create supplier payment
 */
export const createSupplierPayment = async (req, res) => {
    const {
        supplier_id,
        supplier_invoice_id,
        amount,
        payment_method,
        payment_date,
        reference_number,
        bank_name,
        account_number,
        notes
    } = req.body;
    const storeId = req.user.current_store_id;
    const userId = req.user.id;
    const lang = getLang(req);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Generate payment number
        const payment_number = await generatePurchaseNumber(storeId, 'payment', client);

        // Validate invoice if provided
        if (supplier_invoice_id) {
            const invoiceResult = await client.query(
                `SELECT * FROM supplier_invoices WHERE id = $1 AND store_id = $2 FOR UPDATE`,
                [supplier_invoice_id, storeId]
            );

            if (invoiceResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return respondWithError(req, res, 404, 'supplier_invoice_not_found');
            }

            const invoice = invoiceResult.rows[0];

            // Check if payment exceeds balance
            const balance = parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid);
            if (amount > balance) {
                await client.query('ROLLBACK');
                return respondWithError(req, res, 400, 'payment_exceeds_balance');
            }
        }

        // Create payment
        const paymentResult = await client.query(
            `INSERT INTO supplier_payments (
                store_id, supplier_id, supplier_invoice_id,
                payment_number, payment_date, amount,
                payment_method, reference_number, bank_name, account_number,
                notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                storeId, supplier_id, supplier_invoice_id,
                payment_number, payment_date || new Date(), amount,
                payment_method, reference_number, bank_name, account_number,
                notes, userId
            ]
        );

        const payment = paymentResult.rows[0];

        // Update invoice if linked
        if (supplier_invoice_id) {
            const updateResult = await client.query(
                `UPDATE supplier_invoices SET
                    amount_paid = amount_paid + $1,
                    payment_status = CASE 
                        WHEN (amount_paid + $1) >= total_amount THEN 'paid'
                        WHEN (amount_paid + $1) > 0 THEN 'partial'
                        ELSE 'unpaid'
                    END,
                    updated_at = NOW()
                 WHERE id = $2
                 RETURNING *`,
                [amount, supplier_invoice_id]
            );

            // If fully paid, update status
            if (updateResult.rows[0].payment_status === 'paid') {
                await client.query(
                    `UPDATE supplier_invoices SET status = 'paid' WHERE id = $1`,
                    [supplier_invoice_id]
                );
            }
        }

        await client.query('COMMIT');

        // Log action
        await logPurchaseAction(
            userId,
            'create_supplier_payment',
            { payment_number, supplier_id, amount, payment_method },
            storeId,
            req.ip
        );

        emitToStore(storeId, 'supplierPaymentCreated', {
            payment,
            message: 'supplier_payment_created'
        });

        res.status(201).json({
            success: true,
            message: t('supplier_payment_created', lang),
            data: payment
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating supplier payment:', err);
        return respondWithError(req, res, 500, 'server_error');
    } finally {
        client.release();
    }
};

/**
 * DELETE /api/purchases/payments/:id
 * Delete/void supplier payment
 */
export const deleteSupplierPayment = async (req, res) => {
    const { id } = req.params;
    const storeId = req.user.current_store_id;
    const userId = req.user.id;
    const lang = getLang(req);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existingPayment = await client.query(
            `SELECT * FROM supplier_payments WHERE id = $1 AND store_id = $2 FOR UPDATE`,
            [id, storeId]
        );

        if (existingPayment.rows.length === 0) {
            await client.query('ROLLBACK');
            return respondWithError(req, res, 404, 'supplier_payment_not_found');
        }

        const payment = existingPayment.rows[0];

        // Reverse invoice payment if linked
        if (payment.supplier_invoice_id) {
            await client.query(
                `UPDATE supplier_invoices SET
                    amount_paid = amount_paid - $1,
                    payment_status = CASE 
                        WHEN (amount_paid - $1) <= 0 THEN 'unpaid'
                        ELSE 'partial'
                    END,
                    status = CASE 
                        WHEN (amount_paid - $1) <= 0 THEN 'pending'
                        ELSE status
                    END,
                    updated_at = NOW()
                 WHERE id = $2`,
                [payment.amount, payment.supplier_invoice_id]
            );
        }

        // Void the payment instead of deleting
        await client.query(
            `UPDATE supplier_payments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
            [id]
        );

        await client.query('COMMIT');

        await logPurchaseAction(
            userId,
            'void_supplier_payment',
            { payment_number: payment.payment_number, amount: payment.amount },
            storeId,
            req.ip
        );

        res.json({
            success: true,
            message: t('supplier_payment_cancelled', lang)
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error cancelling supplier payment:', err);
        return respondWithError(req, res, 500, 'server_error');
    } finally {
        client.release();
    }
};

// =====================================================
// SUPPLIER RETURNS
// =====================================================

/**
 * GET /api/purchases/returns
 * Get all supplier returns
 */
export const getSupplierReturns = async (req, res) => {
    const storeId = req.user.current_store_id;
    const { page = 1, limit = 20, status, supplier_id, from_date, to_date, search } = req.query;

    try {
        let whereClause = 'WHERE sr.store_id = $1';
        const params = [storeId];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND sr.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (supplier_id) {
            whereClause += ` AND sr.supplier_id = $${paramIndex}`;
            params.push(supplier_id);
            paramIndex++;
        }

        if (from_date) {
            whereClause += ` AND sr.return_date >= $${paramIndex}`;
            params.push(from_date);
            paramIndex++;
        }

        if (to_date) {
            whereClause += ` AND sr.return_date <= $${paramIndex}`;
            params.push(to_date);
            paramIndex++;
        }

        if (search) {
            whereClause += ` AND (sr.return_number ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM supplier_returns sr
             LEFT JOIN suppliers s ON sr.supplier_id = s.id
             ${whereClause}`,
            params
        );
        const totalCount = parseInt(countResult.rows[0].count);

        const offset = (page - 1) * limit;
        params.push(limit, offset);

        const result = await pool.query(
            `SELECT 
                sr.*,
                s.name AS supplier_name,
                grn.grn_number,
                u.name AS created_by_name
             FROM supplier_returns sr
             LEFT JOIN suppliers s ON sr.supplier_id = s.id
             LEFT JOIN goods_received_notes grn ON sr.grn_id = grn.id
             LEFT JOIN users u ON sr.created_by = u.id
             ${whereClause}
             ORDER BY sr.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching supplier returns:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

/**
 * GET /api/purchases/returns/:id
 * Get single supplier return with items
 */
export const getSupplierReturnById = async (req, res) => {
    const { id } = req.params;
    const storeId = req.user.current_store_id;

    try {
        const returnResult = await pool.query(
            `SELECT 
                sr.*,
                s.name AS supplier_name,
                s.contact_person AS supplier_contact,
                grn.grn_number,
                u.name AS created_by_name,
                au.name AS approved_by_name
             FROM supplier_returns sr
             LEFT JOIN suppliers s ON sr.supplier_id = s.id
             LEFT JOIN goods_received_notes grn ON sr.grn_id = grn.id
             LEFT JOIN users u ON sr.created_by = u.id
             LEFT JOIN users au ON sr.approved_by = au.id
             WHERE sr.id = $1 AND sr.store_id = $2`,
            [id, storeId]
        );

        if (returnResult.rows.length === 0) {
            return respondWithError(req, res, 404, 'supplier_return_not_found');
        }

        const itemsResult = await pool.query(
            `SELECT 
                sri.*,
                p.name AS product_name,
                p.barcode,
                ib.batch_number
             FROM supplier_return_items sri
             LEFT JOIN products p ON sri.product_id = p.id
             LEFT JOIN inventory_batches ib ON sri.batch_id = ib.id
             WHERE sri.supplier_return_id = $1
             ORDER BY sri.created_at ASC`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...returnResult.rows[0],
                items: itemsResult.rows
            }
        });
    } catch (err) {
        console.error('Error fetching supplier return:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

/**
 * POST /api/purchases/returns
 * Create supplier return
 */
export const createSupplierReturn = async (req, res) => {
    const {
        supplier_id,
        grn_id,
        supplier_invoice_id,
        return_date,
        return_reason,
        reason_details,
        refund_method,
        refund_reference,
        notes,
        items
    } = req.body;
    const storeId = req.user.current_store_id;
    const userId = req.user.id;
    const lang = getLang(req);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Generate return number
        const return_number = await generatePurchaseNumber(storeId, 'return', client);

        // Validate/resolve linked supplier invoice if provided.
        let resolvedInvoiceId = supplier_invoice_id || null;

        if (!resolvedInvoiceId && grn_id) {
            const autoInvoice = await client.query(
                `SELECT id
                 FROM supplier_invoices
                 WHERE store_id = $1 AND supplier_id = $2 AND grn_id = $3
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [storeId, supplier_id, grn_id]
            );
            resolvedInvoiceId = autoInvoice.rows[0]?.id || null;
        }

        if (resolvedInvoiceId) {
            const invoiceResult = await client.query(
                `SELECT id, supplier_id, grn_id
                 FROM supplier_invoices
                 WHERE id = $1 AND store_id = $2`,
                [resolvedInvoiceId, storeId]
            );

            if (invoiceResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return respondWithError(req, res, 404, 'supplier_invoice_not_found');
            }

            const invoice = invoiceResult.rows[0];
            if (invoice.supplier_id !== supplier_id) {
                await client.query('ROLLBACK');
                return respondWithError(req, res, 400, 'invoice_supplier_mismatch');
            }

            if (grn_id && invoice.grn_id && invoice.grn_id !== grn_id) {
                await client.query('ROLLBACK');
                return respondWithError(req, res, 400, 'invoice_grn_mismatch');
            }
        }

        if (refund_method === 'apply_to_invoice' && !resolvedInvoiceId) {
            await client.query('ROLLBACK');
            return respondWithError(req, res, 400, 'supplier_invoice_required');
        }

        // Calculate totals
        let totalItems = items.length;
        let totalQuantity = 0;
        let totalValue = 0;

        for (const item of items) {
            const requestedQty = parseFloat(item.quantity) || 0;
            const unitCost = parseFloat(item.unit_cost) || 0;

            if (requestedQty <= 0) {
                await client.query('ROLLBACK');
                return respondWithError(req, res, 400, 'quantity_must_be_positive');
            }

            // Enforce remaining quantity across previous returns for this GRN item.
            if (item.grn_item_id) {
                const grnItemResult = await client.query(
                    `SELECT gi.id, gi.received_quantity
                     FROM grn_items gi
                     INNER JOIN goods_received_notes grn ON grn.id = gi.grn_id
                     WHERE gi.id = $1 AND grn.store_id = $2
                     FOR UPDATE`,
                    [item.grn_item_id, storeId]
                );

                if (grnItemResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return respondWithError(req, res, 404, 'grn_item_not_found');
                }

                const receivedQty = parseFloat(grnItemResult.rows[0].received_quantity) || 0;

                const returnedQtyResult = await client.query(
                    `SELECT COALESCE(SUM(sri.quantity), 0) AS returned_qty
                     FROM supplier_return_items sri
                     INNER JOIN supplier_returns sr ON sr.id = sri.supplier_return_id
                     WHERE sri.grn_item_id = $1
                       AND sr.store_id = $2
                       AND sr.status != 'cancelled'`,
                    [item.grn_item_id, storeId]
                );

                const returnedQty = parseFloat(returnedQtyResult.rows[0]?.returned_qty) || 0;
                const remainingQty = Math.max(receivedQty - returnedQty, 0);

                if (requestedQty > remainingQty) {
                    await client.query('ROLLBACK');
                    return respondWithError(req, res, 400, 'return_quantity_exceeds_remaining');
                }
            }

            totalQuantity += requestedQty;
            totalValue += requestedQty * unitCost;
        }

        // Create return
        const returnResult = await client.query(
            `INSERT INTO supplier_returns (
                store_id, supplier_id, grn_id, return_number,
                supplier_invoice_id, return_date,
                return_reason, reason_details,
                refund_method, refund_reference,
                total_items, total_quantity, total_value,
                notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
            [
                storeId, supplier_id, grn_id, return_number,
                resolvedInvoiceId, return_date || null,
                return_reason, reason_details,
                refund_method || null, refund_reference || null,
                totalItems, totalQuantity, totalValue,
                notes, userId
            ]
        );

        const supplierReturn = returnResult.rows[0];

        // Create return items
        for (const item of items) {
            const lineTotal = parseFloat(item.quantity) * parseFloat(item.unit_cost);

            await client.query(
                `INSERT INTO supplier_return_items (
                    supplier_return_id, product_id, batch_id, grn_item_id,
                    quantity, unit_cost, line_total,
                    reason, notes, condition
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    supplierReturn.id, item.product_id, item.batch_id, item.grn_item_id,
                    item.quantity, item.unit_cost, lineTotal,
                    item.reason || return_reason, item.notes, item.condition || 'damaged'
                ]
            );
        }

        await client.query('COMMIT');

        // Log action
        await logPurchaseAction(
            userId,
            'create_supplier_return',
            { return_number, supplier_id, total_value: totalValue, items_count: totalItems },
            storeId,
            req.ip
        );

        emitToStore(storeId, 'supplierReturnCreated', {
            supplierReturn,
            message: 'supplier_return_created'
        });

        res.status(201).json({
            success: true,
            message: t('supplier_return_created', lang),
            data: supplierReturn
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating supplier return:', err);
        return respondWithError(req, res, 500, 'server_error');
    } finally {
        client.release();
    }
};

/**
 * POST /api/purchases/returns/:id/approve
 * Approve supplier return and update inventory
 */
export const approveSupplierReturn = async (req, res) => {
    const { id } = req.params;
    const storeId = req.user.current_store_id;
    const userId = req.user.id;
    const lang = getLang(req);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const returnResult = await client.query(
            `SELECT * FROM supplier_returns WHERE id = $1 AND store_id = $2 FOR UPDATE`,
            [id, storeId]
        );

        if (returnResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return respondWithError(req, res, 404, 'supplier_return_not_found');
        }

        const supplierReturn = returnResult.rows[0];

        if (supplierReturn.status !== 'draft' && supplierReturn.status !== 'pending_approval') {
            await client.query('ROLLBACK');
            return respondWithError(req, res, 400, 'return_already_processed');
        }

        // Get return items
        const itemsResult = await client.query(
            `SELECT * FROM supplier_return_items WHERE supplier_return_id = $1`,
            [id]
        );

        // Reduce inventory for each item
        for (const item of itemsResult.rows) {
            // Create inventory movement (OUT)
            await client.query(
                `INSERT INTO inventory_movements (
                    store_id, product_id, batch_id, quantity,
                    type, note, created_by, transaction_date
                ) VALUES ($1, $2, $3, $4, 'OUT', $5, $6, NOW())`,
                [storeId, item.product_id, item.batch_id, item.quantity, 
                 `Return to supplier: ${supplierReturn.return_number}`, userId]
            );
        }

        // Reduce linked invoice exposure (if linked invoice exists).
        let resolvedInvoiceId = supplierReturn.supplier_invoice_id || null;
        if (!resolvedInvoiceId && supplierReturn.grn_id) {
            const autoInvoiceResult = await client.query(
                `SELECT id
                 FROM supplier_invoices
                 WHERE store_id = $1
                   AND supplier_id = $2
                   AND grn_id = $3
                 ORDER BY created_at DESC
                 LIMIT 1
                 FOR UPDATE`,
                [storeId, supplierReturn.supplier_id, supplierReturn.grn_id]
            );
            resolvedInvoiceId = autoInvoiceResult.rows[0]?.id || null;
        }

        if (resolvedInvoiceId) {
            const invoiceResult = await client.query(
                `SELECT *
                 FROM supplier_invoices
                 WHERE id = $1 AND store_id = $2
                 FOR UPDATE`,
                [resolvedInvoiceId, storeId]
            );

            if (invoiceResult.rows.length > 0) {
                const invoice = invoiceResult.rows[0];
                const returnValue = parseFloat(supplierReturn.total_value) || 0;
                const currentTotal = parseFloat(invoice.total_amount) || 0;
                const currentPaid = parseFloat(invoice.amount_paid) || 0;

                const adjustedTotal = Math.max(currentTotal - returnValue, 0);
                const adjustedPaid = Math.min(currentPaid, adjustedTotal);
                const overpaidAmount = Math.max(currentPaid - adjustedTotal, 0);

                let paymentStatus = 'unpaid';
                if (adjustedTotal === 0 || adjustedPaid >= adjustedTotal) {
                    paymentStatus = 'paid';
                } else if (adjustedPaid > 0) {
                    paymentStatus = 'partial';
                }

                const invoiceStatus = paymentStatus === 'paid' ? 'paid' : 'approved';

                await client.query(
                    `UPDATE supplier_invoices
                     SET original_total_amount = COALESCE(original_total_amount, total_amount),
                         return_deduction = COALESCE(return_deduction, 0) + $1,
                         total_amount = $2,
                         amount_paid = $3,
                         payment_status = $4,
                         status = $5,
                         updated_at = NOW()
                     WHERE id = $6`,
                    [returnValue, adjustedTotal, adjustedPaid, paymentStatus, invoiceStatus, resolvedInvoiceId]
                );

                if (overpaidAmount > 0) {
                    const refundMethod = supplierReturn.refund_method || 'credit_note';

                    if (refundMethod === 'credit_note' || refundMethod === 'apply_to_invoice') {
                        const creditNoteNumber = `SCN-${supplierReturn.return_number}`;

                        await client.query(
                            `INSERT INTO supplier_credit_notes (
                                store_id, supplier_id, supplier_return_id, supplier_invoice_id,
                                credit_note_number, credit_date, amount,
                                reason, reason_details, notes, created_by
                             ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8, $9, $10)
                             ON CONFLICT (store_id, credit_note_number) DO NOTHING`,
                            [
                                storeId,
                                supplierReturn.supplier_id,
                                supplierReturn.id,
                                resolvedInvoiceId,
                                creditNoteNumber,
                                overpaidAmount,
                                supplierReturn.return_reason || 'other',
                                supplierReturn.reason_details,
                                supplierReturn.notes,
                                userId,
                            ]
                        );

                        await client.query(
                            `UPDATE supplier_returns
                             SET credit_note_number = $1,
                                 credit_amount = $2,
                                 supplier_invoice_id = COALESCE(supplier_invoice_id, $3),
                                 updated_at = NOW()
                             WHERE id = $4`,
                            [creditNoteNumber, overpaidAmount, resolvedInvoiceId, supplierReturn.id]
                        );
                    } else {
                        await client.query(
                            `UPDATE supplier_returns
                             SET credit_amount = $1,
                                 supplier_invoice_id = COALESCE(supplier_invoice_id, $2),
                                 updated_at = NOW()
                             WHERE id = $3`,
                            [overpaidAmount, resolvedInvoiceId, supplierReturn.id]
                        );
                    }
                } else {
                    await client.query(
                        `UPDATE supplier_returns
                         SET supplier_invoice_id = COALESCE(supplier_invoice_id, $1),
                             updated_at = NOW()
                         WHERE id = $2`,
                        [resolvedInvoiceId, supplierReturn.id]
                    );
                }
            }
        }

        // Update return status
        await client.query(
            `UPDATE supplier_returns SET
                status = 'approved',
                approved_by = $1,
                approved_at = NOW(),
                updated_at = NOW()
             WHERE id = $2`,
            [userId, id]
        );

        await client.query('COMMIT');

        await logPurchaseAction(
            userId,
            'approve_supplier_return',
            { return_number: supplierReturn.return_number },
            storeId,
            req.ip
        );

        res.json({
            success: true,
            message: t('supplier_return_approved', lang)
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error approving supplier return:', err);
        return respondWithError(req, res, 500, 'server_error');
    } finally {
        client.release();
    }
};

/**
 * DELETE /api/purchases/returns/:id
 * Delete supplier return (only draft)
 */
export const deleteSupplierReturn = async (req, res) => {
    const { id } = req.params;
    const storeId = req.user.current_store_id;
    const userId = req.user.id;
    const lang = getLang(req);

    try {
        const existingReturn = await pool.query(
            `SELECT * FROM supplier_returns WHERE id = $1 AND store_id = $2`,
            [id, storeId]
        );

        if (existingReturn.rows.length === 0) {
            return respondWithError(req, res, 404, 'supplier_return_not_found');
        }

        const supplierReturn = existingReturn.rows[0];

        if (supplierReturn.status !== 'draft') {
            return respondWithError(req, res, 400, 'cannot_delete_non_draft_return');
        }

        await pool.query(`DELETE FROM supplier_returns WHERE id = $1`, [id]);

        await logPurchaseAction(
            userId,
            'delete_supplier_return',
            { return_number: supplierReturn.return_number },
            storeId,
            req.ip
        );

        res.json({
            success: true,
            message: t('supplier_return_deleted', lang)
        });
    } catch (err) {
        console.error('Error deleting supplier return:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

// =====================================================
// DASHBOARD & REPORTS
// =====================================================

/**
 * GET /api/purchases/dashboard
 * Get purchase dashboard statistics
 */
export const getPurchaseDashboard = async (req, res) => {
    const storeId = req.user.current_store_id;
    const { from_date, to_date } = req.query;

    try {
        // Default to current month
        const startDate = from_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const endDate = to_date || new Date().toISOString();

        // Get PO statistics
        const poStats = await pool.query(
            `SELECT 
                COUNT(*) AS total_orders,
                COUNT(*) FILTER (WHERE status = 'draft') AS draft_orders,
                COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending_approval,
                COUNT(*) FILTER (WHERE status = 'approved') AS approved_orders,
                COUNT(*) FILTER (WHERE status = 'received') AS received_orders,
                SUM(total_amount) AS total_po_value
             FROM purchase_orders 
             WHERE store_id = $1 AND order_date BETWEEN $2 AND $3`,
            [storeId, startDate, endDate]
        );

        // Get GRN statistics
        const grnStats = await pool.query(
            `SELECT 
                COUNT(*) AS total_grn,
                SUM(total_value) AS total_received_value
             FROM goods_received_notes 
             WHERE store_id = $1 AND received_date BETWEEN $2 AND $3 AND status = 'approved'`,
            [storeId, startDate, endDate]
        );

        // Get invoice/payment statistics
        const invoiceStats = await pool.query(
            `SELECT 
                COUNT(*) AS total_invoices,
                SUM(total_amount) AS total_invoice_value,
                SUM(amount_paid) AS total_paid,
                SUM(total_amount - amount_paid) AS total_outstanding,
                COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND payment_status != 'paid') AS overdue_invoices
             FROM supplier_invoices 
             WHERE store_id = $1 AND invoice_date BETWEEN $2 AND $3`,
            [storeId, startDate, endDate]
        );

        // Get top suppliers
        const topSuppliers = await pool.query(
            `SELECT 
                s.id, s.name,
                COUNT(po.id) AS order_count,
                SUM(po.total_amount) AS total_value
             FROM suppliers s
             LEFT JOIN purchase_orders po ON s.id = po.supplier_id AND po.order_date BETWEEN $2 AND $3
             WHERE s.store_id = $1
             GROUP BY s.id, s.name
             ORDER BY total_value DESC NULLS LAST
             LIMIT 5`,
            [storeId, startDate, endDate]
        );

        // Get recent activities
        const recentActivity = await pool.query(
            `(SELECT 'po' AS type, po_number AS ref_number, status, total_amount, created_at 
              FROM purchase_orders WHERE store_id = $1 ORDER BY created_at DESC LIMIT 5)
             UNION ALL
             (SELECT 'grn' AS type, grn_number AS ref_number, status, total_value AS total_amount, created_at 
              FROM goods_received_notes WHERE store_id = $1 ORDER BY created_at DESC LIMIT 5)
             ORDER BY created_at DESC LIMIT 10`,
            [storeId]
        );

        res.json({
            success: true,
            data: {
                purchase_orders: poStats.rows[0],
                goods_received: grnStats.rows[0],
                invoices: invoiceStats.rows[0],
                top_suppliers: topSuppliers.rows,
                recent_activity: recentActivity.rows,
                period: { from: startDate, to: endDate }
            }
        });
    } catch (err) {
        console.error('Error fetching purchase dashboard:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

/**
 * GET /api/purchases/supplier/:supplierId/statement
 * Get supplier account statement
 */
export const getSupplierStatement = async (req, res) => {
    const { supplierId } = req.params;
    const storeId = req.user.current_store_id;
    const { from_date, to_date } = req.query;

    try {
        // Verify supplier exists
        const supplierResult = await pool.query(
            `SELECT * FROM suppliers WHERE id = $1 AND store_id = $2`,
            [supplierId, storeId]
        );

        if (supplierResult.rows.length === 0) {
            return respondWithError(req, res, 404, 'supplier_not_found');
        }

        const supplier = supplierResult.rows[0];

        let dateFilter = '';
        const params = [storeId, supplierId];

        if (from_date && to_date) {
            dateFilter = ' AND created_at BETWEEN $3 AND $4';
            params.push(from_date, to_date);
        }

        // Get all transactions (invoices, payments, credit notes)
        const transactions = await pool.query(
            `SELECT * FROM (
                SELECT 
                    'invoice' AS type,
                    bill_number AS reference,
                    invoice_date AS date,
                    total_amount AS debit,
                    0 AS credit,
                    notes,
                    created_at
                FROM supplier_invoices
                WHERE store_id = $1 AND supplier_id = $2 ${dateFilter}
                
                UNION ALL
                
                SELECT 
                    'payment' AS type,
                    payment_number AS reference,
                    payment_date AS date,
                    0 AS debit,
                    amount AS credit,
                    notes,
                    created_at
                FROM supplier_payments
                WHERE store_id = $1 AND supplier_id = $2 AND status = 'completed' ${dateFilter}
                
                UNION ALL
                
                SELECT 
                    'credit_note' AS type,
                    credit_note_number AS reference,
                    credit_date AS date,
                    0 AS debit,
                    amount AS credit,
                    reason_details AS notes,
                    created_at
                FROM supplier_credit_notes
                WHERE store_id = $1 AND supplier_id = $2 ${dateFilter}
            ) AS transactions
            ORDER BY date ASC, created_at ASC`,
            params
        );

        // Calculate running balance
        let balance = 0;
        const statement = transactions.rows.map(tx => {
            balance = balance + parseFloat(tx.debit || 0) - parseFloat(tx.credit || 0);
            return {
                ...tx,
                balance
            };
        });

        res.json({
            success: true,
            data: {
                supplier,
                transactions: statement,
                summary: {
                    total_invoiced: statement.reduce((sum, tx) => sum + parseFloat(tx.debit || 0), 0),
                    total_paid: statement.reduce((sum, tx) => sum + parseFloat(tx.credit || 0), 0),
                    current_balance: balance
                }
            }
        });
    } catch (err) {
        console.error('Error fetching supplier statement:', err);
        return respondWithError(req, res, 500, 'server_error');
    }
};

