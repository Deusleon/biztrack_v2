import * as _n62 from 'express';
const express = _n62.default ?? _n62;
import * as backupController from '../controllers/backup.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
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
router.post("/restore/drive/:driveFileId", authMiddleware, backupController.restoreFromDrive);

// Restore from uploaded backup file
router.post("/restore/upload", authMiddleware, backupController.restoreFromUpload);

export default router;