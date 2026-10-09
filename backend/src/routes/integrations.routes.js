import * as _n41 from 'express';
const express = _n41.default ?? _n41;
const router = express.Router();
import * as integrationController from '../controllers/integration.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { developerOnly, isDeveloper } from '../middlewares/developerOnly.js';
import { checkPermission } from '../middlewares/checkPermission.js';

// SMS gateways can be set by anyone who may manage integrations.
// Google Drive credentials and a whole-database restore stay on the developer account.
const allow = (permission) => (req, res, next) => {
  if (isDeveloper(req.user)) return next();
  return checkPermission(permission)(req, res, next);
};
const BACKUP = new Set(['google_drive', 'cloud_backup']);

// GET  /api/integrations/access – lets the frontend know whether this is the developer account
router.get("/access", authMiddleware, developerOnly, integrationController.checkAccess);

// GET  /api/integrations        – list all integrations (masked credentials)
router.get("/", authMiddleware, allow('view_integration'), integrationController.getIntegrations);

// PUT  /api/integrations/:provider – save/update credentials
router.put("/:provider", authMiddleware, (req, res, next) => {
  if (BACKUP.has(req.params.provider)) return developerOnly(req, res, next);
  return allow('manage_integration')(req, res, next);
}, integrationController.saveIntegration);

router.post("/cloud_backup/run", authMiddleware, developerOnly, integrationController.runCloudBackup);
// POST /api/integrations/:provider/verify – check credentials, sends no SMS / uses no credit
router.post("/:provider/verify", authMiddleware, allow('manage_integration'), integrationController.verifyIntegration);
router.post("/:provider/test", authMiddleware, allow('manage_integration'), integrationController.testIntegration);

export default router;