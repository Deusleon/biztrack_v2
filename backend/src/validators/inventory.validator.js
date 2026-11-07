import * as _p31 from 'express-validator';
const {  body, query  } = _p31.default ?? _p31;
import pool from '../config/db.js';
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
// ✅ 1(a). Validation for cheking Stock
export const validateGetStock = [
    query('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    query('product_id')
        .notEmpty().withMessage((_, { req }) => t('product_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req)))
];

// ✅ 1(c). Validation for cheking low Stock
export const validateGetLowStock = [
    query('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),
];

// ✅ 2. Validation fo adding Stock (IN)
export const validateAddStock = [
    body('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    body('product_id')
        .notEmpty().withMessage((_, { req }) => t('product_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_quantity', getLang(req))),

    body('batch_number')
        .notEmpty().withMessage((_, { req }) => t('batch_number_required', getLang(req)))
        .trim()
        .custom(async (value, { req }) => {
            try {
                const { storeId, product_id } = req.body;
                const existing = await pool.query(
                    `SELECT 1 FROM inventory_batches 
                     WHERE store_id = $1 AND product_id = $2 
                     AND LOWER(batch_number) = LOWER($3)`,
                    [storeId, product_id, value]
                );
                if (existing.rows.length > 0) {
                    throw new Error(t('batch_number_exists', getLang(req)));
                }
                return true;
            } catch (err) {
                console.error('Batch validation error:', err);
                throw new Error(t('validation_error', getLang(req)));
            }
        }),

    body('expiry_date')
        .optional({ nullable: true, checkFalsy: true }) // Kubali empty string na null
        .custom((value, { req }) => {
            // Kama sio empty string au null, basi angalia kama ni tarehe sahihi
            if (value && value.trim() !== '') {
                if (isNaN(new Date(value).getTime())) {
                    throw new Error(t('invalid_expiry_date', getLang(req)));
                }
                if (new Date(value) < new Date()) {
                    throw new Error(t('invalid_expiry_date', getLang(req)));
                }
            }
            return true;
        }),

    body('note')
        .notEmpty().withMessage((_, { req }) => t('note_required', getLang(req)))
        .isString().withMessage((_, { req }) => t('invalid_note', getLang(req)))
        .trim()
        .isLength({ min: 5 }).withMessage((_, { req }) => t('note_too_short', getLang(req))),

];

// ✅ 3. Validation removing Stock (SALE)
export const validateSaleStock = [
    // Store validation
    body('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    // Invoice validation
    body('invoice')
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

    body('items.*.price')
        .notEmpty().withMessage((_, { req }) => t('price_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_price', getLang(req))),

    body('items.*.reason')
        .notEmpty().withMessage((_, { req }) => t('reason_required', getLang(req)))
        .isString().withMessage((_, { req }) => t('invalid_reason', getLang(req)))
        .trim()
        .isLength({ min: 5 }).withMessage((_, { req }) => t('reason_too_short', getLang(req))),

    body('items.*.type')
        .optional()
        .isIn(['sale', 'damage', 'transfer']).withMessage((_, { req }) => t('invalid_sale_type', getLang(req))),

    // Customer validation
    body('customer.id')
        .if((_, { req }) => req.body.customerChecked === true)
        .notEmpty().withMessage((_, { req }) => t('customer_info_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('customer_info_not_found', getLang(req))),
];

// ✅ 4. Validation removing Stock (OUT)
export const validateRemoveStock = [
    body('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    body('product_id')
        .notEmpty().withMessage((_, { req }) => t('product_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_quantity', getLang(req))),

    body('reason')
        .notEmpty().withMessage((_, { req }) => t('reason_required', getLang(req)))
        .isString().withMessage((_, { req }) => t('invalid_reason', getLang(req)))
        .trim()
        .isLength({ min: 5 }).withMessage((_, { req }) => t('reason_too_short', getLang(req))),
];

// ✅ 5. Validation for Checking Stock Movements
export const validateGetMovements = [
    query('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    query('product_id')
        .optional()
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    query('page')
        .optional()
        .isInt({ gt: 0 }).withMessage((_, { req }) => t('invalid_page', getLang(req))),

    query('limit')
        .optional()
        .isInt({ gt: 0 }).withMessage((_, { req }) => t('invalid_limit', getLang(req))),
];

// ✅ 6. Validation for Checking Batch Details
export const validateGetBatchDetails = [
    query('product_id')
        .optional()
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),
];

// ✅ 7. Validation for Checking Expiry
export const validateCheckExpiry = [
    query('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),
];

// ✅ 8. Validation for Updating Batch
export const validateUpdateBatch = [
    body('batch_id')
        .notEmpty().withMessage((_, { req }) => t('batch_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_batch_id', getLang(req))),

    body('batch_number')
        .notEmpty().withMessage((_, { req }) => t('batch_number_required', getLang(req)))
        .trim()
        .custom(async (value, { req }) => {
            try {
                const { batch_id } = req.body;
                const storeId = req.user?.current_store_id;
                
                // Get the product_id from the current batch
                const currentBatch = await pool.query(
                    `SELECT product_id FROM inventory_batches WHERE id = $1`,
                    [batch_id]
                );
                
                if (currentBatch.rows.length === 0) {
                    throw new Error(t('batch_not_found', getLang(req)));
                }
                
                const product_id = currentBatch.rows[0].product_id;
                
                // Check if another batch with the same number exists (excluding current batch)
                const existing = await pool.query(
                    `SELECT 1 FROM inventory_batches 
                     WHERE store_id = $1 AND product_id = $2 
                     AND LOWER(batch_number) = LOWER($3)
                     AND id != $4`,
                    [storeId, product_id, value, batch_id]
                );
                if (existing.rows.length > 0) {
                    throw new Error(t('batch_number_exists', getLang(req)));
                }
                return true;
            } catch (err) {
                if (err.message.includes('batch_number_exists') || err.message.includes('batch_not_found')) {
                    throw err;
                }
                console.error('Batch validation error:', err);
                throw new Error(t('validation_error', getLang(req)));
            }
        }),

    body('cost_price')
        .optional({ nullable: true, checkFalsy: true })
        .isFloat({ gte: 0 }).withMessage((_, { req }) => t('invalid_cost_price', getLang(req))),

    body('expiry_date')
        .optional({ nullable: true, checkFalsy: true })
        .custom((value, { req }) => {
            if (value && value.trim() !== '') {
                if (isNaN(new Date(value).getTime())) {
                    throw new Error(t('invalid_expiry_date', getLang(req)));
                }
            }
            return true;
        }),
];

// ✅ 9. Validation for Stock Adjustment
export const validateStockAdjustment = [
    body('product_id')
        .notEmpty().withMessage((_, { req }) => 'product_id_required')
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('batch_id')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_batch_id', getLang(req))),

    body('adjustment_type')
        .notEmpty().withMessage((_, { req }) => t('adjustment_type_required', getLang(req)))
        .isIn(['add', 'subtract']).withMessage((_, { req }) => 'invalid_adjustment_type'),

    body('quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => 'invalid_quantity'),

    body('reason')
        .notEmpty().withMessage((_, { req }) => t('reason_required', getLang(req)))
        .isIn(['damaged', 'expired', 'lost', 'found', 'correction', 'return', 'other'])
        .withMessage((_, { req }) => t('invalid_reason', getLang(req))),

    body('notes')
        .optional({ nullable: true, checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim()
        .isLength({ max: 500 }).withMessage((_, { req }) => t('notes_too_long', getLang(req))),
];

// ✅ 10. Validation for Getting Stock Adjustments
export const validateGetStockAdjustments = [
    query('product_id')
        .optional()
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    query('adjustment_type')
        .optional()
        .isIn(['add', 'subtract']).withMessage((_, { req }) => t('invalid_adjustment_type', getLang(req))),

    query('reason')
        .optional()
        .isIn(['damaged', 'expired', 'lost', 'found', 'correction', 'return', 'other'])
        .withMessage((_, { req }) => t('invalid_reason', getLang(req))),

    query('page')
        .optional()
        .isInt({ gt: 0 }).withMessage((_, { req }) => t('invalid_page', getLang(req))),

    query('limit')
        .optional()
        .isInt({ gt: 0, lt: 101 }).withMessage((_, { req }) => t('invalid_limit', getLang(req))),

    query('startDate')
        .optional()
        .isISO8601().withMessage((_, { req }) => t('invalid_date', getLang(req))),

    query('endDate')
        .optional()
        .isISO8601().withMessage((_, { req }) => t('invalid_date', getLang(req))),
];

