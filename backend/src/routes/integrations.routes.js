import * as _n41 from 'express';
const express = _n41.default ?? _n41;
const router = express.Router();
import * as integrationController from '../controllers/integration.controller.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { developerOnly } from '../middlewares/developerOnly.js';

// Integrations (SMS, email, cloud backup) are the developer account only.
// DEVELOPER_EMAIL decides that. A store role cannot open or change them.

router.get("/access", authMiddleware, developerOnly, integrationController.checkAccess);
router.get("/", authMiddleware, developerOnly, integrationController.getIntegrations);
router.put("/:provider", authMiddleware, developerOnly, integrationController.saveIntegration);
router.post("/cloud_backup/run", authMiddleware, developerOnly, integrationController.runCloudBackup);
router.post("/:provider/verify", authMiddleware, developerOnly, integrationController.verifyIntegration);
router.post("/:provider/test", authMiddleware, developerOnly, integrationController.testIntegration);

export default router;
