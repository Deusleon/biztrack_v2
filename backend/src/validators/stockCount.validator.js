import * as _p28 from 'express-validator';
const {  body, query  } = _p28.default ?? _p28;
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
// ✅ 1. Validation for Getting Stock Movements
export const validateGetMovements = [
    query('movement_type')
        .optional()
        .isIn(['IN', 'OUT']).withMessage((_, { req }) => t('invalid_movement_type', getLang(req))),

    query('product_id')
        .optional()
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    query('category_id')
        .optional()
        .isUUID().withMessage((_, { req }) => t('invalid_category_id', getLang(req))),

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

// ✅ 2. Validation for Saving Stock Count
export const validateSaveStockCount = [
    body('items')
        .isArray({ min: 1 }).withMessage((_, { req }) => t('items_array_required', getLang(req))),

    body('items.*.product_id')
        .notEmpty().withMessage((_, { req }) => t('product_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('items.*.counted_qty')
        .notEmpty().withMessage((_, { req }) => t('counted_qty_required', getLang(req)))
        .isFloat({ gte: 0 }).withMessage((_, { req }) => t('invalid_quantity', getLang(req))),

    body('notes')
        .optional({ nullable: true, checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim()
        .isLength({ max: 500 }).withMessage((_, { req }) => t('notes_too_long', getLang(req))),
];

// ✅ 3. Validation for Getting Stock Count History
export const validateGetStockCountHistory = [
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

