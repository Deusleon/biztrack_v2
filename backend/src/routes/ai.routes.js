import * as _n54 from 'express';
const express = _n54.default ?? _n54;
const router = express.Router();
import authMiddleware from '../middlewares/authMiddleware.js';
import * as aiController from '../controllers/ai.controller.js';
router.get('/capabilities', authMiddleware, aiController.getCapabilities);
router.get('/audit-logs', authMiddleware, aiController.getAuditLogs);
router.get('/provider-status', authMiddleware, aiController.getProviderStatus);
router.get('/business-summary', authMiddleware, aiController.getBusinessSummary);
router.get('/conversations', authMiddleware, aiController.listConversations);
router.get('/conversations/:id', authMiddleware, aiController.getConversation);
router.delete('/conversations/:id', authMiddleware, aiController.deleteConversation);
router.post('/chat', authMiddleware, aiController.chat);
router.post('/explain', authMiddleware, aiController.explainReport);

export default router;