import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
import { cleanPhone } from '../utils/helpers.js';
// Get all customers in a store
export const getStoreCustomers = async (req, res) => {
    const storeId = req.user?.current_store_id || req.params.storeId;
    const lang = getLang(req);
    const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || '';

    try {
        const searchFilter = search ? `AND (c.name ILIKE $2 OR c.phone ILIKE $2 OR c.email ILIKE $2)` : '';
        const countParams  = search ? [storeId, `%${search}%`] : [storeId];

        const countRes = await pool.query(
            `SELECT COUNT(*) FROM customers c WHERE c.store_id = $1 ${searchFilter}`,
            countParams
        );
        const total = parseInt(countRes.rows[0].count, 10);

        const dataParams = search
            ? [storeId, `%${search}%`, limit, offset]
            : [storeId, limit, offset];
        const limitIdx  = search ? 3 : 2;
        const offsetIdx = search ? 4 : 3;

        const result = await pool.query(
            `SELECT * FROM customers c WHERE c.store_id = $1 ${searchFilter} ORDER BY c.name ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            dataParams
        );

        res.status(200).json({
            message: t('store_customers_listed', lang),
            customers: result.rows,
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
        console.error('Get store customers error:', err.message);
        respondWithError(req, res, 500, 'server_error');
    }
};

// Create a new customer
export const createCustomer = async (req, res) => {
    const { name, phone, email, address, customer_type, credit_limit, credit_due_days } = req.body;
    const storeId = req.user?.current_store_id || req.headers['x-store-id'];
    const userId = req.user?.id;
    const lang = getLang(req);

    const nameText = name.trim();
    const phoneText = cleanPhone(phone);
    const emailText = email?.trim() || null;
    const addressText = address?.trim() || null;
    const typeText = customer_type?.trim() || null;

    try {
        // Check duplicate name in store
        const existing = await pool.query(
            `SELECT 1 FROM customers WHERE store_id = $1 AND LOWER(name) = LOWER($2)`,
            [storeId, nameText]
        );
        if (existing.rows.length > 0) {
            return respondWithError(req, res, 400, 'customer_exists');
        }

        // Check duplicate phone if provided
        if (phoneText) {
            const phoneExists = await pool.query(
                `SELECT 1 FROM customers WHERE store_id = $1 AND phone = $2`,
                [storeId, phoneText]
            );
            if (phoneExists.rows.length > 0) {
                return respondWithError(req, res, 400, 'customer_phone_exists');
            }
        }

        const result = await pool.query(
            `INSERT INTO customers (store_id, name, phone, email, address, customer_type, credit_limit, credit_due_days, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [storeId, nameText, phoneText, emailText, addressText, typeText, credit_limit || 0, credit_due_days || 0, userId]
        );

        await pool.query(
            "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
            [userId, "create_customer", JSON.stringify(result.rows[0]), null, storeId]
        );

        const io = getIO();
        io.to(`user_${userId}`).emit("customerCreated", {
            message: t("customer_created", lang),
            customer: result.rows[0],
        });

        res.status(201).json({
            message: t('customer_created', lang),
            customer: result.rows[0],
        });
    } catch (err) {
        console.error('Create customer error:', err.message);
        respondWithError(req, res, 500, 'server_error');
    }
};

// Update customer
export const updateCustomer = async (req, res) => {
    const { id } = req.params;
    const { name, phone, email, address, customer_type, credit_limit, credit_due_days } = req.body;
    const storeId = req.user?.current_store_id || req.headers['x-store-id'];
    const userId = req.user?.id;
    const lang = getLang(req);

    try {
        const customer = await pool.query(
            "SELECT * FROM customers WHERE id = $1 AND store_id = $2",
            [id, storeId]
        );
        if (customer.rows.length === 0) {
            return respondWithError(req, res, 404, 'customer_not_found');
        }

        // Check duplicate name (excluding current)
        const duplicateCheck = await pool.query(
            `SELECT 1 FROM customers WHERE store_id = $1 AND LOWER(name) = LOWER($2) AND id != $3`,
            [storeId, name, id]
        );
        if (duplicateCheck.rows.length > 0) {
            return respondWithError(req, res, 400, 'customer_exists');
        }

        // Check duplicate phone (excluding current)
        const phoneText = cleanPhone(phone);
        if (phoneText) {
            const phoneCheck = await pool.query(
                `SELECT 1 FROM customers WHERE store_id = $1 AND phone = $2 AND id != $3`,
                [storeId, phoneText, id]
            );
            if (phoneCheck.rows.length > 0) {
                return respondWithError(req, res, 400, 'customer_phone_exists');
            }
        }

        const result = await pool.query(
            `UPDATE customers
             SET name = $1, phone = $2, email = $3, address = $4, customer_type = $5,
                 credit_limit = $6, credit_due_days = $7, updated_at = NOW()
             WHERE id = $8 AND store_id = $9
             RETURNING *`,
            [name, phoneText || null, email || null, address || null, customer_type || null, credit_limit || 0, credit_due_days || 0, id, storeId]
        );

        await pool.query(
            "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
            [userId, "update_customer", JSON.stringify({ old: customer.rows[0], new: result.rows[0] }), null, storeId]
        );

        const io = getIO();
        io.to(`user_${userId}`).emit("customerUpdated", {
            message: t("customer_updated", lang),
            customer: result.rows[0],
        });

        res.status(200).json({
            message: t('customer_updated', lang),
            customer: result.rows[0],
        });
    } catch (err) {
        console.error('Update customer error:', err.message);
        respondWithError(req, res, 500, 'server_error');
    }
};

// Delete customer
export const deleteCustomer = async (req, res) => {
    const { id } = req.params;
    const storeId = req.user?.current_store_id || req.headers['x-store-id'];
    const userId = req.user?.id;
    const lang = getLang(req);

    try {
        const customer = await pool.query(
            "SELECT * FROM customers WHERE id = $1 AND store_id = $2",
            [id, storeId]
        );
        if (customer.rows.length === 0) {
            return respondWithError(req, res, 404, 'customer_not_found');
        }

        await pool.query("DELETE FROM customers WHERE id = $1", [id]);

        await pool.query(
            "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
            [userId, "delete_customer", JSON.stringify(customer.rows[0]), null, storeId]
        );

        const io = getIO();
        io.to(`user_${userId}`).emit("customerDeleted", {
            message: t("customer_deleted", lang),
            id,
        });

        res.status(200).json({ message: t('customer_deleted', lang) });
    } catch (err) {
        console.error('Delete customer error:', err.message);
        respondWithError(req, res, 500, 'server_error');
    }
};

