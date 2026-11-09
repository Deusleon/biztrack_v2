import * as _n54 from 'express';
const express = _n54.default ?? _n54;
const router = express.Router();
import authMiddleware from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
import * as aiController from '../controllers/ai.controller.js';
router.get('/capabilities', authMiddleware, checkStorePermission(['ai_access']), aiController.getCapabilities);
router.get('/audit-logs', authMiddleware, aiController.getAuditLogs);
router.get('/provider-status', authMiddleware, checkStorePermission(['ai_access']), aiController.getProviderStatus);
router.get('/business-summary', authMiddleware, checkStorePermission(['ai_access']), aiController.getBusinessSummary);
router.get('/conversations', authMiddleware, checkStorePermission(['ai_access']), aiController.listConversations);
router.get('/conversations/:id', authMiddleware, checkStorePermission(['ai_access']), aiController.getConversation);
router.delete('/conversations/:id', authMiddleware, checkStorePermission(['ai_access']), aiController.deleteConversation);
router.post('/chat', authMiddleware, checkStorePermission(['ai_access']), aiController.chat);
router.post('/explain', authMiddleware, checkStorePermission(['ai_access']), aiController.explainReport);

export default router;