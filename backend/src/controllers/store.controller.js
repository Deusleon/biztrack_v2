import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
import * as _n4 from 'bcryptjs';
const bcrypt = _n4.default ?? _n4;
// Create a new store with default settings
export const createStore = async (req, res) => {
  const { name, store_code, location } = req.body || {};
  const lang = req.user.lang || req.headers["x-language"] || "en";
  if (!String(name || '').trim() || !String(store_code || '').trim()) {
    return res.status(400).json({ message: t("all_fields_required", lang) });
  }
  const codeToCheck = store_code.trim();
  const userId = req.user.id;
  const logDescription = {
    store_name: name,
    store_code: store_code,
    location: location,
  };

  try {
    // Check if store already exists for this user
    const storeExists = await pool.query(
      "SELECT * FROM stores WHERE LOWER(name) = LOWER($1) AND owner_id = $2",
      [name, userId]
    );

    if (storeExists.rows.length > 0) {
      return res.status(400).json({ message: t("store_exists", lang) });
    }

    // Check if store code already exists
    const storeCodeExists = await pool.query(
      "SELECT * FROM stores WHERE store_code = $1",
      [codeToCheck]
    );
    if (storeCodeExists.rows.length > 0) {
      return res.status(400).json({ message: t("store_code_exists", lang) });
    }

    // Begin transaction
    await pool.query("BEGIN");

    // Save new store
    const newStore = await pool.query(
      "INSERT INTO stores (name, location, owner_id, store_code) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, location, userId, codeToCheck]
    );

    const storeId = newStore.rows[0].id;

    // Get Owner role id from roles table
    const ownerRole = await pool.query("SELECT id FROM roles WHERE name = $1", [
      "Owner",
    ]);

    if (ownerRole.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(500).json({ message: t("owner_role_not_found", lang) });
    }

    const roleId = ownerRole.rows[0].id;

    // Add user role to store_users
    await pool.query(
      "INSERT INTO store_users (role_id, status, store_id, user_id) VALUES ($1, $2, $3, $4)",
      [roleId, true, storeId, userId]
    );

    // Grant all permissions to the Owner role for this new store
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id, is_allowed, store_id)
       SELECT $1, id, true, $2
       FROM permissions
       ON CONFLICT (role_id, permission_id, store_id) DO NOTHING`,
      [roleId, storeId]
    );

    // ----------------------------
    // Insert default store_settings
    // ----------------------------
    const packageResult = await pool.query(
      "SELECT package_options FROM package_settings LIMIT 1"
    );

    if (packageResult.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res
        .status(500)
        .json({ message: t("package_settings_missing", lang) });
    }

    const defaultStoreSettings = packageResult.rows[0].package_options;

    await pool.query(
      "INSERT INTO store_settings (store_id, settings) VALUES ($1, $2)",
      [storeId, defaultStoreSettings]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id)  VALUES ($1, $2, $3, $4, $5)",
      [userId, "create_store", JSON.stringify(logDescription), null, storeId]
    );

    // Commit transaction
    await pool.query("COMMIT");

    const io = getIO();
    io.to(`user_${userId}`).emit("storeCreated", {
      message: t("store_created", lang),
      store: newStore.rows[0],
    });

    return res.status(201).json({
      message: t("store_created", lang),
      store: newStore.rows[0],
    });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("Create store error:", err);
    return res.status(500).json({ message: t("server_error", lang) });
  }
};

// Get all stores the user has access to (owned or assigned via store_users)
export const getMyStores = async (req, res) => {
  const lang = req.user.lang || req.headers["x-language"] || "en";
  const userId = req.user.id;

  try {
    const stores = await pool.query(
      `SELECT DISTINCT s.* FROM stores s
       LEFT JOIN store_users su ON s.id = su.store_id
       WHERE s.owner_id = $1 OR su.user_id = $1
       ORDER BY s.created_at ASC`,
      [userId]
    );

    res.status(200).json({ stores: stores.rows });
  } catch (err) {
    console.error("Get stores error:", err.message);
    respondWithError(req, res, 500, 'server_error')
  }
};

// Get default store from configuration
export const getDefaultStore = async (req, res) => {
  const lang = req.user.lang || req.headers["x-language"] || "en";

  try {
    // Fetch system settings
    const settingsResult = await pool.query(
      "SELECT settings FROM system_settings LIMIT 1"
    );
    if (settingsResult.rows.length === 0) {
      return res.status(200).json({ store: null });
    }

    const settings = settingsResult.rows[0].settings;

    // Extract default store ID from JSONB
    const defaultStoreId = settings?.systemDefaults?.defaultStore || null;

    if (!defaultStoreId) {
      return res.status(200).json({ store: null });
    }

    // Fetch store by UUID
    const storeResult = await pool.query("SELECT * FROM stores WHERE id = $1", [
      defaultStoreId,
    ]);

    if (storeResult.rows.length > 0) {
      return res.status(200).json({ store: storeResult.rows[0] });
    }

    // If store does not exist
    return res.status(200).json({ store: null });
  } catch (err) {
    console.error("Get default store error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

// Update a store
export const updateStore = async (req, res) => {
  const { id } = req.params;
  const { name, store_code, location } = req.body;
  const lang = req.user.lang || req.headers["x-language"] || "en";
  const userId = req.user.id;

  try {
    // Check if store exists and belongs to user
    const store = await pool.query(
      "SELECT * FROM stores WHERE id = $1 AND owner_id = $2",
      [id, userId]
    );

    if (store.rows.length === 0) {
      return res.status(404).json({ message: t("store_not_found", lang) });
    }

    const logDescription = {
      old: {
        store_name: store.rows[0].name,
        store_code: store.rows[0].store_code,
        location: store.rows[0].location,
      },
      new: {
        store_name: name,
        store_code: store_code,
        location: location,
      },
    };

    // Check for duplicate name within user's other stores
    const nameExists = await pool.query(
      "SELECT 1 FROM stores WHERE LOWER(name) = LOWER($1) AND owner_id = $2 AND id != $3",
      [name, userId, id]
    );
    if (nameExists.rows.length > 0) {
      return res.status(400).json({ message: t("store_exists", lang) });
    }

    // Check for duplicate store_code globally (excluding current store)
    const codeExists = await pool.query(
      "SELECT 1 FROM stores WHERE store_code = $1 AND id != $2",
      [store_code, id]
    );
    if (codeExists.rows.length > 0) {
      return res.status(400).json({ message: t("store_code_exists", lang) });
    }

    // Update store
    const updatedStore = await pool.query(
      "UPDATE stores SET name = $1, store_code = $2, location = $3 WHERE id = $4 RETURNING *",
      [name, store_code, location, id]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id)  VALUES ($1, $2, $3, $4, $5)",
      [userId, "update_store", JSON.stringify(logDescription), null, id]
    );

    const io = getIO();
    io.to(`user_${userId}`).emit("storeUpdated", {
      message: t("store_updated", lang),
      store: updatedStore.rows[0],
    });

    return res.status(200).json({
      message: t("store_updated", lang),
      store: updatedStore.rows[0],
    });
  } catch (err) {
    console.error("Update store error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

// Delete a store
export const deleteStore = async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};
  const userId = req.user.id;
  const currentStoreId = req.user.current_store_role?.store_id;
  const isCurrentStore = currentStoreId === id;
  const lang = req.user.lang || req.headers["x-language"] || "en";

  if (!password) {
    return res.status(400).json({ message: t("password_required") });
  }

  try {
    // Check if store exists and belongs to user
    const store = await pool.query(
      "SELECT * FROM stores WHERE id = $1 AND owner_id = $2",
      [id, userId]
    );

    if (store.rows.length === 0) {
      return res.status(404).json({ message: t("store_not_found", lang) });
    }

    // If store found then verify password
    const passRes = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [userId]
    );
    const user = passRes.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: t("invalid_password", lang) });
    }

    // Prepare delete log
    const logDescription = {
      storeId: id,
      store_name: store.rows[0].name,
      store_code: store.rows[0].store_code,
      location: store.rows[0].location,
    };

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id) VALUES ($1, $2, $3, $4, $5)",
      [userId, "delete_store", JSON.stringify(logDescription), null, id]
    );

    // If password is valid then Delete store
    await pool.query("DELETE FROM stores WHERE id = $1", [id]);

    const io = getIO();
    io.to(`user_${userId}`).emit("storeDeleted", {
      id: id,
      message: t("store_deleted", lang),
    });

    if (isCurrentStore) {
      return res.status(401).json({ message: t("store_deleted", lang) });
    } else {
      res.status(200).json({
        message: t("store_deleted", lang),
        current_store_deleted: isCurrentStore,
      });
    }
  } catch (err) {
    console.error("Delete store error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

