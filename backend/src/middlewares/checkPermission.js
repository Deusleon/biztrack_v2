import pool from '../config/db.js';
import { respondWithError } from '../utils/response.js';
import { getPermissionSet } from '../utils/accessCache.js';
/**
 * Middleware to check if a user has specific permission(s) for an action
 * @param {string|string[]} requiredPermissions - Permission name(s) required
 * @param {boolean} requireAll - If true, user must have ALL permissions. If false, ANY permission is sufficient
 * @returns {Function} Express middleware
 */
const checkPermission = (requiredPermissions, requireAll = false) => {
  return async (req, res, next) => {
    const userId = req.user?.id;
    const storeId = req.user?.current_store_id || 
                    req.headers['x-store-id'] || 
                    req.params.storeId || 
                    req.body.storeId || 
                    req.query.storeId;

    if (!userId) {
      return respondWithError(req, res, 401, 'unauthorized');
    }

    if (!storeId) {
      return respondWithError(req, res, 400, 'store_id_required');
    }

    try {
      const permissions = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];

      // The user's full allowed-permission set for this store, cached for a
      // short time (was one database query per checkPermission call).
      const allowed = await getPermissionSet(userId, storeId);
      const required = [...new Set(permissions)];
      const matched = required.filter((name) => allowed.has(name));

      if (requireAll) {
        if (matched.length !== required.length) {
          return respondWithError(req, res, 403, 'insufficient_permissions');
        }
      } else {
        if (matched.length === 0) {
          return respondWithError(req, res, 403, 'insufficient_permissions');
        }
      }

      req.userPermissions = matched;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return respondWithError(req, res, 500, 'server_error');
    }
  };
};

/**
 * Utility function to check user permissions (non-middleware)
 * @param {number} userId - User ID
 * @param {number} storeId - Store ID
 * @param {string|string[]} permissionNames - Permission name(s) to check
 * @param {boolean} requireAll - If true, checks if user has ALL permissions
 * @returns {Promise<boolean>} True if user has required permission(s)
 */
const hasPermission = async (userId, storeId, permissionNames, requireAll = false) => {
  try {
    const permissions = Array.isArray(permissionNames) ? permissionNames : [permissionNames];

    const { rows } = await pool.query(
      `SELECT p.name
       FROM store_users su
       JOIN role_permissions rp ON rp.role_id = su.role_id AND rp.store_id = su.store_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE su.user_id = $1
         AND su.store_id = $2
         AND su.status = true
         AND p.name = ANY($3)
         AND rp.is_allowed = true`,
      [userId, storeId, permissions]
    );

    return requireAll ? rows.length === permissions.length : rows.length > 0;
  } catch (error) {
    console.error('hasPermission error:', error);
    return false;
  }
};

/**
 * Get all permissions for a user in a specific store
 * @param {number} userId - User ID
 * @param {number} storeId - Store ID
 * @returns {Promise<Array>} Array of permission objects
 */
const getUserPermissions = async (userId, storeId) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.description, p.module, rp.is_allowed
       FROM store_users su
       JOIN role_permissions rp ON rp.role_id = su.role_id AND rp.store_id = su.store_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE su.user_id = $1
         AND su.store_id = $2
         AND su.status = true
         AND rp.is_allowed = true
       ORDER BY p.module, p.name`,
      [userId, storeId]
    );

    return rows;
  } catch (error) {
    console.error('getUserPermissions error:', error);
    return [];
  }
};

/**
 * Check if user has a specific role
 * @param {number} userId - User ID
 * @param {number} storeId - Store ID
 * @param {string|string[]} roleNames - Role name(s) to check
 * @returns {Promise<boolean>} True if user has the role
 */
const hasRole = async (userId, storeId, roleNames) => {
  try {
    const roles = Array.isArray(roleNames) ? roleNames : [roleNames];

    const { rows } = await pool.query(
      `SELECT r.name
       FROM roles r
       JOIN store_users su ON r.id = su.role_id
       WHERE su.user_id = $1 
       AND su.store_id = $2 
       AND su.status = true
       AND LOWER(r.name) = ANY($3)`,
      [userId, storeId, roles.map(r => r.toLowerCase())]
    );

    return rows.length > 0;
  } catch (error) {
    console.error('hasRole error:', error);
    return false;
  }
};

export { checkPermission, hasPermission, getUserPermissions, hasRole };

