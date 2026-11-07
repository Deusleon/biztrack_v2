import * as _p21 from 'child_process';
const {  spawn  } = _p21.default ?? _p21;
import zlib from 'zlib';
import * as _p22 from 'util';
const {  promisify  } = _p22.default ?? _p22;
import pool from '../config/db.js';
import { GoogleDriveClient } from '../utils/googleDrive.js';
import { notifyStore } from './notification.service.js';
import { t } from '../utils/translate.js';
const gzip = promisify(zlib.gzip);

const RETENTION_DAYS = Math.max(
  1,
  Number.parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10) || 30,
);

// In-memory guard against two backups in the same process. The DB check in
// isBackupRunning() covers multi-instance deployments.
let inProgress = false;

// ─── Config ──────────────────────────────────────────────────────────────────

async function getDriveConfig() {
  const result = await pool.query(
    "SELECT config FROM integrations WHERE provider = 'google_drive' AND type = 'backup' AND is_active = true LIMIT 1",
  );
  return result.rows[0]?.config || null;
}

async function getDriveClient() {
  const config = await getDriveConfig();
  if (!config) return null;
  const client = new GoogleDriveClient(config);
  return client.isConfigured() ? client : null;
}

// ─── Database dump ───────────────────────────────────────────────────────────

/**
 * Preferred method: pg_dump of the ENTIRE database (schema + data),
 * directly restorable with psql.
 */
function dumpWithPgDump() {
  return new Promise((resolve, reject) => {
    const args = [
      `--dbname=${process.env.DATABASE_URL}`,
      "--no-owner",
      "--no-privileges",
      "--format=plain",
    ];
    const child = spawn("pg_dump", args, { stdio: ["ignore", "pipe", "pipe"] });

    const chunks = [];
    const errChunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errChunks.push(chunk));

    child.on("error", (err) => reject(err)); // e.g. ENOENT: pg_dump not installed
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`pg_dump exited with code ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 500)}`));
      }
    });
  });
}

function sqlLiteral(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Buffer.isBuffer(val)) return `'\\x${val.toString("hex")}'`;
  if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Fallback method when pg_dump is not available on the host (some managed
 * platforms): dumps every table in the public schema as INSERT statements.
 * FK order doesn't matter on restore because we disable triggers via
 * session_replication_role.
 */
async function dumpWithJs() {
  const tablesResult = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );

  const lines = [
    "-- BizTrack FULL database backup (data only, generated without pg_dump)",
    `-- Generated at: ${new Date().toISOString()}`,
    "-- Restore into an empty database that already has the schema (run migrations first),",
    "-- then execute this file with psql. Trigger/FK order is handled below.",
    "",
    "BEGIN;",
    "SET session_replication_role = replica;",
    "",
  ];

  for (const { table_name: table } of tablesResult.rows) {
    try {
      const dataResult = await pool.query(`SELECT * FROM "${table}"`);
      const rows = dataResult.rows;
      lines.push(`-- ${table.toUpperCase()} (${rows.length} rows)`);
      if (rows.length) {
        const columns = Object.keys(rows[0]);
        const colList = columns.map((c) => `"${c}"`).join(", ");
        for (const row of rows) {
          const vals = columns.map((c) => sqlLiteral(row[c])).join(", ");
          lines.push(`INSERT INTO "${table}" (${colList}) VALUES (${vals});`);
        }
      }
      lines.push("");
    } catch (err) {
      lines.push(`-- Skipped table "${table}": ${err.message}`, "");
    }
  }

  lines.push("SET session_replication_role = DEFAULT;", "COMMIT;", "");
  return Buffer.from(lines.join("\n"), "utf8");
}

async function createDatabaseDump() {
  try {
    const buffer = await dumpWithPgDump();
    return { buffer, method: "pg_dump" };
  } catch (err) {
    console.warn(`Cloud backup: pg_dump unavailable/failed (${err.message}). Using JS fallback.`);
    const buffer = await dumpWithJs();
    return { buffer, method: "js_fallback" };
  }
}

// ─── Status helpers ──────────────────────────────────────────────────────────

async function isBackupRunning() {
  if (inProgress) return true;
  const result = await pool.query(
    `SELECT 1 FROM cloud_backups
     WHERE status = 'running' AND created_at > NOW() - INTERVAL '30 minutes'
     LIMIT 1`,
  );
  return result.rows.length > 0;
}

async function hasSucceededForDate(dateKey) {
  const result = await pool.query(
    "SELECT 1 FROM cloud_backups WHERE date_key = $1 AND status = 'success' LIMIT 1",
    [dateKey],
  );
  return result.rows.length > 0;
}

// ─── Notifications ───────────────────────────────────────────────────────────

