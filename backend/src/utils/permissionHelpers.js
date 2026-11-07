import pool from '../config/db.js';
/**
 * Batch check multiple permissions for a user
 * @param {number} userId - User ID
 * @param {number} storeId - Store ID
 * @param {Array<string>} permissionNames - Array of permission names
 * @returns {Promise<Object>} Object with permission names as keys and boolean values
 */
const batchCheckPermissions = async (userId, storeId, permissionNames) => {
  try {
    const { rows: userRoles } = await pool.query(
      `SELECT role_id FROM store_users 
       WHERE user_id = $1 AND store_id = $2 AND status = true`,
      [userId, storeId]
    );

    if (userRoles.length === 0) {
      return permissionNames.reduce((acc, name) => ({ ...acc, [name]: false }), {});
    }

    const roleId = userRoles[0].role_id;

    const { rows: permissions } = await pool.query(
      `SELECT p.name, rp.is_allowed
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1 
       AND rp.store_id = $2 
       AND p.name = ANY($3)`,
      [roleId, storeId, permissionNames]
    );

    const permissionMap = permissions.reduce((acc, p) => ({
      ...acc,
      [p.name]: p.is_allowed
    }), {});

    // Fill in missing permissions as false
    return permissionNames.reduce((acc, name) => ({
      ...acc,
      [name]: permissionMap[name] || false
    }), {});
  } catch (error) {
    console.error('batchCheckPermissions error:', error);
    return permissionNames.reduce((acc, name) => ({ ...acc, [name]: false }), {});
  }
};

/**
 * Get permissions grouped by module for a user
 * @param {number} userId - User ID
 * @param {number} storeId - Store ID
 * @returns {Promise<Object>} Object with modules as keys and permissions arrays as values
 */
const getPermissionsByModule = async (userId, storeId) => {
  try {
    const { rows: userRoles } = await pool.query(
      `SELECT role_id FROM store_users 
       WHERE user_id = $1 AND store_id = $2 AND status = true`,
      [userId, storeId]
    );

    if (userRoles.length === 0) {
      return {};
    }

    const roleId = userRoles[0].role_id;

    const { rows: permissions } = await pool.query(
      `SELECT p.id, p.name, p.description, p.module, rp.is_allowed
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1 
       AND rp.store_id = $2 
       AND rp.is_allowed = true
       ORDER BY p.module, p.name`,
      [roleId, storeId]
    );

    return permissions.reduce((acc, perm) => {
      if (!acc[perm.module]) {
        acc[perm.module] = [];
      }
      acc[perm.module].push({
        id: perm.id,
        name: perm.name,
        description: perm.description,
        is_allowed: perm.is_allowed
      });
      return acc;
    }, {});
  } catch (error) {
    console.error('getPermissionsByModule error:', error);
    return {};
  }
};

/**
 * Check if user can perform action on a specific resource
 * Combines permission and ownership checks
 * @param {number} userId - User ID
 * @param {number} storeId - Store ID
 * @param {string} permissionName - Permission name
 * @param {Object} options - Additional options
 * @param {number} options.resourceOwnerId - Owner ID of the resource (optional)
 * @param {boolean} options.allowOwner - Allow if user is the owner (default: true)
 * @returns {Promise<boolean>}
 */
const canPerformAction = async (userId, storeId, permissionName, options = {}) => {
  const { resourceOwnerId = null, allowOwner = true } = options;

  try {
    // Check if user is the owner (if applicable)
    if (allowOwner && resourceOwnerId && userId === resourceOwnerId) {
      return true;
    }

    // Check permission
    const { rows: userRoles } = await pool.query(
      `SELECT role_id FROM store_users 
       WHERE user_id = $1 AND store_id = $2 AND status = true`,
      [userId, storeId]
    );

    if (userRoles.length === 0) {
      return false;
    }

    const roleId = userRoles[0].role_id;

    const { rows: permissions } = await pool.query(
      `SELECT rp.is_allowed
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1 
       AND rp.store_id = $2 
       AND p.name = $3
       AND rp.is_allowed = true`,
      [roleId, storeId, permissionName]
    );

    return permissions.length > 0;
  } catch (error) {
    console.error('canPerformAction error:', error);
    return false;
  }
};

/**
 * Get user's role details in a store
 * @param {number} userId - User ID
 * @param {number} storeId - Store ID
 * @returns {Promise<Object|null>} Role details or null
 */
const getUserRole = async (userId, storeId) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.name, r.description, su.status
       FROM roles r
       JOIN store_users su ON r.id = su.role_id
       WHERE su.user_id = $1 
       AND su.store_id = $2`,
      [userId, storeId]
    );

    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('getUserRole error:', error);
    return null;
  }
};

/**
 * Check if user has any admin/elevated role
 * @param {number} userId - User ID
 * @param {number} storeId - Store ID
 * @param {Array<string>} adminRoles - Array of admin role names (default: ['owner', 'admin', 'manager'])
 * @returns {Promise<boolean>}
 */
const isAdmin = async (userId, storeId, adminRoles = ['owner', 'admin', 'manager']) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.name
       FROM roles r
       JOIN store_users su ON r.id = su.role_id
       WHERE su.user_id = $1 
       AND su.store_id = $2 
       AND su.status = true
       AND LOWER(r.name) = ANY($3)`,
      [userId, storeId, adminRoles.map(r => r.toLowerCase())]
    );

    return rows.length > 0;
  } catch (error) {
    console.error('isAdmin error:', error);
    return false;
  }
};

export { batchCheckPermissions, getPermissionsByModule, canPerformAction, getUserRole, isAdmin };

