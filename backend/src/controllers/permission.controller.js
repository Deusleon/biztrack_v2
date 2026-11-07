import pool from '../config/db.js';
import { logActivity } from '../utils/activityLog.js';
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import { getIO } from '../utils/socket.js';
// Get all permissions
export const getPermissions = async (req, res) => {
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";
  const storeId = req.user.current_store_id;
  const roleId = req.query.roleId;

  if (!roleId) {
    return res.status(400).json({ message: "role_id is required" });
  }

  try {
    // 1. Fetch all permissions ordered by module, submodule, display_no
    const permissionsRes = await pool.query(`
      SELECT id, name, description, module, submodule
      FROM permissions
      ORDER BY module, submodule, display_no
    `);

    // 2. Fetch current role permission assignments
    const assignedRes = await pool.query(
      `
      SELECT permission_id, is_allowed::boolean AS is_allowed
      FROM role_permissions
      WHERE role_id = $1 AND store_id = $2
      `,
      [roleId, storeId]
    );

    const assignedMap = {};
    assignedRes.rows.forEach((p) => {
      assignedMap[p.permission_id] = p.is_allowed;
    });

    // 3. Build final output grouped as module → submodule → permissions[]
    const modules = {};

    permissionsRes.rows.forEach((perm) => {
      const moduleName = perm.module || "Other";
      const submoduleName = perm.submodule || "General";

      if (!modules[moduleName]) modules[moduleName] = {};
      if (!modules[moduleName][submoduleName]) modules[moduleName][submoduleName] = [];

      modules[moduleName][submoduleName].push({
        id: perm.id,
        name: perm.name,
        description: perm.description,
        is_allowed: assignedMap[perm.id] ?? false,
      });
    });

    res.status(200).json({
      message: t("permissions_fetched", lang),
      permissions: modules,
    });
  } catch (err) {
    console.error("Get permissions error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

// Update permission
export const updatePermission = async (req, res) => {
  const { roleId, permissionId, isAllowed } = req.body;
  const storeId = req.user.current_store_id;

  try {
    // Check if exists
    const check = await pool.query(
      `SELECT id FROM role_permissions 
       WHERE role_id=$1 AND permission_id=$2 AND store_id=$3`,
      [roleId, permissionId, storeId]
    );

    if (check.rows.length === 0) {
      // INSERT
      await pool.query(
        `
        INSERT INTO role_permissions (role_id, permission_id, is_allowed, store_id)
        VALUES ($1, $2, $3, $4)
      `,
        [roleId, permissionId, isAllowed, storeId]
      );
    } else {
      // UPDATE
      await pool.query(
        `
        UPDATE role_permissions
        SET is_allowed=$1
        WHERE role_id=$2 AND permission_id=$3 AND store_id=$4
      `,
        [isAllowed, roleId, permissionId, storeId]
      );
    }

    await logActivity(pool, {
      userId: req.user.id,
      storeId: storeId,
      action: "update_permission",
      description: {
        role_id: roleId,
        permission_id: permissionId,
        allowed: isAllowed,
      },
      ip: req.ip,
    });
    
    res.status(200).json({ message: "Permission updated" });
  } catch (err) {
    console.error("Update permission error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

// Update bulkPermission
export const updateBulkPermission = async (req, res) => {
  const { roleId, module, submodule, isAllowed } = req.body;
  const storeId = req.user.current_store_id;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";

  try {
    let permissionsRes;

    if (submodule) {
      // Bulk toggle for a specific submodule
      permissionsRes = await pool.query(
        `SELECT id FROM permissions WHERE module = $1 AND submodule = $2`,
        [module, submodule]
      );
    } else {
      // Bulk toggle for the entire module
      permissionsRes = await pool.query(
        `SELECT id FROM permissions WHERE module = $1`,
        [module]
      );
    }

    for (const perm of permissionsRes.rows) {
      await pool.query(
        `
        INSERT INTO role_permissions (role_id, permission_id, is_allowed, store_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (role_id, permission_id, store_id)
        DO UPDATE SET is_allowed = EXCLUDED.is_allowed
        `,
        [roleId, perm.id, isAllowed, storeId]
      );
    }

    await logActivity(pool, {
      userId: req.user.id,
      storeId: storeId,
      action: "update_bulk_permission",
      description: {
        role_id: roleId,
        module,
        submodule: submodule || undefined,
        allowed: isAllowed,
      },
      ip: req.ip,
    });
    
    res.status(200).json({ message: "Permission updated" });
  } catch (err) {
    console.error("Update bulk permission error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

