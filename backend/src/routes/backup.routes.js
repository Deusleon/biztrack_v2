import * as _n62 from 'express';
const express = _n62.default ?? _n62;
import * as backupController from '../controllers/backup.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { developerOnly } from '../middlewares/developerOnly.js';
const router = express.Router();

// Backup history
router.get("/", authMiddleware, backupController.getBackups);

// Configuration + schedule + last-result status
router.get("/status", authMiddleware, backupController.getBackupStatus);

// Verify the Google Drive connection
router.post("/test", authMiddleware, backupController.testConnection);

// Trigger a backup right now (runs in the background)
router.post("/run", authMiddleware, backupController.runBackupNow);

// Restore from Google Drive backup
// Restoring replaces the WHOLE database (every store of every business): only the developer account (DEVELOPER_EMAIL) may do it from here.
// Everybody else restores with the command line (npm run db:restore) on the server.
router.post("/restore/drive/:driveFileId", authMiddleware, developerOnly, backupController.restoreFromDrive);

// Restore from uploaded backup file
router.post("/restore/upload", authMiddleware, developerOnly, backupController.restoreFromUpload);

export default router;