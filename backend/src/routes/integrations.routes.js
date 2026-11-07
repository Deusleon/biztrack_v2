import * as _n41 from 'express';
const express = _n41.default ?? _n41;
const router = express.Router();
import * as integrationController from '../controllers/integration.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { developerOnly } from '../middlewares/developerOnly.js';
// Integrations are managed by the developer account only (DEVELOPER_EMAIL in .env).
// Every route below requires a valid login AND a matching developer email.

// GET  /api/integrations/access – lets the frontend know whether to show the page
router.get("/access", authMiddleware, developerOnly, integrationController.checkAccess);

// GET  /api/integrations        – list all integrations (masked credentials)
router.get("/", authMiddleware, developerOnly, integrationController.getIntegrations);

// PUT  /api/integrations/:provider – save/update credentials
router.put("/:provider", authMiddleware, developerOnly, integrationController.saveIntegration);

// POST /api/integrations/:provider/test – send test SMS
router.post("/cloud_backup/run", authMiddleware, developerOnly, integrationController.runCloudBackup);
// POST /api/integrations/:provider/verify – check credentials, sends no SMS / uses no credit
router.post("/:provider/verify", authMiddleware, developerOnly, integrationController.verifyIntegration);
router.post("/:provider/test", authMiddleware, developerOnly, integrationController.testIntegration);

export default router;