import * as _n53 from 'express';
const express = _n53.default ?? _n53;
import * as supplierController from '../controllers/supplier.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission, checkStoreMember } from '../middlewares/permissions.js';
import validate from '../middlewares/validate.js';
import { validateSupplier } from '../validators/supplier.validator.js';
const router = express.Router();

// Routes
router.get('/:storeId', verifyToken, checkStoreMember, supplierController.getSuppliers); // Get all suppliers for a store

router.post('/', 
    verifyToken, 
    checkStorePermission(['create_suppliers']), // Only owner, admin or manager can add
    validateSupplier, // Validate the input
    validate,
    supplierController.addSupplier
); // Add a new supplier

router.put('/:id', 
    verifyToken, 
    checkStorePermission(['update_suppliers']), // Only owner, admin or manager can update
    validateSupplier, // Validate the input
    validate,
    supplierController.updateSupplier
); // Update an existing supplier

router.delete('/:id', 
    verifyToken, 
    checkStorePermission(['delete_suppliers']), // Only owner, admin or manager can delete
    supplierController.deleteSupplier
); // Delete a supplier

export default router;