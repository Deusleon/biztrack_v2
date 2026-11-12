import { respondWithError } from '../utils/response.js';
import { isDeveloper } from './developerOnly.js';
/**
 * Support-team guard. The support team is BizTrack's own staff (not store
 * owners), so access is granted by email through an env variable:
 *
 *   SUPPORT_ADMIN_EMAILS=admin@biztrack.co.tz,tech@biztrack.co.tz
 *
 * Must run AFTER authMiddleware (needs req.user.email).
 */
function getSupportAdminEmails() {
  return (process.env.SUPPORT_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isSupportAdmin(user) {
  if (!user?.email) return false;
  return getSupportAdminEmails().includes(String(user.email).toLowerCase());
}

function supportAdminOnly(req, res, next) {
  if (!isSupportAdmin(req.user) && !isDeveloper(req.user)) {
    return respondWithError(req, res, 403, "forbidden");
  }
  next();
}

export { supportAdminOnly, isSupportAdmin, getSupportAdminEmails };

