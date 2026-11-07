import pool from '../config/db.js';
/**
 * Shared activity logger — ONE consistent format for the whole system.
 *
 * Every action is stored with:
 *   - action:      a snake_case translation-key-friendly name
 *                  (the frontend renders it via `log_action_<action>`)
 *   - description: a JSON object. Use resolvable id fields where possible
 *                  (product_id, customer_id, supplier_id, created_by,
 *                  from_store_id, to_store_id, ...) — getSystemLogs resolves
 *                  them into names automatically. Add human-readable fields
 *                  (invoice_number, quantity, amount, ...) alongside.
 *                  For updates, use { old: {...}, new: {...} } so the UI can
 *                  render a proper before/after diff.
 *
 * Logging must NEVER break the main operation, so failures are swallowed
 * (logged to console only).
 *
 * @param {object} db  - pool or a transaction client (pass the client when
 *                       inside a transaction so the log commits atomically)
 * @param {object} entry
 * @param {string|null} entry.userId
 * @param {string|null} entry.storeId
 * @param {string} entry.action
 * @param {object|string} [entry.description]
 * @param {string|null} [entry.ip]
 */
async function logActivity(db, { userId = null, storeId = null, action, description = {}, ip = null }) {
  const database = db || pool;
  // A transaction client is passed when logging inside a transaction. A failed
  // query would poison that transaction (everything after it aborts), so the
  // log INSERT is wrapped in a SAVEPOINT: if it fails, we roll back only the
  // log and the main operation still commits.
  const isTransactionClient = typeof database.release === "function";
  try {
    const payload = typeof description === "string" ? description : JSON.stringify(description);
    if (isTransactionClient) await database.query("SAVEPOINT activity_log");
    await database.query(
      `INSERT INTO system_logs (user_id, action, description, ip_address, store_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, payload, ip, storeId],
    );
    if (isTransactionClient) await database.query("RELEASE SAVEPOINT activity_log");
  } catch (err) {
    if (isTransactionClient) {
      await database.query("ROLLBACK TO SAVEPOINT activity_log").catch(() => {});
    }
    console.error(`logActivity failed for action "${action}":`, err.message);
  }
}

export { logActivity };

