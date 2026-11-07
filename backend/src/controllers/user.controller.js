import pool from '../config/db.js';
import { getUserPermissions } from '../middlewares/checkPermission.js';
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
// Get current user's permissions
export const getCurrentUserPermissions = async (req, res) => {
  const userId = req.user.id;
  const storeId = req.user.current_store_id;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";

  if (!storeId) {
    return respondWithError(req, res, 400, 'store_id_required');
  }

  try {
    const permissions = await getUserPermissions(userId, storeId);

    res.status(200).json({
      message: t("permissions_fetched", lang),
      permissions: permissions,
    });
  } catch (err) {
    console.error("Get current user permissions error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

// Check specific permission for current user
export const checkUserPermission = async (req, res) => {
  const userId = req.user.id;
  const storeId = req.user.current_store_id;
  const { permission } = req.query;
  const lang = req.user.preferred_language || req.headers["x-language"] || "en";

  if (!storeId) {
    return respondWithError(req, res, 400, 'store_id_required');
  }

  if (!permission) {
    return res.status(400).json({ message: t("permission_name_required", lang) });
  }

  try {
    const { hasPermission } = await import("../middlewares/checkPermission.js");
    const hasAccess = await hasPermission(userId, storeId, permission);

    res.status(200).json({
      permission: permission,
      hasAccess: hasAccess,
    });
  } catch (err) {
    console.error("Check user permission error:", err.message);
    res.status(500).json({ message: t("server_error", lang) });
  }
};

