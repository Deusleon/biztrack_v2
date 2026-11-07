import * as _p26 from 'express-validator';
const {  body, query  } = _p26.default ?? _p26;
import pool from '../config/db.js';
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
// ✅ 1. Validation add to cart by scanning
export const validateBarCode = [
    // Store validation
    body('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    // Items array validation
    body('barcode')
        .notEmpty().withMessage((_, { req }) => t('barcode_not_scanned', getLang(req))),
];

// ✅ 2. Validation add to cart
export const validateCartItems = [
    // Store validation
    body('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    // // Invoice validation
    // body('cart_code')
    //     .notEmpty().withMessage((_, { req }) => t('invoice_number_required', getLang(req))),

    body('product_id')
        .notEmpty().withMessage((_, { req }) => t('product_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ gt: 0, lt: 100001 }).withMessage((_, { req }) => t('quantity_too_large', getLang(req))),

    body('selling_price')
        .notEmpty().withMessage((_, { req }) => t('price_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_price', getLang(req))),

    body('discount')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_format', getLang(req)))
        .trim()
        .isLength({ min: 5 }).withMessage((_, { req }) => t('note_too_short', getLang(req))),
];

// ✅ 3. Validation sales items
export const validateSaleItems = [
    // Store validation
    body('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    // Invoice validation
    body('cart_code')
        .notEmpty().withMessage((_, { req }) => 'invoice_number_required'),

    // Items array validation
    body('items')
        .isArray({ min: 1 }).withMessage((_, { req }) => t('items_array_required', getLang(req))),

    body('items.*.product_id')
        .notEmpty().withMessage((_, { req }) => t('product_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('items.*.quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ gt: 0, lt: 100001 }).withMessage((_, { req }) => t('quantity_too_large', getLang(req))),

    body('items.*.selling_price')
        .notEmpty().withMessage((_, { req }) => t('price_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_price', getLang(req))),

    body('paymentNotes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_format', getLang(req)))
        .trim()
        .isLength({ min: 5 }).withMessage((_, { req }) => t('note_too_short', getLang(req))),

    body('paymentMethod')
        .notEmpty().withMessage((_, { req }) => t('payment_method_required', getLang(req)))
        .isIn(['cash', 'mobile_money', 'bank_transfer']).withMessage((_, { req }) => t('invalid_payment_type', getLang(req))),

    // Customer validation
    body('customer.id')
        // .if((_, { req }) => req.body.customerChecked === true)
        .optional()
        .notEmpty().withMessage((_, { req }) => t('customer_info_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('customer_info_not_found', getLang(req))),
];

// ✅ 3. Validation save order
export const validateSaveOrder = [
    // Store validation
    body('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    // Invoice validation
    body('cart_code')
        .notEmpty().withMessage((_, { req }) => t('invoice_number_required', getLang(req))),

    // Items array validation
    body('items')
        .isArray({ min: 1 }).withMessage((_, { req }) => t('items_array_required', getLang(req))),

    body('items.*.product_id')
        .notEmpty().withMessage((_, { req }) => t('product_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('items.*.quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ gt: 0, lt: 100001 }).withMessage((_, { req }) => t('quantity_too_large', getLang(req))),

    body('items.*.selling_price')
        .notEmpty().withMessage((_, { req }) => t('price_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_price', getLang(req))),

    body('paymentNotes')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_format', getLang(req)))
        .trim()
        .isLength({ min: 5 }).withMessage((_, { req }) => t('note_too_short', getLang(req))),

    body('paymentMethod')
        .notEmpty().withMessage((_, { req }) => t('payment_method_required', getLang(req)))
        .isIn(['cash', 'mpesa', 'mixx', 'airtelmoney', 'halopesa', 'bank', 'mobile']).withMessage((_, { req }) => t('invalid_payment_type', getLang(req))),

    // Sale type validation
    body('saleType')
        .optional()
        .isIn(['cash', 'credit', 'pending']).withMessage((_, { req }) => t('invalid_sale_type', getLang(req))),

    // Customer validation for credit sales
    body('customerId')
        .if((_, { req }) => req.body.saleType === 'credit')
        .notEmpty().withMessage((_, { req }) => t('customer_required_for_credit', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_customer_id', getLang(req))),

    // Customer validation
    body('customerName')
        .if((_, { req }) => req.body.customerChecked === true)
        .notEmpty().withMessage((_, { req }) => t('customer_info_required', getLang(req))),

    body('customerPhone')
        .if((_, { req }) => req.body.customerChecked === true)
        .notEmpty().withMessage((_, { req }) => t('customer_info_required', getLang(req))),
];

// ✅ 5. Validation for credit payment
export const validateCreditPayment = [
    body('amount')
        .notEmpty().withMessage((_, { req }) => t('amount_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_amount', getLang(req))),

    body('paymentMethod')
        .optional()
        .isIn(['cash', 'mpesa', 'mixx', 'airtelmoney', 'halopesa', 'bank', 'mobile']).withMessage((_, { req }) => t('invalid_payment_type', getLang(req))),

    body('referenceNumber')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_format', getLang(req))),

    body('notes')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_format', getLang(req))),
];

// ✅ 6. Validation for credit notification
export const validateCreditNotification = [
    body('message')
        .notEmpty().withMessage((_, { req }) => t('message_required', getLang(req)))
        .isString().withMessage((_, { req }) => t('invalid_format', getLang(req)))
        .trim()
        .isLength({ min: 5 }).withMessage((_, { req }) => t('message_too_short', getLang(req))),
];

// ✅ 6. Validation for sales order payment
export const validateSalesOrderPayment = [
    body('amount')
        .notEmpty().withMessage((_, { req }) => t('amount_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_amount', getLang(req))),

    body('paymentMethod')
        .optional()
        .isIn(['cash', 'mpesa', 'mixx', 'airtelmoney', 'halopesa', 'bank', 'mobile']).withMessage((_, { req }) => t('invalid_payment_type', getLang(req))),

    body('referenceNumber')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_format', getLang(req))),

    body('notes')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_format', getLang(req))),
];

// ✅ 7. Validation for sales return
export const validateSalesReturn = [
    body('invoiceNumber')
        .notEmpty().withMessage((_, { req }) => t('invoice_number_required', getLang(req))),

    body('items')
        .isArray({ min: 1 }).withMessage((_, { req }) => t('items_array_required', getLang(req))),

    body('items.*.product_id')
        .notEmpty().withMessage((_, { req }) => t('product_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('items.*.quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('quantity_must_be_positive', getLang(req))),

    body('items.*.price')
        .notEmpty().withMessage((_, { req }) => t('price_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_price', getLang(req))),

    body('reason')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_format', getLang(req))),

    body('refundMethod')
        .optional()
        .isIn(['cash', 'mpesa', 'mixx', 'airtelmoney', 'halopesa', 'bank', 'mobile', 'store_credit']).withMessage((_, { req }) => t('invalid_refund_method', getLang(req))),
];

