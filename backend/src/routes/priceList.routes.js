import * as _n42 from 'express';
const express = _n42.default ?? _n42;
import * as priceListController from '../controllers/priceList.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
const router = express.Router();

// Pricelist endpoint (use before the param route to avoid conflicts)
router.get('/', verifyToken, priceListController.getPricelist);

// Update price for a product batch
router.put('/update-prices', verifyToken,
  priceListController.updatePrices
);

export default router;