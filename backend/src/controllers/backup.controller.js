import pool from '../config/db.js';
import { respondWithError } from '../utils/response.js';
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
import { runCloudBackup, getDriveClient, isBackupRunning, restoreFromBuffer, restoreFromDrive, RETENTION_DAYS } from '../services/backup.service.js';
import { RUN_TIME } from '../services/backupScheduler.js';
import * as _n12 from 'multer';
const multer = _n12.default ?? _n12;
// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept .sql, .sql.gz, and .gz files
    if (
      file.originalname.endsWith(".sql") ||
      file.originalname.endsWith(".sql.gz") ||
      file.originalname.endsWith(".gz")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .sql, .sql.gz, or .gz files are allowed"));
    }
  },
});

// Owner/Manager only — same guard as the manual database download in tools
async function requireOwnerOrManager(req, res) {
  const storeId = req.user.current_store_id;
  const userId = req.user.id;

  const result = await pool.query(
    `SELECT r.name AS role_name FROM store_users su
     JOIN roles r ON r.id = su.role_id
     WHERE su.user_id = $1 AND su.store_id = $2 LIMIT 1`,
    [userId, storeId],
  );

  if (!result.rows.length || !["Owner", "Manager"].includes(result.rows[0].role_name)) {
    respondWithError(req, res, 403, "forbidden");
    return false;
  }
  return true;
}

// GET /api/backups?limit=10 — backup history
export const getBackups = async (req, res) => {
  try {
    if (!(await requireOwnerOrManager(req, res))) return;

    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const result = await pool.query(
      `SELECT cb.id, cb.date_key, cb.file_name, cb.size_bytes, cb.status,
              cb.triggered_by, cb.method, cb.error, cb.created_at, cb.completed_at,
              u.name AS created_by_name
       FROM cloud_backups cb
       LEFT JOIN users u ON u.id = cb.created_by
       ORDER BY cb.created_at DESC
       LIMIT $1`,
      [limit],
    );

    return res.status(200).json({ success: true, backups: result.rows });
  } catch (err) {
    console.error("Get backups error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// GET /api/backups/status — config + schedule + last result
export const getBackupStatus = async (req, res) => {
  try {
    if (!(await requireOwnerOrManager(req, res))) return;

    const drive = await getDriveClient();

    const last = await pool.query(
      `SELECT file_name, size_bytes, status, created_at, completed_at
       FROM cloud_backups WHERE status IN ('success', 'failed')
       ORDER BY created_at DESC LIMIT 1`,
    );

    return res.status(200).json({
      success: true,
      configured: Boolean(drive),
      running: await isBackupRunning(),
      schedule_time: `${String(RUN_TIME.hour).padStart(2, "0")}:${String(RUN_TIME.minute).padStart(2, "0")}`,
      timezone: process.env.BUSINESS_TIMEZONE || "Africa/Dar_es_Salaam",
      retention_days: RETENTION_DAYS,
      last_backup: last.rows[0] || null,
    });
  } catch (err) {
    console.error("Backup status error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/backups/test — verify the Google Drive connection
export const testConnection = async (req, res) => {
  const lang = getLang(req);
  try {
    if (!(await requireOwnerOrManager(req, res))) return;

    const drive = await getDriveClient();
    if (!drive) {
      return res.status(400).json({ success: false, message: t("backup_not_configured", lang) });
    }

    const account = await drive.getAccountInfo();
    return res.status(200).json({
      success: true,
      message: t("drive_connection_ok", lang),
      account: {
        email: account.email,
        name: account.name,
        storage_used_mb: Math.round(account.storageUsed / (1024 * 1024)),
        storage_limit_mb: account.storageLimit ? Math.round(account.storageLimit / (1024 * 1024)) : null,
      },
    });
  } catch (err) {
    console.error("Drive connection test failed:", err);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/backups/run — trigger a backup now (runs in the background)
export const runBackupNow = async (req, res) => {
  const lang = getLang(req);
  try {
    if (!(await requireOwnerOrManager(req, res))) return;

    const drive = await getDriveClient();
    if (!drive) {
      return res.status(400).json({ success: false, message: t("backup_not_configured", lang) });
    }

    if (await isBackupRunning()) {
      return res.status(409).json({ success: false, message: t("backup_already_running", lang) });
    }

    // Fire and forget: dumps can take a while, don't hold the request open.
    // The frontend polls GET /api/backups for the result.
    runCloudBackup({ triggeredBy: "manual", userId: req.user.id }).catch((err) =>
      console.error("Manual cloud backup crashed:", err),
    );

    return res.status(202).json({ success: true, message: t("backup_started", lang) });
  } catch (err) {
    console.error("Run backup error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/backups/restore/drive/:driveFileId — restore from Google Drive backup
const _exp_restoreFromDrive = async (req, res) => {
  const lang = getLang(req);
  try {
    if (!(await requireOwnerOrManager(req, res))) return;

    const { driveFileId } = req.params;
    if (!driveFileId) {
      return res.status(400).json({ success: false, message: t("drive_file_id_required", lang) });
    }

    const drive = await getDriveClient();
    if (!drive) {
      return res.status(400).json({ success: false, message: t("backup_not_configured", lang) });
    }

    // Start restore in background
    restoreFromDrive({ driveFileId, userId: req.user.id })
      .then((result) => {
        if (result.success) {
          console.log(`Database restored successfully from Drive: ${result.fileName}`);
        } else {
          console.error(`Database restore from Drive failed: ${result.error}`);
        }
      })
      .catch((err) => console.error("Restore from Drive crashed:", err));

    return res.status(202).json({
      success: true,
      message: t("restore_started", lang),
    });
  } catch (err) {
    console.error("Restore from Drive error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// POST /api/backups/restore/upload — restore from uploaded backup file
export const restoreFromUpload = [
  upload.single("backup_file"),
  async (req, res) => {
    const lang = getLang(req);
    try {
      if (!(await requireOwnerOrManager(req, res))) return;

      if (!req.file) {
        return res.status(400).json({ success: false, message: t("backup_file_required", lang) });
      }

      const buffer = req.file.buffer;
      const fileName = req.file.originalname;

      // Start restore in background
      restoreFromBuffer(buffer)
        .then((result) => {
          if (result.success) {
            console.log(`Database restored successfully from upload: ${fileName}`);

            // Log the restore action
            pool
              .query(
                `INSERT INTO system_logs (user_id, action, description, store_id)
               VALUES ($1, 'database_restore', $2, NULL)`,
                [
                  req.user.id,
                  JSON.stringify({
                    file: fileName,
                    size_bytes: buffer.length,
                    method: result.method,
                    source: "upload",
                  }),
                ],
              )
              .catch(() => {});
          } else {
            console.error(`Database restore from upload failed: ${result.error}`);
          }
        })
        .catch((err) => console.error("Restore from upload crashed:", err));

      return res.status(202).json({
        success: true,
        message: t("restore_started", lang),
        file: fileName,
      });
    } catch (err) {
      console.error("Restore from upload error:", err);
      respondWithError(req, res, 500, "server_error");
    }
  },
];
export { _exp_restoreFromDrive as restoreFromDrive };
