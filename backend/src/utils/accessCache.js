// Cached lookups for "which role does this user have in this store" and
// "which permissions does that role allow".
//
// Before: every protected request ran 2 queries for the role check
// (checkStoreRole) and 1 more for each checkPermission.
// Now: one query per (user, store) per ACCESS_CACHE_TTL_MS, shared by both.
//
// Safety rules:
//  - Only POSITIVE results are cached. A user who is not in the store, or who
//    has no permissions, is looked up again next time, so adding a user or
//    granting a permission takes effect immediately.
//  - The cache is cleared after any successful change to roles, permissions or
//    store users (see middlewares/cacheInvalidation.js).
//  - If the app runs as several Node processes, other processes pick the
//    change up when their entry expires (at most ACCESS_CACHE_TTL_MS).
//  - ACCESS_CACHE_TTL_MS=0 turns the cache off.
import pool from '../config/db.js';
import { TtlCache } from './ttlCache.js';
const envTtl = process.env.ACCESS_CACHE_TTL_MS;
const ttlMs = envTtl !== undefined && envTtl !== '' && Number.isFinite(Number(envTtl))
  ? Number(envTtl)
  : 30_000;

const membershipCache = new TtlCache({ ttlMs });
const permissionCache = new TtlCache({ ttlMs });

// The users row that authMiddleware loads on EVERY request. Cached briefly
// (15 s by default, USER_CACHE_TTL_MS=0 turns it off) -- saves one DB round
// trip per request. Cleared together with the other access caches, so
// disabling a user / changing store users applies immediately in this process.
const envUserTtl = process.env.USER_CACHE_TTL_MS;
const userTtlMs = envUserTtl !== undefined && envUserTtl !== '' && Number.isFinite(Number(envUserTtl))
  ? Number(envUserTtl)
  : 15_000;
const userRowCache = new TtlCache({ ttlMs: userTtlMs });

async function getUserRow(userId) {
  const cached = userRowCache.get(String(userId));
  if (cached !== undefined) return cached;

  const { rows } = await pool.query(
    'SELECT id, email, status, preferred_language, created_at, updated_at, password_changed_at FROM users WHERE id = $1',
    [userId],
  );
  const row = rows[0] || null;
  // Only cache users that exist and are enabled; anything else is re-checked.
  if (row && row.status) userRowCache.set(String(userId), row);
  return row;
}

function invalidateUserRow(userId) {
  if (userId !== undefined) userRowCache.delete(String(userId));
  else userRowCache.clear();
}

const keyOf = (userId, storeId) => `${userId}:${storeId}`;

/**
 * @returns {Promise<{member: boolean, roleName: string|null}>}
 */
async function getStoreMembership(userId, storeId) {
  const key = keyOf(userId, storeId);
  const cached = membershipCache.get(key);
  if (cached) return cached;

  // One query instead of two (store_users, then roles).
  const { rows } = await pool.query(
    `SELECT r.name AS role_name
       FROM store_users su
       LEFT JOIN roles r ON r.id = su.role_id
      WHERE su.user_id = $1 AND su.store_id = $2
      LIMIT 1`,
    [userId, storeId]
  );

  if (rows.length === 0) return { member: false, roleName: null };

  const value = {
    member: true,
    roleName: rows[0].role_name ? String(rows[0].role_name).toLowerCase() : null,
  };
  membershipCache.set(key, value);
  return value;
}

/**
 * @returns {Promise<Set<string>>} names of every permission the user is allowed in the store
 */
async function getPermissionSet(userId, storeId) {
  const key = keyOf(userId, storeId);
  const cached = permissionCache.get(key);
  if (cached) return cached;

  const { rows } = await pool.query(
    `SELECT p.name
       FROM store_users su
       JOIN role_permissions rp ON rp.role_id = su.role_id AND rp.store_id = su.store_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE su.user_id = $1
        AND su.store_id = $2
        AND su.status = true
        AND rp.is_allowed = true`,
    [userId, storeId]
  );

  const set = new Set(rows.map((r) => r.name));
  if (set.size > 0) permissionCache.set(key, set);
  return set;
}

function clearAccessCaches() {
  membershipCache.clear();
  permissionCache.clear();
  userRowCache.clear();
}

export { getStoreMembership, getPermissionSet, clearAccessCaches, getUserRow, invalidateUserRow };

