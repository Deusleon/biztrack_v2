import * as _n40 from 'express';
const express = _n40.default ?? _n40;
import * as salesController from '../controllers/sales.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkStorePermission } from '../middlewares/permissions.js';
import validate from '../middlewares/validate.js';
import { validateBarCode, validateSaleItems, validateCartItems, validateSaveOrder, validateCreditPayment, validateCreditNotification, validateSalesReturn, validateSalesOrderPayment } from '../validators/sales.validator.js';
const router = express.Router();

// =====================================================
// CART OPERATIONS
// =====================================================

// Get active (OnProcess) cart for current user
router.get(
    '/active-cart',
    verifyToken,
    checkStorePermission(['create_invoice']),
    salesController.getActiveCart
);

// Sync full cart state from frontend
router.post(
    '/sync-cart',
    verifyToken,
    checkStorePermission(['create_invoice']),
    salesController.syncActiveCart
);

// Get cart items by cart code
router.get(
    '/cart/:cartcode',
    verifyToken,
    checkStorePermission(['create_invoice']),
    salesController.getCartByCartCode
);

// Get current cart
router.get(
    '/cart',
    verifyToken,
    checkStorePermission(['create_invoice']),
    salesController.getCartByCartCode
);

// Add to cart by barcode
router.post(
    '/cart-by-barcode',
    verifyToken,
    checkStorePermission(['create_invoice']),
    validateBarCode,
    salesController.addToCartByBarcode
);

// Add to cart manually
router.post(
    '/cart',
    verifyToken,
    checkStorePermission(['create_invoice']),
    validateCartItems,
    salesController.addToCart
);

// Update cart item
router.put(
    '/cart/:id',
    verifyToken,
    checkStorePermission(['create_invoice']),
    validateCartItems,
    salesController.updateCartItem
);

// Remove cart item
router.delete(
    '/cart/:id',
    verifyToken,
    checkStorePermission(['create_invoice']),
    salesController.removeCartItem
);

// =====================================================
// SALE PROCESSING
// =====================================================

// Process sale (cash, credit, or order)
router.post(
    '/sell-cart',
    verifyToken,
    checkStorePermission(['create_invoice']),
    validateSaleItems,
    validate,
    salesController.recordSale
);

// Save order as pending
router.post(
    '/save-order',
    verifyToken,
    checkStorePermission(['create_invoice']),
    validateSaveOrder,
    validate,
    salesController.saveOrder
);

// Save order as pending
router.post(
    '/save-order-changes',
    verifyToken,
    checkStorePermission(['create_invoice']),
    validateSaveOrder,
    validate,
    salesController.saveOrderChanges
);

// =====================================================
// SALES ORDERS (PROFORMA)
// =====================================================

// Create sales order/proforma
router.post(
    '/orders/create',
    verifyToken,
    checkStorePermission(['create_invoice']),
    validateSaveOrder,
    validate,
    salesController.createSalesOrder
);

// Get all sales orders
router.get(
    '/orders',
    verifyToken,
    checkStorePermission(['create_invoice', 'view_pending_invoices', 'manage_pending_invoices']),
    salesController.getSalesOrders
);

// Get sales order details
router.get(
    '/orders/:id',
    verifyToken,
    checkStorePermission(['create_invoice', 'view_pending_invoices', 'manage_pending_invoices']),
    salesController.getSalesOrderDetails
);

// Record payment for sales order
router.post(
    '/orders/:id/payment',
    verifyToken,
    checkStorePermission(['create_invoice', 'manage_pending_invoices']),
    validateSalesOrderPayment,
    validate,
    salesController.recordSalesOrderPayment
);

// Complete a fully paid sales order
router.post(
    '/orders/:id/complete',
    verifyToken,
    checkStorePermission(['manage_pending_invoices']),
    salesController.completeSalesOrder
);

// Cancel order
router.put(
    '/orders/:cartCode/cancel',
    verifyToken,
    checkStorePermission(['manage_pending_invoices']),
    salesController.cancelOrder
);

// Reopen order
router.put(
    '/orders/:cartCode/reopen',
    verifyToken,
    checkStorePermission(['create_invoice', 'manage_pending_invoices']),
    salesController.reopenOrder
);

