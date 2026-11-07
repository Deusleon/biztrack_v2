import * as _p23 from 'express-validator';
const {  body, param, query  } = _p23.default ?? _p23;
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
// =====================================================
// PURCHASE ORDER VALIDATORS
// =====================================================

export const validateCreatePurchaseOrder = [
    body('supplier_id')
        .notEmpty().withMessage((_, { req }) => t('supplier_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_supplier_id', getLang(req))),

    body('expected_delivery_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    body('delivery_address')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_address', getLang(req)))
        .trim(),

    body('payment_terms')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_payment_terms', getLang(req)))
        .trim(),

    body('notes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim(),

    body('items')
        .isArray({ min: 1 }).withMessage((_, { req }) => t('at_least_one_item_required', getLang(req))),

    body('items.*.product_id')
        .notEmpty().withMessage((_, { req }) => t('product_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('items.*.quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ min: 0.001 }).withMessage((_, { req }) => t('quantity_must_be_positive', getLang(req))),

    body('items.*.unit_price')
        .notEmpty().withMessage((_, { req }) => t('unit_price_required', getLang(req)))
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('price_must_be_positive', getLang(req))),

    body('items.*.tax_rate')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0, max: 100 }).withMessage((_, { req }) => t('invalid_tax_rate', getLang(req))),

    body('items.*.discount_percent')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0, max: 100 }).withMessage((_, { req }) => t('invalid_discount_percent', getLang(req))),
];

export const validateUpdatePurchaseOrder = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_purchase_order_id', getLang(req))),

    body('supplier_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_supplier_id', getLang(req))),

    body('expected_delivery_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    body('status')
        .optional({ checkFalsy: true })
        .isIn(['draft', 'pending_approval', 'approved', 'cancelled'])
        .withMessage((_, { req }) => t('invalid_status', getLang(req))),

    body('items')
        .optional({ checkFalsy: true })
        .isArray({ min: 1 }).withMessage((_, { req }) => t('at_least_one_item_required', getLang(req))),
];

export const validatePurchaseOrderId = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_purchase_order_id', getLang(req))),
];

export const validateApprovePurchaseOrder = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_purchase_order_id', getLang(req))),

    body('approval_status')
        .notEmpty().withMessage((_, { req }) => t('approval_status_required', getLang(req)))
        .isIn(['approved', 'cancelled'])
        .withMessage((_, { req }) => t('invalid_approval_status', getLang(req))),

    body('rejection_reason')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_rejection_reason', getLang(req)))
        .trim(),
];

// =====================================================
// GRN VALIDATORS
// =====================================================

export const validateCreateGRN = [
    body('supplier_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_supplier_id', getLang(req))),

    body('purchase_order_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_purchase_order_id', getLang(req))),

    body('supplier_delivery_note')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_delivery_note', getLang(req)))
        .trim(),

    body('supplier_invoice_number')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_invoice_number', getLang(req)))
        .trim(),

    body('notes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim(),

    body('items')
        .isArray({ min: 1 }).withMessage((_, { req }) => t('at_least_one_item_required', getLang(req))),

    body('items.*.product_id')
        .notEmpty().withMessage((_, { req }) => t('product_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('items.*.quantity_received')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ min: 0.001 }).withMessage((_, { req }) => t('quantity_must_be_positive', getLang(req))),

    body('items.*.unit_price')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('cost_must_be_positive', getLang(req))),

    body('items.*.batch_number')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_batch_number', getLang(req)))
        .trim(),

    body('items.*.expiry_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    body('items.*.manufacturing_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),
];

export const validateUpdateGRN = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_grn_id', getLang(req))),

    body('status')
        .optional({ checkFalsy: true })
        .isIn(['draft', 'pending_inspection', 'approved', 'rejected', 'cancelled'])
        .withMessage((_, { req }) => t('invalid_status', getLang(req))),

    body('items')
        .optional({ checkFalsy: true })
        .isArray({ min: 1 }).withMessage((_, { req }) => t('at_least_one_item_required', getLang(req))),
];

