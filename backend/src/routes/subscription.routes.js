import * as _n51 from 'express';
const express = _n51.default ?? _n51;
import * as subscriptionController from '../controllers/subscription.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
const router = express.Router();

router.post('/webhooks/clickpesa', subscriptionController.clickpesaWebhook);

router.get('/plans', verifyToken, subscriptionController.getPlans);
router.get('/me', verifyToken, subscriptionController.getMySubscription);
router.get('/history', verifyToken, subscriptionController.getMyTransactions);
router.post('/checkout', verifyToken, checkStorePermission(['view_subscription']), subscriptionController.createCheckout);
router.post('/verify/:transactionId', verifyToken, checkStorePermission(['view_subscription']), subscriptionController.verifyTransaction);

export default router;