import * as _n42 from 'express';
const express = _n42.default ?? _n42;
import * as priceListController from '../controllers/priceList.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
const router = express.Router();

// Pricelist endpoint (use before the param route to avoid conflicts)
router.get('/', verifyToken, checkStorePermission(['view_price_list', 'manage_price_list', 'create_invoice', 'view_current_stock_value', 'view_products']), priceListController.getPricelist);

// Update price for a product batch
router.put('/update-prices', verifyToken, checkStorePermission(['manage_price_list']),
  priceListController.updatePrices
);

export default router;