export const validateGRNId = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_grn_id', getLang(req))),
];

export const validateInspectGRN = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_grn_id', getLang(req))),

    body('inspection_status')
        .optional({ checkFalsy: true })
        .isIn(['passed', 'failed', 'partial'])
        .withMessage((_, { req }) => t('invalid_inspection_status', getLang(req))),

    body('inspection_notes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim(),

    body('items')
        .optional({ checkFalsy: true })
        .isArray().withMessage((_, { req }) => t('invalid_items', getLang(req))),

    body('items.*.id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_item_id', getLang(req))),

    body('items.*.accepted_quantity')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('quantity_must_be_positive', getLang(req))),

    body('items.*.rejected_quantity')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('quantity_must_be_positive', getLang(req))),

    body('items.*.rejection_reason')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_rejection_reason', getLang(req)))
        .trim(),
];

// =====================================================
// SUPPLIER INVOICE VALIDATORS
// =====================================================

export const validateCreateSupplierInvoice = [
    body('supplier_id')
        .notEmpty().withMessage((_, { req }) => t('supplier_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_supplier_id', getLang(req))),

    body('purchase_order_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_purchase_order_id', getLang(req))),

    body('grn_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_grn_id', getLang(req))),

    body('supplier_invoice_number')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_invoice_number', getLang(req)))
        .trim(),

    body('invoice_date')
        .notEmpty().withMessage((_, { req }) => t('invoice_date_required', getLang(req)))
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    body('due_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    body('total_amount')
        .notEmpty().withMessage((_, { req }) => t('total_amount_required', getLang(req)))
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('amount_must_be_positive', getLang(req))),

    body('tax_amount')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('amount_must_be_positive', getLang(req))),

    body('discount_amount')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('amount_must_be_positive', getLang(req))),

    body('notes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim(),

    body('items')
        .optional({ checkFalsy: true })
        .isArray().withMessage((_, { req }) => t('invalid_items', getLang(req))),

    body('items.*.description')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('description_required', getLang(req)))
        .trim(),

    body('items.*.quantity')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0.001 }).withMessage((_, { req }) => t('quantity_must_be_positive', getLang(req))),

    body('items.*.unit_price')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('price_must_be_positive', getLang(req))),
];

export const validateUpdateSupplierInvoice = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_invoice_id', getLang(req))),

    body('status')
        .optional({ checkFalsy: true })
        .isIn(['draft', 'pending', 'approved', 'cancelled'])
        .withMessage((_, { req }) => t('invalid_status', getLang(req))),
];

export const validateSupplierInvoiceId = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_invoice_id', getLang(req))),
];

// =====================================================
// SUPPLIER PAYMENT VALIDATORS
// =====================================================

export const validateCreateSupplierPayment = [
    body('supplier_id')
        .notEmpty().withMessage((_, { req }) => t('supplier_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_supplier_id', getLang(req))),

    body('supplier_invoice_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_invoice_id', getLang(req))),

    body('amount')
        .notEmpty().withMessage((_, { req }) => t('amount_required', getLang(req)))
        .isFloat({ min: 0.01 }).withMessage((_, { req }) => t('amount_must_be_positive', getLang(req))),

    body('payment_method')
        .notEmpty().withMessage((_, { req }) => t('payment_method_required', getLang(req)))
        .isIn(['cash', 'bank_transfer', 'cheque', 'mobile_money', 'credit_note'])
        .withMessage((_, { req }) => t('invalid_payment_method', getLang(req))),

    body('payment_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    body('reference_number')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_reference_number', getLang(req)))
        .trim(),

    body('bank_name')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_bank_name', getLang(req)))
        .trim(),

    body('account_number')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_account_number', getLang(req)))
        .trim(),

    body('notes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim(),
];

export const validateSupplierPaymentId = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_payment_id', getLang(req))),
];

// =====================================================
// SUPPLIER RETURN VALIDATORS
// =====================================================

