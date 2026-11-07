import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
// Add a new supplier
export const addSupplier = async (req, res) => {
  const { name, contact_person, email, phone, address, city, country, tin_number, vat_number, payment_terms, notes } = req.body;
  const storeId = req.user?.current_store_id || req.headers["x-store-id"];
  const userId = req.user?.id;
  const lang = req.user?.preferred_language || req.headers["x-language"] || "en";

  const nameText = name.trim();
  const contactPersonText = contact_person?.trim() || null;
  const emailText = email?.trim() || null;
  const phoneText = phone?.trim() || null;
  const addressText = address?.trim() || null;
  const cityText = city?.trim() || null;
  const countryText = country?.trim() || null;
  const tinNumberText = tin_number?.trim() || null;
  const vatNumberText = vat_number?.trim() || null;
  const paymentTermsText = payment_terms?.trim() || null;
  const notesText = notes?.trim() || null;

  try {
    // Check duplicate supplier name
    const existing = await pool.query(
      `SELECT 1 FROM suppliers WHERE store_id = $1 AND LOWER(name) = LOWER($2)`,
      [storeId, nameText]
    );

    if (existing.rows.length > 0) {
      return respondWithError(req, res, 400, "supplier_exists");
    }

    // Check duplicate email if provided
    if (emailText) {
      const emailExists = await pool.query(
        `SELECT 1 FROM suppliers WHERE store_id = $1 AND LOWER(email) = LOWER($2)`,
        [storeId, emailText]
      );

      if (emailExists.rows.length > 0) {
        return respondWithError(req, res, 400, "supplier_email_exists");
      }
    }

    const result = await pool.query(
      `INSERT INTO suppliers (store_id, name, contact_person, email, phone, address, city, country, tin_number, vat_number, payment_terms, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [storeId, nameText, contactPersonText, emailText, phoneText, addressText, cityText, countryText, tinNumberText, vatNumberText, paymentTermsText, notesText]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
      [userId, "create_supplier", JSON.stringify(result.rows[0]), null, storeId]
    );

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("supplierCreated", {
      message: t("supplier_created", lang),
      supplier: result.rows[0],
    });

    res.status(201).json({
      message: t("supplier_added", getLang(req)),
      supplier: result.rows[0],
    });
  } catch (err) {
    console.error("Add supplier error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Get all suppliers for a store
export const getSuppliers = async (req, res) => {
  const storeId = req.user?.current_store_id || req.headers["x-store-id"] || req.params.storeId;
  const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const search = req.query.search?.trim() || '';

  try {
    const searchFilter = search ? `AND (s.name ILIKE $2 OR s.contact_person ILIKE $2 OR s.email ILIKE $2 OR s.phone ILIKE $2)` : '';
    const countParams  = search ? [storeId, `%${search}%`] : [storeId];

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM suppliers s WHERE s.store_id = $1 ${searchFilter}`,
      countParams
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataParams = search
      ? [storeId, `%${search}%`, limit, offset]
      : [storeId, limit, offset];
    const limitIdx  = search ? 3 : 2;
    const offsetIdx = search ? 4 : 3;

    const result = await pool.query(
      `SELECT * FROM suppliers s WHERE s.store_id = $1 ${searchFilter} ORDER BY s.name ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams
    );

    res.status(200).json({
      message: t("suppliers_fetched", getLang(req)),
      suppliers: result.rows,
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
    console.error("Get suppliers error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Update supplier
export const updateSupplier = async (req, res) => {
  const { id } = req.params;
  const { name, contact_person, email, phone, address, city, country, tin_number, vat_number, payment_terms, notes } = req.body;
  const storeId = req.user?.current_store_id || req.headers["x-store-id"];
  const userId = req.user?.id;

  try {
    const supplier = await pool.query(
      "SELECT * FROM suppliers WHERE id = $1 AND store_id = $2",
      [id, storeId]
    );

    if (supplier.rows.length === 0) {
      return respondWithError(req, res, 404, "supplier_not_found");
    }

    // Check duplicate name (excluding current supplier)
    const duplicateCheck = await pool.query(
      `SELECT 1 FROM suppliers WHERE store_id = $1 AND LOWER(name) = LOWER($2) AND id != $3`,
      [storeId, name, id]
    );

    if (duplicateCheck.rows.length > 0) {
      return respondWithError(req, res, 400, "supplier_exists");
    }

    // Check duplicate email (excluding current supplier)
    if (email) {
      const emailCheck = await pool.query(
        `SELECT 1 FROM suppliers WHERE store_id = $1 AND LOWER(email) = LOWER($2) AND id != $3`,
        [storeId, email, id]
      );

      if (emailCheck.rows.length > 0) {
        return respondWithError(req, res, 400, "supplier_email_exists");
      }
    }

    const logDescription = {
      old: supplier.rows[0],
      new: { name: name, contact_person:contact_person, email: email, phone: phone, address: address, city: city, country: country, tin_number: tin_number, vat_number: vat_number, payment_terms: payment_terms, notes: notes },
    };

    const result = await pool.query(
      `UPDATE suppliers
       SET name = $1, contact_person = $2, email = $3, phone = $4, address = $5, 
           city = $6, country = $7, tin_number = $8, vat_number = $9, payment_terms = $10, notes = $11, updated_at = NOW()
       WHERE id = $12 AND store_id = $13
       RETURNING *`,
      [name, contact_person, email, phone, address, city, country, tin_number, vat_number, payment_terms, notes, id, storeId]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
      [userId, "update_supplier", JSON.stringify(logDescription), null, storeId]
    );

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("supplierUpdated", {
      message: t("supplier_updated", getLang(req)),
      supplier: result.rows[0],
    });

    res.status(200).json({
      message: t("supplier_updated", getLang(req)),
      supplier: result.rows[0],
    });
  } catch (err) {
    console.error("Update supplier error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Delete supplier
export const deleteSupplier = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user?.current_store_id || req.headers["x-store-id"] || req.body.storeId;
  const userId = req.user?.id;

  try {
    const supplier = await pool.query(
      "SELECT * FROM suppliers WHERE id = $1 AND store_id = $2",
      [id, storeId]
    );

    if (supplier.rows.length === 0) {
      return respondWithError(req, res, 404, "supplier_not_found");
    }

    await pool.query("DELETE FROM suppliers WHERE id = $1", [id]);

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
      [userId, "delete_supplier", JSON.stringify(supplier.rows[0]), null, storeId]
    );

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("supplierDeleted", {
      message: t("supplier_deleted", getLang(req)),
      id,
    });

    res.status(200).json({ message: t("supplier_deleted", getLang(req)) });
  } catch (err) {
    console.error("Delete supplier error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