// Sell pending order directly
router.post(
    '/orders/:cartCode/sell',
    verifyToken,
    checkStorePermission(['create_invoice', 'manage_pending_invoices']),
    salesController.sellPendingOrder
);

// Delete pending/saved order (only if no payment records)
router.delete(
    '/orders/:cartCode',
    verifyToken,
    checkStorePermission(['create_invoice', 'manage_pending_invoices']),
    salesController.deletePendingOrder
);

// =====================================================
// CREDIT SALES / DEBITS
// =====================================================

// Get all credit sales (supports status, customerId, startDate, endDate filters)
router.get(
    '/credit',
    verifyToken,
    checkStorePermission(['view_debits', 'view_credit_sales', 'manage_credit_sales']),
    salesController.getCreditSales
);

// Mark past-due credit sales as overdue (batch update)
router.post(
    '/credit/mark-overdue',
    verifyToken,
    checkStorePermission(['manage_credit_sales']),
    salesController.markOverdueCreditSales
);

// Get credit sale details
router.get(
    '/credit/:id',
    verifyToken,
    checkStorePermission(['view_debits', 'view_credit_sales', 'manage_credit_sales']),
    salesController.getCreditSaleDetails
);

// Record credit payment
router.post(
    '/credit/:id/payment',
    verifyToken,
    checkStorePermission(['manage_credit_sales']),
    validateCreditPayment,
    validate,
    salesController.recordCreditPayment
);

// Send reminder notification to customer for a credit sale
router.post(
    '/credit/:id/notify',
    verifyToken,
    checkStorePermission(['manage_credit_sales']),
    validateCreditNotification,
    validate,
    salesController.notifyCreditSale
);

// =====================================================
// SALES HISTORY
// =====================================================

// Get sales history
router.get(
    '/history',
    verifyToken,
    checkStorePermission(['view_sales_records', 'create_invoice']),
    salesController.getSalesHistory
);

// Get sale details by invoice number
router.get(
    '/history/:invoiceNumber',
    verifyToken,
    checkStorePermission(['view_sales_records', 'create_invoice']),
    salesController.getSaleDetails
);

// =====================================================
// SALES RETURNS
// =====================================================

// Create sales return
router.post(
    '/returns',
    verifyToken,
    checkStorePermission(['create_sales_return']),
    validateSalesReturn,
    validate,
    salesController.createSalesReturn
);

// Get all sales returns
router.get(
    '/returns',
    verifyToken,
    checkStorePermission(['view_sales_returns', 'create_sales_return']),
    salesController.getSalesReturns
);

// Get sales return details
router.get(
    '/returns/:id',
    verifyToken,
    checkStorePermission(['view_sales_returns', 'create_sales_return']),
    salesController.getSalesReturnDetails
);

// Approve sales return
router.post(
    '/returns/:id/approve',
    verifyToken,
    checkStorePermission(['create_sales_return']),
    salesController.approveSalesReturn
);

// Reject sales return
router.post(
    '/returns/:id/reject',
    verifyToken,
    checkStorePermission(['create_sales_return']),
    salesController.rejectSalesReturn
);

// =====================================================
// PENDING/SAVED ORDERS (LEGACY)
// =====================================================

// Get pending/saved orders
router.get(
    '/get-orders',
    verifyToken,
    checkStorePermission(['create_invoice', 'view_pending_invoices', 'manage_pending_invoices']),
    salesController.getOrders
);

// Get order details by cart code
router.get(
    '/get-orders/:cartCode',
    verifyToken,
    checkStorePermission(['create_invoice', 'view_pending_invoices', 'manage_pending_invoices']),
    salesController.getOrderDetails
);

// Get order details for edit by cart code
router.get(
    '/edit-orders/:cartCode',
    verifyToken,
    checkStorePermission(['create_invoice', 'view_pending_invoices', 'manage_pending_invoices']),
    salesController.getOrderDetailsForEdit
);

// Record order payment
router.post(
    '/order-payments',
    verifyToken,
    checkStorePermission(['create_invoice', 'manage_pending_invoices']),
    salesController.saveOrderPayments
);

export default router;