// notifyStore() itself checks each store's <channel>_cloud_backup settings,
// so stores that disabled the type are skipped automatically.
async function notifyAllStores({ title, message, meta }) {
  try {
    const stores = await pool.query("SELECT store_id FROM store_settings");
    for (const row of stores.rows) {
      try {
        await notifyStore({ storeId: row.store_id, type: "cloud_backup", title, message, meta });
      } catch (err) {
        console.error(`Cloud backup notification failed for store ${row.store_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Cloud backup notifications failed:", err.message);
  }
}

// ─── Retention ───────────────────────────────────────────────────────────────

async function applyRetention(drive, folderId) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const old = await pool.query(
    `SELECT id, drive_file_id, file_name FROM cloud_backups
     WHERE status = 'success' AND created_at < $1 AND drive_file_id IS NOT NULL`,
    [cutoff],
  );

  for (const row of old.rows) {
    try {
      await drive.deleteFile(row.drive_file_id);
    } catch (err) {
      // 404 = already gone; anything else we log but don't fail the backup
      if (!String(err.message).includes("404")) {
        console.warn(`Cloud backup retention: could not delete ${row.file_name}: ${err.message}`);
        continue;
      }
    }
    await pool.query(
      "UPDATE cloud_backups SET status = 'deleted', drive_file_id = NULL WHERE id = $1",
      [row.id],
    );
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Run a full database backup and upload it to the configured Google Drive.
 * @param {object} options
 * @param {"scheduled"|"manual"} options.triggeredBy
 * @param {string|null} options.userId - who triggered it (manual runs)
 * @param {string|null} options.dateKey - business-timezone date key (scheduled runs)
 */
async function runCloudBackup({ triggeredBy = "manual", userId = null, dateKey = null } = {}) {
  const drive = await getDriveClient();
  if (!drive) {
    return { success: false, skipped: true, reason: "not_configured" };
  }

  if (await isBackupRunning()) {
    return { success: false, skipped: true, reason: "already_running" };
  }

  inProgress = true;

  const now = new Date();
  const effectiveDateKey = dateKey || now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const fileName = `biztrack_backup_${stamp}.sql.gz`;

  const inserted = await pool.query(
    `INSERT INTO cloud_backups (date_key, file_name, status, triggered_by, created_by)
     VALUES ($1, $2, 'running', $3, $4)
     RETURNING id`,
    [effectiveDateKey, fileName, triggeredBy, userId],
  );
  const backupId = inserted.rows[0].id;

  try {
    const { buffer: sqlBuffer, method } = await createDatabaseDump();
    const gzipped = await gzip(sqlBuffer);

    const folderId = await drive.ensureBackupFolder();
    const uploaded = await drive.uploadFile({
      name: fileName,
      buffer: gzipped,
      mimeType: "application/gzip",
      folderId,
    });

    // Persist the resolved folder id so future runs skip the folder lookup
    await pool.query(
      `UPDATE integrations
       SET config = config || jsonb_build_object('folder_id', $1::text)
       WHERE provider = 'google_drive' AND type = 'backup'
         AND (config->>'folder_id') IS DISTINCT FROM $1::text`,
      [folderId],
    );

    await pool.query(
      `UPDATE cloud_backups
       SET status = 'success', drive_file_id = $1, size_bytes = $2, method = $3, completed_at = NOW()
       WHERE id = $4`,
      [uploaded.id, gzipped.length, method, backupId],
    );

    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, 'cloud_backup_completed', $2, NULL)`,
      [userId, JSON.stringify({ file: fileName, size_bytes: gzipped.length, method, triggered_by: triggeredBy })],
    );

    await applyRetention(drive, folderId);

    await notifyAllStores({
      title: "Cloud backup completed",
      message: t("cloud_backup_completed_msg", { file: fileName }),
      meta: {
        file: fileName,
        size: `${(gzipped.length / (1024 * 1024)).toFixed(2)} MB`,
        method,
        triggered_by: triggeredBy,
      },
    });

    return { success: true, backupId, fileName, sizeBytes: gzipped.length, method, driveFileId: uploaded.id };
  } catch (err) {
    console.error("Cloud backup failed:", err);
    await pool
      .query(
        `UPDATE cloud_backups SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
        [String(err.message).slice(0, 1000), backupId],
      )
      .catch(() => {});

    await notifyAllStores({
      title: "Cloud backup failed",
      message: t("cloud_backup_failed_msg", { error: String(err.message).slice(0, 200) }),
      meta: { file: fileName, triggered_by: triggeredBy },
    });

    return { success: false, backupId, error: err.message };
  } finally {
    inProgress = false;
  }
}

// ─── Database Restore ────────────────────────────────────────────────────────

/**
 * Restore database from a backup buffer using psql.
 * @param {Buffer} sqlBuffer - The SQL dump content (uncompressed)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function restoreWithPsql(sqlBuffer) {
  return new Promise((resolve, reject) => {
    const args = [
      `--dbname=${process.env.DATABASE_URL}`,
      "--single-transaction",
      "--quiet",
    ];
    const child = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });

    const errChunks = [];
    child.stderr.on("data", (chunk) => errChunks.push(chunk));

    // IMPORTANT: writing to child.stdin after a failed spawn (e.g. psql not
    // found on PATH -- common on managed/shared hosting) emits its own
    // 'error' event on the stdin stream, separate from the ChildProcess
    // 'error' event below. Left unhandled, that crashes the entire Node
    // process (uncaught 'error' event), taking down the whole app instead
    // of just failing this one restore request. `settled` avoids calling
    // reject() twice if both the stdin error and the process error fire.
    let settled = false;
    const rejectOnce = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    child.stdin.on("error", (err) => rejectOnce(err));
    child.on("error", (err) => rejectOnce(err)); // e.g. ENOENT: psql not installed

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve({ success: true });
      } else {
        const errorMsg = Buffer.concat(errChunks).toString("utf8").slice(0, 1000);
        reject(new Error(`psql exited with code ${code}: ${errorMsg}`));
      }
    });

    // Write the SQL to stdin
    child.stdin.write(sqlBuffer);
    child.stdin.end();
  });
}

/**
 * Restore database from a backup buffer (handles both compressed and uncompressed).
 * @param {Buffer} buffer - The backup file content (may be gzipped)
 * @returns {Promise<{success: boolean, method: string, error?: string}>}
 */
async function restoreFromBuffer(buffer) {
  try {
    // Try to detect if it's gzipped (magic bytes: 1f 8b)
    let sqlBuffer = buffer;
    let wasCompressed = false;

    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      // It's gzipped, decompress it
      const gunzip = promisify(zlib.gunzip);
      sqlBuffer = await gunzip(buffer);
      wasCompressed = true;
    }

    // Try restoring with psql first
    try {
      await restoreWithPsql(sqlBuffer);
      return {
        success: true,
        method: wasCompressed ? "psql (decompressed)" : "psql",
      };
    } catch (err) {
      console.warn(`Restore: psql unavailable/failed (${err.message}). Using JS fallback.`);

      // Fallback: execute SQL line by line using pool.query
      const sql = sqlBuffer.toString("utf8");
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Split by semicolons (simple approach; doesn't handle all edge cases)
        const statements = sql
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("--"));

        for (const statement of statements) {
          if (statement) {
            await client.query(statement);
          }
        }

        await client.query("COMMIT");
        return {
          success: true,
          method: wasCompressed ? "js_fallback (decompressed)" : "js_fallback",
        };
      } catch (jsErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw jsErr;
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error("Database restore failed:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Restore database from a Google Drive backup file.
 * @param {string} driveFileId - The Google Drive file ID
 * @param {number|null} userId - User who triggered the restore
 * @returns {Promise<{success: boolean, fileName?: string, error?: string}>}
 */
async function restoreFromDrive({ driveFileId, userId = null }) {
  const drive = await getDriveClient();
  if (!drive) {
    return { success: false, error: "Google Drive not configured" };
  }

  try {
    // Get backup info from database
    const backupResult = await pool.query(
      "SELECT file_name FROM cloud_backups WHERE drive_file_id = $1 AND status = 'success' LIMIT 1",
      [driveFileId],
    );

    const fileName = backupResult.rows[0]?.file_name || "unknown_backup.sql.gz";

    // Download the file from Google Drive
    const buffer = await drive.downloadFile(driveFileId);

    // Restore the database
    const result = await restoreFromBuffer(buffer);

    if (result.success) {
      // Log the restore action
      await pool.query(
        `INSERT INTO system_logs (user_id, action, description, store_id)
         VALUES ($1, 'database_restore', $2, NULL)`,
        [
          userId,
          JSON.stringify({
            file: fileName,
            drive_file_id: driveFileId,
            method: result.method,
          }),
        ],
      );

      await notifyAllStores({
        title: "Database restore completed",
        message: t("database_restore_completed_msg", { file: fileName }),
        meta: {
          file: fileName,
          method: result.method,
        },
      });

      return { success: true, fileName, method: result.method };
    } else {
      throw new Error(result.error || "Restore failed");
    }
  } catch (err) {
    console.error("Drive restore failed:", err);

    await notifyAllStores({
      title: "Database restore failed",
      message: t("database_restore_failed_msg", { error: String(err.message).slice(0, 200) }),
      meta: {},
    });

    return { success: false, error: err.message };
  }
}

export { runCloudBackup, getDriveClient, getDriveConfig, isBackupRunning, hasSucceededForDate, restoreFromBuffer, restoreFromDrive, RETENTION_DAYS };

