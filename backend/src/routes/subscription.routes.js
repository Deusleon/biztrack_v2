import * as _n51 from 'express';
const express = _n51.default ?? _n51;
import * as subscriptionController from '../controllers/subscription.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
import { developerOnly, isDeveloper } from '../middlewares/developerOnly.js';
const router = express.Router();

router.post('/webhooks/clickpesa', subscriptionController.clickpesaWebhook);

router.get('/manual/stores', verifyToken, developerOnly, subscriptionController.listManualStores);
router.post('/manual', verifyToken, developerOnly, subscriptionController.recordManualPayment);

const viewSub = (req, res, next) => (isDeveloper(req.user) ? next() : checkStorePermission(['view_subscription'])(req, res, next));
const manageSub = (req, res, next) => (isDeveloper(req.user) ? next() : checkStorePermission(['manage_subscription'])(req, res, next));

router.get('/plans', verifyToken, viewSub, subscriptionController.getPlans);
router.get('/me', verifyToken, viewSub, subscriptionController.getMySubscription);
router.get('/history', verifyToken, viewSub, subscriptionController.getMyTransactions);
router.post('/checkout', verifyToken, manageSub, subscriptionController.createCheckout);
router.post('/verify/:transactionId', verifyToken, manageSub, subscriptionController.verifyTransaction);

export default router;