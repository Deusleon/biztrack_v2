import * as _n65 from 'express';
const express = _n65.default ?? _n65;
import * as stockCountController from '../controllers/stockCount.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
import validate from '../middlewares/validate.js';
import { validateGetMovements, validateSaveStockCount, validateGetStockCountHistory } from '../validators/stockCount.validator.js';
const router = express.Router();

// ==================== STOCK MOVEMENTS (Incoming/Outgoing) ====================

// ✅ 1. Get Stock Movements by Type (IN/OUT)
router.get(
    '/movements',
    verifyToken,
    checkStorePermission(['view_stock_count', 'view_inventory', 'view_inventory_reports']),
    validateGetMovements,
    validate,
    stockCountController.getStockMovementsByType
);

// ==================== STOCK COUNT ====================

// ✅ 2. Get Products for Stock Count
router.get(
    '/products',
    verifyToken,
    checkStorePermission(['view_stock_count', 'create_stock_count']),
    stockCountController.getProductsForStockCount
);

// ✅ 3. Save Stock Count Results
router.post(
    '/save',
    verifyToken,
    checkStorePermission(['create_stock_count']),
    validateSaveStockCount,
    validate,
    stockCountController.saveStockCount
);

// ✅ 4. Get Stock Count History
router.get(
    '/history',
    verifyToken,
    checkStorePermission(['view_stock_count']),
    validateGetStockCountHistory,
    validate,
    stockCountController.getStockCountHistory
);

// ✅ 5. Get Stock Count Detail
router.get(
    '/history/:stockCountId',
    verifyToken,
    checkStorePermission(['view_stock_count']),
    stockCountController.getStockCountDetail
);

// ==================== ADJUSTMENT HISTORY IMPROVEMENTS ====================

// ✅ 6. Get Adjustments Grouped by Product
router.get(
    '/adjustments-by-product',
    verifyToken,
    checkStorePermission(['view_stock_count', 'view_stock_adjustment']),
    stockCountController.getAdjustmentsByProduct
);

// ✅ 7. Get All Adjustments for a Product
router.get(
    '/adjustments/:productId',
    verifyToken,
    checkStorePermission(['view_stock_count', 'view_stock_adjustment']),
    stockCountController.getProductAdjustments
);

export default router;