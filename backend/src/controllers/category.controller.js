import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
// Add a new category
export const addCategory = async (req, res) => {
  const { name, description } = req.body;
  const storeId = req.user?.current_store_id || req.headers["x-store-id"];
  const userId = req.user?.id;
  const lang = req.user?.preferred_language || req.headers["x-language"] || "en";

  const nameText = name.trim();
  const descriptionText = description?.trim() || null;

  try {
    // Check duplicate
    const existing = await pool.query(
      `SELECT 1 FROM product_categories WHERE store_id = $1 AND LOWER(name) = LOWER($2)`,
      [storeId, nameText]
    );

    if (existing.rows.length > 0) {
      return respondWithError(req, res, 400, "category_exists");
    }

    const result = await pool.query(
      `INSERT INTO product_categories (store_id, name, description)
             VALUES ($1, $2, $3)
             RETURNING *`,
      [storeId, nameText, descriptionText]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id)  VALUES ($1, $2, $3, $4, $5)",
      [userId, "create_category", JSON.stringify(result.rows[0]), null, storeId]
    );

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("categoryCreated", {
      message: t("category_created", lang),
      category: result.rows[0],
    });
    res.status(201).json({
      message: t("category_added", getLang(req)),
      category: result.rows[0],
    });
  } catch (err) {
    console.error("Add category error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Get all categories for a store
export const getCategories = async (req, res) => {
  const storeId = req.user?.current_store_id || req.headers["x-store-id"] || req.params.storeId;
  const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const search = req.query.search?.trim() || '';

  try {
    const searchFilter = search ? `AND (pc.name ILIKE $2 OR pc.description ILIKE $2)` : '';
    const countParams  = search ? [storeId, `%${search}%`] : [storeId];

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM product_categories pc WHERE pc.store_id = $1 ${searchFilter}`,
      countParams
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataParams = search
      ? [storeId, `%${search}%`, limit, offset]
      : [storeId, limit, offset];
    const limitIdx  = search ? 3 : 2;
    const offsetIdx = search ? 4 : 3;

    const result = await pool.query(
      `SELECT * FROM product_categories pc WHERE pc.store_id = $1 ${searchFilter} ORDER BY pc.name ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams
    );

    res.status(200).json({
      message: t("categories_fetched", getLang(req)),
      categories: result.rows,
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
    console.error("Get categories error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Update category
export const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const storeId = req.user?.current_store_id || req.headers["x-store-id"];
  const userId = req.user?.id;

  try {
    const category = await pool.query(
      "SELECT * FROM product_categories WHERE id = $1 AND store_id = $2",
      [id, storeId]
    );
    if (category.rows.length === 0) {
      return respondWithError(req, res, 404, "category_not_found");
    }

    // Check duplicate (excluding current category)
    const duplicateCheck = await pool.query(
      `SELECT 1 FROM product_categories WHERE store_id = $1 AND LOWER(name) = LOWER($2) AND id != $3`,
      [storeId, name, id]
    );

    if (duplicateCheck.rows.length > 0) {
      return respondWithError(req, res, 400, "category_exists");
    }

    const logDescription = {
      old: {
        category_name: category.rows[0].name,
        description: category.rows[0].description,
      },
      new: {
        category_name: name,
        description: description,
      },
    };

    const result = await pool.query(
      `UPDATE product_categories
             SET name = $1, description = $2, updated_at = NOW()
             WHERE id = $3 AND store_id = $4
             RETURNING *`,
      [name, description, id, storeId]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id)  VALUES ($1, $2, $3, $4, $5)",
      [userId, "update_category", JSON.stringify(logDescription), null, storeId]
    );
    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("categoryUpdated", {
      message: t("category_updated", getLang(req)),
      category: result.rows[0],
    });
    res.status(200).json({
      message: t("category_updated", getLang(req)),
      category: result.rows[0],
    });
  } catch (err) {
    console.error("Update category error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Delete category
export const deleteCategory = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user?.current_store_id || req.headers["x-store-id"];
  const userId = req.user?.id;

  try {
    const category = await pool.query(
      "SELECT * FROM product_categories WHERE id = $1",
      [id]
    );
    if (category.rows.length === 0) {
      return respondWithError(req, res, 404, "category_not_found");
    }
    
    const logDescription = { 
      category_name: category.rows[0].name,
      description: category.rows[0].description
     };

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id)  VALUES ($1, $2, $3, $4, $5)",
      [userId, "delete_category", JSON.stringify(logDescription), null, storeId]
    );

    await pool.query("DELETE FROM product_categories WHERE id = $1 AND store_id = $2", [id, storeId]);

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("categoryDeleted", {
      message: t("category_deleted", getLang(req)),
      id: category.rows[0].id,
    });
    res.status(200).json({ message: t("category_deleted", getLang(req)) });
  } catch (err) {
    console.error("Delete category error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

