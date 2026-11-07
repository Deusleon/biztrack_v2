import { respondWithError } from '../utils/response.js';
import { getStoreMembership, getPermissionSet } from '../utils/accessCache.js';
/**
 * @deprecated Checks the role NAME (owner/admin/manager/cashier), so a custom
 * role with the right permissions is still refused. Use checkStorePermission.
 */
const checkStoreRole = (allowedRoles = []) => {
  return async (req, res, next) => {
    const userId = req.user.id;
    if (!userId) {
      return respondWithError(req, res, 401, 'unauthorized');
    }
    // console.log('Req sent', req);
    const storeId = (req.params && req.params.storeId) ||
                (req.user.current_store_role.store_id) ||
                (req.body && req.body.storeId) ||
                (req.query && req.query.storeId);

    if (!storeId) {
      // console.log("Id haijapatikana");
      return respondWithError(req, res, 400, 'store_id_required');
    }

    try {
      // One cached lookup (was 2 queries on every request):
      // does the user belong to the store, and what is their role name?
      const { member, roleName } = await getStoreMembership(userId, storeId);

      if (!member) {
        return respondWithError(req, res, 403, 'not_part_of_store');
      }

      const role = roleName || undefined;

      if (!allowedRoles.map(role => role.toLowerCase()).includes(role)) {
        return respondWithError(req, res, 403, 'forbidden');
      }

      next();
    } catch (error) {
      console.error(error);
      return respondWithError(req, res, 500, 'server_error');
    }
  };
};

/**
 * Permission-based access for a store, whatever the role is called.
 *
 * The user passes when their role in the store has ANY of the given
 * permissions (or ALL of them when requireAll is true). A custom role such as
 * "Store Keeper" works as soon as the owner ticks the matching permissions on
 * it -- no role names are involved.
 *
 * The store is resolved exactly like checkStoreRole did (URL :storeId first,
 * then the current store, then body/query) and the user must belong to that
 * store, so having a permission in store A never opens store B's data.
 *
 * @param {string|string[]} requiredPermissions
 * @param {boolean} requireAll
 */
const checkStorePermission = (requiredPermissions, requireAll = false) => {
  const required = [...new Set(Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions])];

  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) {
      return respondWithError(req, res, 401, 'unauthorized');
    }

    const storeId = (req.params && req.params.storeId) ||
                    req.user?.current_store_role?.store_id ||
                    req.user?.current_store_id ||
                    (req.body && req.body.storeId) ||
                    (req.query && req.query.storeId);

    if (!storeId) {
      return respondWithError(req, res, 400, 'store_id_required');
    }

    try {
      const { member } = await getStoreMembership(userId, storeId);
      if (!member) {
        return respondWithError(req, res, 403, 'not_part_of_store');
      }

      const allowed = await getPermissionSet(userId, storeId);
      const matched = required.filter((name) => allowed.has(name));

      const ok = requireAll ? matched.length === required.length : matched.length > 0;
      if (!ok) {
        return respondWithError(req, res, 403, 'insufficient_permissions');
      }

      req.userPermissions = matched;
      next();
    } catch (error) {
      console.error('Store permission check error:', error);
      return respondWithError(req, res, 500, 'server_error');
    }
  };
};

/**
 * Lets a request through only for a signed-in person who is a member of the store in the URL.
 * No specific permission is demanded — used on read-only lookups (product / category lists) that the
 * POS, purchasing and stock screens all need, so they stay usable for every role. These routes used
 * to be open to anyone who knew a store's id.
 */
const checkStoreMember = async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) return respondWithError(req, res, 401, 'unauthorized');
  const storeId = req.params?.storeId || req.user?.current_store_id || req.query?.storeId;
  if (!storeId) return respondWithError(req, res, 400, 'store_id_required');
  try {
    const { member } = await getStoreMembership(userId, storeId);
    if (!member) return respondWithError(req, res, 403, 'not_part_of_store');
    return next();
  } catch (error) {
    console.error('Store membership check error:', error);
    return respondWithError(req, res, 500, 'server_error');
  }
};

export { checkStoreRole, checkStorePermission, checkStoreMember };

