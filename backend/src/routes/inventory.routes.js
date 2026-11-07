import * as _n39 from 'express';
const express = _n39.default ?? _n39;
import * as inventoryController from '../controllers/inventory.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
import validate from '../middlewares/validate.js';
import { validateAddStock, validateGetStock, validateSaleStock, validateGetLowStock, validateRemoveStock, validateGetMovements, validateGetBatchDetails, validateCheckExpiry, validateUpdateBatch, validateStockAdjustment, validateGetStockAdjustments } from '../validators/inventory.validator.js';
const router = express.Router();

// ✅ 1. Kuongeza bidhaa kwenye stock
router.post('/in', 
    verifyToken, 
    checkStorePermission(['create_stock_adjustment', 'create_grn']), // only authorized roles can add stock
    validateAddStock,
    validate,
    inventoryController.addStock
);

// ✅ 2 (a). Kupata stock ya bidhaa moja
router.get(
    '/stock',
    verifyToken,
    checkStorePermission(['view_inventory', 'view_current_stock', 'view_products', 'create_invoice']), 
    validateGetStock,
    validate,
    inventoryController.getStock
);

// ✅ 2 (b). Kupata stock ya bidhaa zote
router.get(
    '/store-stock',
    verifyToken,
    checkStorePermission(['view_inventory', 'view_current_stock', 'create_invoice', 'view_stock_transfer', 'create_stock_transfer', 'view_stock_adjustment', 'create_stock_adjustment', 'view_stock_count', 'create_stock_count']),
    inventoryController.getStoreWideStock
);

// ✅ 2 (c). Kupata maelezo ya batch
router.get(
    '/batch-details',
    verifyToken,
    checkStorePermission(['view_inventory', 'view_current_stock', 'create_invoice', 'view_stock_adjustment', 'create_stock_adjustment']),
    validateGetBatchDetails,
    validate,
    inventoryController.getBatchDetails
);

// ✅ 2 (d). Kupata stock Inayoisha
router.get(
    '/low-stock',
    verifyToken,
    checkStorePermission(['view_inventory', 'view_current_stock', 'view_products', 'create_invoice', 'view_stock_below_minimum_report']),
    validateGetLowStock, 
    validate,
    inventoryController.getLowStock
);

// Sale recording is handled by routes/sales.routes.js via salesController.recordSale.
// The old /inventory/sales route was removed because inventoryController.recordSale
// is no longer exported.

// // ✅ 4. Kuondoa Stock (OUT)
// router.post(
//     '/out',
//     verifyToken,
//     checkStoreRole(['owner', 'admin', 'manager', 'cashier']),
//     validateRemoveStock,
//     validate,
//     inventoryController.removeStock
// );

// ✅ 5. Kuangalia Stock Movements
router.get(
    '/movements',
    verifyToken,
    checkStorePermission(['view_inventory', 'view_current_stock', 'view_inventory_reports', 'view_stock_count']),
    validateGetMovements,
    validate,
    inventoryController.getStockMovements
);

// ✅ 6. Kupata Expiry za Bidhaa
router.get(
    '/check-expiry',
    verifyToken,
    checkStorePermission(['view_inventory', 'view_current_stock', 'view_products', 'create_invoice']),
    validateCheckExpiry,
    validate,
    inventoryController.getExpiryRiskReport
);

// ✅ 7. Kupata Stock Value by Price Category
router.get(
    '/stock-value',
    verifyToken,
    checkStorePermission(['view_current_stock_value', 'view_inventory']),
    inventoryController.getStockValue
);

// ✅ 8. Save Stock Value History (Manual Snapshot)
router.post(
    '/stock-value-history',
    verifyToken,
    checkStorePermission(['save_stock_value_history']),
    inventoryController.saveStockValueHistory
);

// ✅ 9. Get Stock Value History List
router.get(
    '/stock-value-history',
    verifyToken,
    checkStorePermission(['view_stock_value_history']),
    inventoryController.getStockValueHistoryList
);

// ✅ 10. Get Stock Value History Detail
router.get(
    '/stock-value-history/:historyId',
    verifyToken,
    checkStorePermission(['view_stock_value_history']),
    inventoryController.getStockValueHistoryDetail
);

// ✅ 11. Delete Stock Value History
router.delete(
    '/stock-value-history/:historyId',
    verifyToken,
    checkStorePermission(['delete_stock_value_history']),
    inventoryController.deleteStockValueHistory
);

// ✅ 12. Update Batch Details
router.put(
    '/batch',
    verifyToken,
    checkStorePermission(['edit_batch']),
    validateUpdateBatch,
    validate,
    inventoryController.updateBatch
);

// ==================== STOCK ADJUSTMENT ROUTES ====================

// ✅ 13. Create Stock Adjustment
router.post(
    '/adjustment',
    verifyToken,
    checkStorePermission(['create_stock_adjustment']),
    validateStockAdjustment,
    validate,
    inventoryController.createStockAdjustment
);

// ✅ 14. Get Stock Adjustments History
router.get(
    '/adjustments',
    verifyToken,
    checkStorePermission(['view_stock_adjustment']),
    validateGetStockAdjustments,
    validate,
    inventoryController.getStockAdjustments
);

// ✅ 15. Get Single Adjustment Detail
router.get(
    '/adjustment/:adjustmentId',
    verifyToken,
    checkStorePermission(['view_stock_adjustment']),
    inventoryController.getStockAdjustmentDetail
);

// ✅ 16. Get Batch-wise Stock (for adjustment by batch)
router.get(
    '/batchwise-stock',
    verifyToken,
    checkStorePermission(['view_stock_adjustment', 'create_stock_adjustment', 'view_inventory']),
    inventoryController.getBatchwiseStock
);

// ✅ 17. Create Batch-wise Stock Adjustment
router.post(
    '/adjustment-batchwise',
    verifyToken,
    checkStorePermission(['create_stock_adjustment']),
    validateStockAdjustment,
    validate,
    inventoryController.createBatchwiseStockAdjustment
);

export default router;