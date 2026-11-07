import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
// Add a new price category
export const addPriceCategory = async (req, res) => {
  const { name, description } = req.body;
  const storeId = req.user?.current_store_id || req.headers["x-store-id"];
  const userId = req.user?.id;
  const ip = req.ip;

  const nameText = name.trim();
  const descriptionText = description?.trim() || null;

  try {
    // Check duplicate
    const existing = await pool.query(
      `SELECT 1 FROM price_categories WHERE store_id = $1 AND LOWER(name) = LOWER($2)`,
      [storeId, nameText]
    );

    if (existing.rows.length > 0) {
      return respondWithError(req, res, 400, "price_category_exists");
    }

    const result = await pool.query(
      `INSERT INTO price_categories (store_id, name, description, is_active)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
      [storeId, nameText, descriptionText, true]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
      [
        userId,
        "create_price_category",
        JSON.stringify(result.rows[0]),
        ip,
        storeId,
      ]
    );

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("priceCategoryCreated", {
      message: t("price_category_created", getLang(req)),
      priceCategory: result.rows[0],
    });

    res.status(201).json({
      message: t("price_category_created", getLang(req)),
      priceCategory: result.rows[0],
    });
  } catch (err) {
    console.error("Add price category error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Get all price categories for a store
export const getPriceCategories = async (req, res) => {
  const storeId =
    req.user?.current_store_id ||
    req.headers["x-store-id"] ||
    req.params.storeId;

  try {
    const result = await pool.query(
      "SELECT * FROM price_categories WHERE store_id = $1 ORDER BY name ASC",
      [storeId]
    );

    res.status(200).json({
      message: t("price_categories_fetched", getLang(req)),
      priceCategories: result.rows,
    });
  } catch (err) {
    console.error("Get price categories error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Update price category
export const updatePriceCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const storeId = req.user?.current_store_id || req.headers["x-store-id"];
  const userId = req.user?.id;
  const ip = req.ip;

  try {
    const priceCategory = await pool.query(
      "SELECT * FROM price_categories WHERE id = $1 AND store_id = $2",
      [id, storeId]
    );
    if (priceCategory.rows.length === 0) {
      return respondWithError(req, res, 404, "price_category_not_found");
    }

    // Check duplicate (excluding current price category)
    const duplicateCheck = await pool.query(
      `SELECT 1 FROM price_categories WHERE store_id = $1 AND LOWER(name) = LOWER($2) AND id != $3`,
      [storeId, name, id]
    );

    if (duplicateCheck.rows.length > 0) {
      return respondWithError(req, res, 400, "price_category_exists");
    }

    const logDescription = {
      old: {
        category_name: priceCategory.rows[0].name,
        description: priceCategory.rows[0].description,
      },
      new: {
        category_name: name,
        description: description,
      },
    };

    const result = await pool.query(
      `UPDATE price_categories 
       SET name = $1, description = $2
       WHERE id = $3 AND store_id = $4
       RETURNING *`,
      [name, description, id, storeId]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
      [userId, "update_price_category", JSON.stringify(logDescription), ip, storeId]
    );

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("priceCategoryUpdated", {
      message: t("price_category_updated", req.user?.preferred_language),
      priceCategory: result.rows[0],
    });

    res.status(200).json({
      message: t("price_category_updated", getLang(req)),
      priceCategory: result.rows[0],
    });
  } catch (err) {
    console.error("Update price category error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

// Delete price category
export const deletePriceCategory = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user?.current_store_id || req.headers["x-store-id"];
  const userId = req.user?.id;
  const ip = req.ip;

  try {
    const priceCategory = await pool.query(
      "SELECT * FROM price_categories WHERE id = $1 AND store_id = $2",
      [id, storeId]
    );

    if (priceCategory.rows.length === 0) {
      return respondWithError(req, res, 404, "price_category_not_found");
    }

    const logDescription = {
      category_name: priceCategory.rows[0].name,
      description: priceCategory.rows[0].description,
    };

    await pool.query("DELETE FROM price_categories WHERE id = $1", [id]);

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
      [userId, "delete_price_category", JSON.stringify(logDescription), ip, storeId]
    );

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("priceCategoryDeleted", {
      message: t("price_category_deleted", req.user?.preferred_language),
      id,
    });

    res.status(200).json({
      message: t("price_category_deleted", getLang(req)),
    });
  } catch (err) {
    console.error("Delete price category error:", err.message);
    respondWithError(req, res, 500, "server_error");
  }
};

