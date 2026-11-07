import * as _n59 from 'express';
const express = _n59.default ?? _n59;
import * as priceCategoryController from '../controllers/priceCategory.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkPermission } from '../middlewares/checkPermission.js';
import { checkStoreMember } from '../middlewares/permissions.js';
import validate from '../middlewares/validate.js';
import { validatePriceCategory } from '../validators/priceCategory.validator.js';
const router = express.Router();

// Routes
router.get('/:storeId', verifyToken, checkStoreMember, priceCategoryController.getPriceCategories); // Get all price categories for a store

router.post('/', 
    verifyToken, 
    checkPermission('create_price_categories'),
    validatePriceCategory, // Validate the input
    validate,
    priceCategoryController.addPriceCategory
); // Add a new price category

router.put('/:id', 
    verifyToken, 
    checkPermission('update_price_categories'),
    validatePriceCategory, // Validate the input
    validate,
    priceCategoryController.updatePriceCategory
); // Update an existing price category

router.delete('/:id', 
    verifyToken, 
    checkPermission('delete_price_categories'),
    priceCategoryController.deletePriceCategory
); // Delete a price category

export default router;