import * as _n63 from 'express';
const express = _n63.default ?? _n63;
import * as productController from '../controllers/product.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission, checkStoreMember } from '../middlewares/permissions.js';
import validate from '../middlewares/validate.js';
import { validateProduct } from '../validators/product.validator.js';
const router = express.Router();

// Get all products for a store
router.get('/:storeId', verifyToken, checkStoreMember, productController.getProducts); // Retrieve products for a specific store

// Get product by barcode
router.get('/:storeId/barcode/:barcode', verifyToken, checkStoreMember, productController.getProductByBarcode);

// Add a new product
router.post('/', verifyToken, checkStorePermission(['create_products']), // Only admin or manager can add products
  validateProduct, // Validate input for addProduct
  validate,
  productController.addProduct
);

// Update an existing product
router.put('/:id', verifyToken, checkStorePermission(['update_products']), // Only admin or manager can update products
  validateProduct, // Validate input for updateProduct
  validate,
  productController.updateProduct
);

// Delete a product
router.delete('/:id', verifyToken, checkStorePermission(['delete_products']), // Only admin or manager can delete products
  productController.deleteProduct
);

// Delete a product
router.delete('/bulk/:id', verifyToken, checkStorePermission(['delete_products']), // Only admin or manager can delete products
  productController.deleteBulkProduct
);

export default router;