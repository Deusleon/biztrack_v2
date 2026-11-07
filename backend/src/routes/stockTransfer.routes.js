import * as _n48 from 'express';
const express = _n48.default ?? _n48;
import * as stockTransferController from '../controllers/stockTransfer.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
import { checkPermission } from '../middlewares/checkPermission.js';
import validate from '../middlewares/validate.js';
import { validateCreateTransfer, validateReceiveTransfer, validateGetTransferHistory } from '../validators/stockTransfer.validator.js';
const router = express.Router();

// 1. Create Stock Transfer
router.post(
    '/',
    verifyToken,
    checkStorePermission(['create_stock_transfer']),
    validateCreateTransfer,
    validate,
    stockTransferController.createStockTransfer
);

// 2. Get Transfer History
router.get(
    '/history',
    verifyToken,
    checkStorePermission(['view_stock_transfer', 'create_stock_transfer']),
    validateGetTransferHistory,
    validate,
    stockTransferController.getTransferHistory
);

// 3. Get Single Transfer Detail
router.get(
    '/:transferId',
    verifyToken,
    checkStorePermission(['view_stock_transfer', 'create_stock_transfer']),
    stockTransferController.getTransferDetail
);

// 4. Receive/Accept Incoming Transfer
router.post(
    '/:transferId/receive',
    verifyToken,
    checkStorePermission(['create_stock_transfer', 'approve_stock_transfer']),
    stockTransferController.receiveTransfer
);

// 5. Approve Transfer (source store)
router.post(
    '/:transferId/approve',
    verifyToken,
    checkStorePermission(['approve_stock_transfer']),
    stockTransferController.approveTransfer
);

// 6. Cancel Pending Transfer
router.post(
    '/:transferId/cancel',
    verifyToken,
    checkStorePermission(['approve_stock_transfer', 'create_stock_transfer']),
    stockTransferController.cancelTransfer
);

// 7. Delete Stock Transfer
router.delete(
    '/:transferId',
    verifyToken,
    checkPermission('delete_stock_transfer'),
    stockTransferController.deleteTransfer
);

export default router;