import pool from '../config/db.js';
const policyCache = new Map();
const POLICY_CACHE_TTL_MS = 60_000;

const DEFAULT_SECURITY_POLICY = Object.freeze({
  sessionTimeout: 30,
  loginAttempts: 5,
  passwordExpiry: 90,
  accountLockMinutes: 15,
  auditLogging: true,
  dataEncryption: true,
});

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSecurityPolicy(raw = {}) {
  return {
    ...DEFAULT_SECURITY_POLICY,
    ...raw,
    sessionTimeout: clampInteger(raw.sessionTimeout, DEFAULT_SECURITY_POLICY.sessionTimeout, 5, 480),
    loginAttempts: clampInteger(raw.loginAttempts, DEFAULT_SECURITY_POLICY.loginAttempts, 1, 20),
    passwordExpiry: clampInteger(raw.passwordExpiry, DEFAULT_SECURITY_POLICY.passwordExpiry, 0, 365),
    accountLockMinutes: clampInteger(raw.accountLockMinutes, DEFAULT_SECURITY_POLICY.accountLockMinutes, 1, 1440),
    auditLogging: raw.auditLogging !== false,
    dataEncryption: raw.dataEncryption !== false,
  };
}

async function getStoreSecurityPolicy(storeId, db = pool) {
  if (!storeId) return normalizeSecurityPolicy();

  const cacheKey = String(storeId);
  const cached = policyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.policy;

  const result = await db.query(
    "SELECT settings FROM store_settings WHERE store_id = $1 LIMIT 1",
    [storeId],
  );
  const raw = result.rows[0]?.settings?.operations?.security || {};
  const policy = normalizeSecurityPolicy(raw);
  policyCache.set(cacheKey, { policy, expiresAt: Date.now() + POLICY_CACHE_TTL_MS });
  return policy;
}

function invalidateStoreSecurityPolicy(storeId) {
  if (storeId) policyCache.delete(String(storeId));
}

function isPasswordExpired(user, policy) {
  if (!policy?.passwordExpiry || policy.passwordExpiry <= 0) return false;
  const changedAt = user.password_changed_at || user.updated_at || user.created_at;
  if (!changedAt) return false;

  const expiryMs = policy.passwordExpiry * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(changedAt).getTime() >= expiryMs;
}

export { DEFAULT_SECURITY_POLICY, normalizeSecurityPolicy, getStoreSecurityPolicy, invalidateStoreSecurityPolicy, isPasswordExpired };

