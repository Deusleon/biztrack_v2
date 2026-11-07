import * as _n47 from 'express';
const express = _n47.default ?? _n47;
import * as customerController from '../controllers/customer.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
import validate from '../middlewares/validate.js';
import { validateCustomerCRUD } from '../validators/customer.validator.js';
const router = express.Router();

// Get all customers for a store
router.get(
    '/:storeId',
    verifyToken,
    checkStorePermission(['view_customers', 'create_invoice', 'view_debits', 'create_sales_return']),
    customerController.getStoreCustomers
);

// Create a new customer
router.post(
    '/',
    verifyToken,
    checkStorePermission(['create_customers', 'create_invoice']),
    validateCustomerCRUD,
    validate,
    customerController.createCustomer
);

// Update a customer
router.put(
    '/:id',
    verifyToken,
    checkStorePermission(['update_customers']),
    validateCustomerCRUD,
    validate,
    customerController.updateCustomer
);

// Delete a customer
router.delete(
    '/:id',
    verifyToken,
    checkStorePermission(['delete_customers']),
    customerController.deleteCustomer
);

export default router;