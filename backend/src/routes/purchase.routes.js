import * as _n67 from 'express';
const express = _n67.default ?? _n67;
const router = express.Router();

// Controllers
import * as purchaseOrderController from '../controllers/purchaseOrder.controller.js';
import * as supplierInvoiceController from '../controllers/supplierInvoice.controller.js';
// Middlewares
import verifyToken from '../middlewares/authMiddleware.js';
import { checkPermission } from '../middlewares/checkPermission.js';
import validate from '../middlewares/validate.js';
// Validators
import { validateCreatePurchaseOrder, validateUpdatePurchaseOrder, validatePurchaseOrderId, validateApprovePurchaseOrder, validateCreateGRN, validateUpdateGRN, validateGRNId, validateInspectGRN, validateCreateSupplierInvoice, validateUpdateSupplierInvoice, validateSupplierInvoiceId, validateCreateSupplierPayment, validateSupplierPaymentId, validateCreateSupplierReturn, validateUpdateSupplierReturn, validateSupplierReturnId, validateSyncPurchaseCart, validatePurchaseQuery } from '../validators/purchase.validator.js';
// =====================================================
// PURCHASE ORDERS ROUTES
// =====================================================

router.get(
    '/active-cart',
    verifyToken,
    checkPermission('create_purchase_orders'),
    purchaseOrderController.getActivePurchaseCart
);

router.post(
    '/sync-cart',
    verifyToken,
    checkPermission('create_purchase_orders'),
    validateSyncPurchaseCart,
    validate,
    purchaseOrderController.syncActivePurchaseCart
);

// Get all purchase orders
router.get(
    '/orders',
    verifyToken,
    checkPermission('view_purchase_orders'),
    validatePurchaseQuery,
    validate,
    purchaseOrderController.getPurchaseOrders
);

// Get single purchase order
router.get(
    '/orders/:id',
    verifyToken,
    checkPermission('view_purchase_orders'),
    validatePurchaseOrderId,
    validate,
    purchaseOrderController.getPurchaseOrderById
);

// Create purchase order
router.post(
    '/orders',
    verifyToken,
    checkPermission('create_purchase_orders'),
    validateCreatePurchaseOrder,
    validate,
    purchaseOrderController.createPurchaseOrder
);

// Update purchase order
router.put(
    '/orders/:id',
    verifyToken,
    checkPermission('update_purchase_orders'),
    validateUpdatePurchaseOrder,
    validate,
    purchaseOrderController.updatePurchaseOrder
);

// Approve/Reject purchase order
router.post(
    '/orders/:id/approve',
    verifyToken,
    checkPermission('approve_purchase_orders'),
    validateApprovePurchaseOrder,
    validate,
    purchaseOrderController.approvePurchaseOrder
);

// Delete purchase order
router.delete(
    '/orders/:id',
    verifyToken,
    checkPermission('delete_purchase_orders'),
    validatePurchaseOrderId,
    validate,
    purchaseOrderController.deletePurchaseOrder
);

// =====================================================
// GOODS RECEIVED NOTES (GRN) ROUTES
// =====================================================

// Get all GRNs
router.get(
    '/grn',
    verifyToken,
    checkPermission('view_grn'),
    validatePurchaseQuery,
    validate,
    purchaseOrderController.getGRNs
);

// Get single GRN
router.get(
    '/grn/:id',
    verifyToken,
    checkPermission('view_grn'),
    validateGRNId,
    validate,
    purchaseOrderController.getGRNById
);

// Create GRN
router.post(
    '/grn',
    verifyToken,
    checkPermission('create_grn'),
    validateCreateGRN,
    validate,
    purchaseOrderController.createGRN
);

// Inspect GRN
router.post(
    '/grn/:id/inspect',
    verifyToken,
    checkPermission('approve_grn'),
    validateInspectGRN,
    validate,
    purchaseOrderController.inspectGRN
);

// Delete GRN
router.delete(
    '/grn/:id',
    verifyToken,
    checkPermission('delete_grn'),
    validateGRNId,
    validate,
    purchaseOrderController.deleteGRN
);

