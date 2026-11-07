import { respondWithError } from '../utils/response.js';
/**
 * Developer-account guard. Access is granted by email through .env:
 *
 *   DEVELOPER_EMAIL=you@gmail.com
 *
 * (Several addresses can be listed, comma-separated.) If the variable is
 * empty or missing, NOBODY gets access -- the guard fails closed.
 *
 * Must run AFTER authMiddleware (needs req.user.email, which authMiddleware
 * loads from the database, not from the client).
 */
function getDeveloperEmails() {
  return (process.env.DEVELOPER_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isDeveloper(user) {
  if (!user?.email) return false;
  return getDeveloperEmails().includes(String(user.email).trim().toLowerCase());
}

function developerOnly(req, res, next) {
  if (!isDeveloper(req.user)) {
    return respondWithError(req, res, 403, "forbidden");
  }
  next();
}

export { developerOnly, isDeveloper, getDeveloperEmails };