export const validateCreateSupplierReturn = [
    body('supplier_id')
        .notEmpty().withMessage((_, { req }) => t('supplier_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_supplier_id', getLang(req))),

    body('grn_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_grn_id', getLang(req))),

    body('supplier_invoice_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_invoice_id', getLang(req))),

    body('return_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    body('return_reason')
        .notEmpty().withMessage((_, { req }) => t('return_reason_required', getLang(req)))
        .isIn(['damaged', 'wrong_item', 'quality_issue', 'expired', 'excess', 'other'])
        .withMessage((_, { req }) => t('invalid_return_reason', getLang(req))),

    body('reason_details')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_reason_details', getLang(req)))
        .trim(),

    body('refund_method')
        .optional({ checkFalsy: true })
        .isIn(['apply_to_invoice', 'credit_note', 'cash_refund', 'bank_refund', 'mobile_money'])
        .withMessage((_, { req }) => t('invalid_payment_method', getLang(req))),

    body('refund_reference')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_reference_number', getLang(req)))
        .trim(),

    body('notes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim(),

    body('items')
        .isArray({ min: 1 }).withMessage((_, { req }) => t('at_least_one_item_required', getLang(req))),

    body('items.*.product_id')
        .notEmpty().withMessage((_, { req }) => t('product_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('items.*.quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ min: 0.001 }).withMessage((_, { req }) => t('quantity_must_be_positive', getLang(req))),

    body('items.*.unit_cost')
        .notEmpty().withMessage((_, { req }) => t('unit_cost_required', getLang(req)))
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('cost_must_be_positive', getLang(req))),

    body('items.*.batch_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_batch_id', getLang(req))),

    body('items.*.reason')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_reason', getLang(req)))
        .trim(),

    body('items.*.condition')
        .optional({ checkFalsy: true })
        .isIn(['damaged', 'expired', 'wrong_item', 'quality_issue'])
        .withMessage((_, { req }) => t('invalid_condition', getLang(req))),
];

export const validateUpdateSupplierReturn = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_return_id', getLang(req))),

    body('status')
        .optional({ checkFalsy: true })
        .isIn(['draft', 'pending_approval', 'approved', 'shipped', 'received_by_supplier', 'credited', 'cancelled'])
        .withMessage((_, { req }) => t('invalid_status', getLang(req))),
];

export const validateSupplierReturnId = [
    param('id')
        .isUUID().withMessage((_, { req }) => t('invalid_return_id', getLang(req))),
];

export const validateSyncPurchaseCart = [
    body('supplier_id')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_supplier_id', getLang(req))),

    body('expected_delivery_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    body('delivery_address')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_address', getLang(req)))
        .trim(),

    body('payment_terms')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_payment_terms', getLang(req)))
        .trim(),

    body('notes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim(),

    body('internal_notes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim(),

    body('items')
        .optional({ checkFalsy: true })
        .isArray().withMessage((_, { req }) => t('invalid_items', getLang(req))),

    body('items.*.product_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('items.*.quantity')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0.001 }).withMessage((_, { req }) => t('quantity_must_be_positive', getLang(req))),

    body('items.*.unit_price')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('price_must_be_positive', getLang(req))),

    body('items.*.tax_rate')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0, max: 100 }).withMessage((_, { req }) => t('invalid_tax_rate', getLang(req))),

    body('items.*.discount_percent')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0, max: 100 }).withMessage((_, { req }) => t('invalid_discount_percent', getLang(req))),
];

// =====================================================
// QUERY VALIDATORS
// =====================================================

export const validatePurchaseQuery = [
    query('page')
        .optional({ checkFalsy: true })
        .isInt({ min: 1 }).withMessage((_, { req }) => t('invalid_page', getLang(req))),

    query('limit')
        .optional({ checkFalsy: true })
        .isInt({ min: 1, max: 100 }).withMessage((_, { req }) => t('invalid_limit', getLang(req))),

    query('status')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_status', getLang(req))),

    query('supplier_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_supplier_id', getLang(req))),

    query('grn_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_grn_id', getLang(req))),

    query('from_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    query('to_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage((_, { req }) => t('invalid_date_format', getLang(req))),

    query('search')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_search', getLang(req)))
        .trim(),
];

