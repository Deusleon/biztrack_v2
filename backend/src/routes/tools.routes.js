import * as _n49 from 'express';
const express = _n49.default ?? _n49;
import * as toolsController from '../controllers/tools.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

// Data export (SQL)
router.get("/export", authMiddleware, toolsController.exportData);

// Full database backup (SQL)
router.get("/backup", authMiddleware, toolsController.backupDatabase);

// Database health check
router.get("/db-health", authMiddleware, toolsController.dbHealthCheck);

// Clear cache (log event)
router.post("/clear-cache", authMiddleware, toolsController.clearCache);

// Activity / system logs
router.get("/logs", authMiddleware, toolsController.getSystemLogs);

export default router;