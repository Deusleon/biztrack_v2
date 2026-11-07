import { getUserPermissions } from '../../../middlewares/checkPermission.js';
async function resolvePermissionSet(userId, storeId) {
  const permissions = await getUserPermissions(userId, storeId);
  return new Set(permissions.filter((p) => p.is_allowed !== false).map((p) => p.name));
}

function hasRequiredPermissions(permissionSet, requiredPermissions = []) {
  return requiredPermissions.every((name) => permissionSet.has(name));
}

export { resolvePermissionSet, hasRequiredPermissions };

