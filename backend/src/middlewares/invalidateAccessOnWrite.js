// FILE PATH: backend/src/middlewares/invalidateAccessOnWrite.js
import { clearAccessCaches } from '../utils/accessCache.js';

/**
 * After any successful change to roles, role permissions or who belongs to a store, drop this server's cached membership and
 * permission sets so the change takes effect on the NEXT request (before this, a revoked permission kept working until the
 * cache expired). Other server processes (if the hosting runs several) still honour their own cache until it expires.
 */
export default function invalidateAccessOnWrite(req, res, next) {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) clearAccessCaches(); });
  next();
}
