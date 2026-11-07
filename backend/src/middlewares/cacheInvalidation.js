// Clears the role/permission cache after anything that can change who may do
// what. It runs when the response has been SENT, which is after the database
// transaction has committed, so the next request cannot re-cache stale data.
import { clearAccessCaches } from '../utils/accessCache.js';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Routes whose writes touch roles, role_permissions, store_users or stores.
// (Login/register are deliberately NOT here: they never change an existing
// user's role or permissions, and clearing on every login would waste the cache.)
const PREFIXES = [
  '/api/roles',
  '/api/permissions',
  '/api/store-users',
  '/api/stores',
  // The cached users row (auth middleware) must reflect password / profile
  // changes immediately, otherwise a fresh password would still look expired.
  '/api/profile',
  '/api/auth/reset-password',
];

export default function cacheInvalidation(req, res, next) {
  if (MUTATING.has(req.method)) {
    const url = req.originalUrl || req.url || '';
    if (PREFIXES.some((prefix) => url.startsWith(prefix))) {
      // Clear on any outcome: clearing is cheap, and a failed request may
      // still have changed something before it failed.
      res.on('finish', clearAccessCaches);
      res.on('close', clearAccessCaches);
    }
  }
  next();
};