// =====================================================
// SUPPLIER INVOICES (BILLS) ROUTES
// =====================================================

// Get all supplier invoices
router.get(
    '/invoices',
    verifyToken,
    checkPermission('view_supplier_invoices'),
    validatePurchaseQuery,
    validate,
    supplierInvoiceController.getSupplierInvoices
);

// Get single supplier invoice
router.get(
    '/invoices/:id',
    verifyToken,
    checkPermission('view_supplier_invoices'),
    validateSupplierInvoiceId,
    validate,
    supplierInvoiceController.getSupplierInvoiceById
);

// Create supplier invoice
router.post(
    '/invoices',
    verifyToken,
    checkPermission('create_supplier_invoices'),
    validateCreateSupplierInvoice,
    validate,
    supplierInvoiceController.createSupplierInvoice
);

// Update supplier invoice
router.put(
    '/invoices/:id',
    verifyToken,
    checkPermission('update_supplier_invoices'),
    validateUpdateSupplierInvoice,
    validate,
    supplierInvoiceController.updateSupplierInvoice
);

// Delete supplier invoice
router.delete(
    '/invoices/:id',
    verifyToken,
    checkPermission('delete_supplier_invoices'),
    validateSupplierInvoiceId,
    validate,
    supplierInvoiceController.deleteSupplierInvoice
);

// =====================================================
// SUPPLIER PAYMENTS ROUTES
// =====================================================

// Get all supplier payments
router.get(
    '/payments',
    verifyToken,
    checkPermission('view_supplier_payments'),
    validatePurchaseQuery,
    validate,
    supplierInvoiceController.getSupplierPayments
);

// Get single supplier payment
router.get(
    '/payments/:id',
    verifyToken,
    checkPermission('view_supplier_payments'),
    validateSupplierPaymentId,
    validate,
    supplierInvoiceController.getSupplierPaymentById
);

// Create supplier payment
router.post(
    '/payments',
    verifyToken,
    checkPermission('create_supplier_payments'),
    validateCreateSupplierPayment,
    validate,
    supplierInvoiceController.createSupplierPayment
);

// Void supplier payment
router.delete(
    '/payments/:id',
    verifyToken,
    checkPermission('delete_supplier_payments'),
    validateSupplierPaymentId,
    validate,
    supplierInvoiceController.deleteSupplierPayment
);

// =====================================================
// SUPPLIER RETURNS ROUTES
// =====================================================

// Get all supplier returns
router.get(
    '/returns',
    verifyToken,
    checkPermission('view_supplier_returns'),
    validatePurchaseQuery,
    validate,
    supplierInvoiceController.getSupplierReturns
);

// Get single supplier return
router.get(
    '/returns/:id',
    verifyToken,
    checkPermission('view_supplier_returns'),
    validateSupplierReturnId,
    validate,
    supplierInvoiceController.getSupplierReturnById
);

// Create supplier return
router.post(
    '/returns',
    verifyToken,
    checkPermission('create_supplier_returns'),
    validateCreateSupplierReturn,
    validate,
    supplierInvoiceController.createSupplierReturn
);

// Approve supplier return
router.post(
    '/returns/:id/approve',
    verifyToken,
    checkPermission('approve_supplier_returns'),
    validateSupplierReturnId,
    validate,
    supplierInvoiceController.approveSupplierReturn
);

// Delete supplier return
router.delete(
    '/returns/:id',
    verifyToken,
    checkPermission('delete_supplier_returns'),
    validateSupplierReturnId,
    validate,
    supplierInvoiceController.deleteSupplierReturn
);

// =====================================================
// DASHBOARD & REPORTS ROUTES
// =====================================================

// Get purchase dashboard
router.get(
    '/dashboard',
    verifyToken,
    checkPermission('view_purchase_reports'),
    supplierInvoiceController.getPurchaseDashboard
);

// Get supplier statement
router.get(
    '/supplier/:supplierId/statement',
    verifyToken,
    checkPermission('view_supplier_invoices'),
    supplierInvoiceController.getSupplierStatement
);

export default router;