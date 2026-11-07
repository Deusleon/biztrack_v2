import * as _n66 from 'express';
const express = _n66.default ?? _n66;
import * as categoryController from '../controllers/category.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission, checkStoreMember } from '../middlewares/permissions.js';
import validate from '../middlewares/validate.js';
import { validateCategory } from '../validators/category.validator.js';
const router = express.Router();

// Routes
router.get('/:storeId', verifyToken, checkStoreMember, categoryController.getCategories); // Get all categories for a store

router.post('/', verifyToken, checkStorePermission(['create_product_categories']), // Only admin or manager can add
    validateCategory, // Validate the input
    validate,
    categoryController.addCategory
); // Add a new category

router.put('/:id', verifyToken, checkStorePermission(['update_product_categories']), // Only admin or manager can update
    validateCategory, // Validate the input
    validate,
    categoryController.updateCategory
); // Update an existing category

router.delete('/:id', verifyToken, checkStorePermission(['delete_product_categories']), // Only admin or manager can delete
    categoryController.deleteCategory
); // Delete a category

export default router;