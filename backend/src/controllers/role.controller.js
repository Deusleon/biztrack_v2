import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
// Add a new role
export const addRole = async (req, res) => {
  const { name, description } = req.body;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";
  const storeId = req.user.current_store_id;
  const userId = req.user.id;

  try {
    const existingRole = await pool.query(
      "SELECT * FROM roles WHERE name = $1 AND store_id = $2",
      [name, storeId]
    );
    if (existingRole.rows.length > 0) {
      return res.status(400).json({ message: t("role_exists", lang) });
    }

    const newRole = await pool.query(
      `INSERT INTO roles (store_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
      [storeId, name, description]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id)  VALUES ($1, $2, $3, $4, $5)",
      [userId, "create_role", JSON.stringify(newRole.rows[0]), null, storeId]
    );

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("roleCreated", {
      message: t("role_added", lang),
      role: newRole.rows[0],
    });

    res.status(201).json({
      message: t("role_added", lang),
      role: newRole.rows[0],
    });
  } catch (err) {
    console.error("Add role error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

// Get all roles
export const getRoles = async (req, res) => {
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";
  const storeId = req.user.current_store_id;

  try {
    const roles = await pool.query("SELECT * FROM roles WHERE store_id = $1 AND name != 'Owner' AND name != 'Pending'", [
      storeId,
    ]);

    // Count users per role
    const rolesUsersCounts = await pool.query(
      `SELECT r.id, COUNT(su.user_id) AS user_count
       FROM roles r
       LEFT JOIN store_users su 
         ON r.id = su.role_id AND su.store_id = $1
       WHERE r.store_id = $1 AND r.name != 'Owner' AND r.name != 'Pending'
       GROUP BY r.id`,
      [storeId]
    );

    // Merge counts into roles list
    const rolesWithCount = roles.rows.map((role) => {
      const countObj = rolesUsersCounts.rows.find((r) => r.id === role.id);
      return {
        ...role,
        user_count: countObj ? Number(countObj.user_count) : 0,
      };
    });

    res.status(200).json({
      message: t("roles_fetched", lang),
      roles: rolesWithCount,
    });
  } catch (err) {
    console.error("Get roles error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

// Update a role
export const updateRole = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";

  try {
    const role = await pool.query(
      "SELECT * FROM roles WHERE id = $1 AND store_id = $2",
      [id, storeId]
    );
    if (role.rows.length === 0) {
      return res.status(404).json({ message: t("role_not_found", lang) });
    }

    // Ensure case insensitivity by converting the name to lowercase
    const lowerCaseName = name.toLowerCase();

    // Check if the role name already exists for another role, case-insensitive
    const existingRole = await pool.query(
      "SELECT * FROM roles WHERE LOWER(name) = $1 AND id != $2 AND store_id = $3",
      [lowerCaseName, id, storeId]
    );
    if (existingRole.rows.length > 0) {
      return res.status(400).json({ message: t("role_exists", lang) });
    }

    const logDescription = {
      old: {
        role_name: role.rows[0].name,
        description: role.rows[0].description,
      },
      new: {
        role_name: name,
        description: description,
      },
    };

    const updatedRole = await pool.query(
      `UPDATE roles SET name = $1, description = $2 WHERE id = $3 AND store_id = $4 RETURNING *`,
      [name, description, id, storeId]
    );

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id)  VALUES ($1, $2, $3, $4, $5)",
      [
        userId,
        "update_role",
        JSON.stringify(logDescription),
        null,
        storeId,
      ]
    );

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("roleUpdated", {
      message: t("role_updated", lang),
      role: updatedRole.rows[0],
    });
    res.status(200).json({
      message: t("role_updated", lang),
      role: updatedRole.rows[0],
    });
  } catch (err) {
    console.error("Update role error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

// Delete a role
export const deleteRole = async (req, res) => {
  const { id } = req.params;
  const storeId = req.user.current_store_id;
  const userId = req.user.id;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";

  try {
    const role = await pool.query(
      "SELECT * FROM roles WHERE id = $1 AND store_id = $2",
      [id, storeId]
    );
    if (role.rows.length === 0) {
      return res.status(404).json({ message: t("role_not_found", lang) });
    }

    const logDescription = { ...role.rows[0] };

    await pool.query(
      "INSERT INTO system_logs (user_id, action, description, ip_address, store_id)  VALUES ($1, $2, $3, $4, $5)",
      [userId, "delete_role", JSON.stringify(logDescription), null, storeId]
    );

    await pool.query("DELETE FROM roles WHERE id = $1 AND store_id = $2", [
      id,
      storeId,
    ]);

    // Socket emit
    const io = getIO();
    io.to(`user_${userId}`).emit("roleDeleted", {
      message: t("role_deleted", lang),
      id: role.rows[0].id,
    });
    res.status(200).json({
      message: t("role_deleted", lang),
    });
  } catch (err) {
    console.error("Delete role error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

