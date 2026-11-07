import * as _p32 from 'express-validator';
const {  body, query  } = _p32.default ?? _p32;
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
// ✅ 1. Validation for Creating Stock Transfer
export const validateCreateTransfer = [
    body('destination_store_id')
        .notEmpty().withMessage((_, { req }) => t('destination_store_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req))),

    body('items')
        .isArray({ min: 1 }).withMessage((_, { req }) => t('items_array_required', getLang(req))),

    body('items.*.product_id')
        .notEmpty().withMessage((_, { req }) => t('product_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),

    body('items.*.quantity')
        .notEmpty().withMessage((_, { req }) => t('quantity_required', getLang(req)))
        .isFloat({ gt: 0 }).withMessage((_, { req }) => t('invalid_quantity', getLang(req))),

    body('items.*.batch_id')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_batch_id', getLang(req))),

    body('notes')
        .optional({ nullable: true, checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim()
        .isLength({ max: 500 }).withMessage((_, { req }) => t('notes_too_long', getLang(req))),
];

// ✅ 2. Validation for Receiving Transfer (no specific body requirements)
export const validateReceiveTransfer = [];

// ✅ 3. Validation for Getting Transfer History
export const validateGetTransferHistory = [
    query('direction')
        .optional()
        .isIn(['outgoing', 'incoming', 'all']).withMessage((_, { req }) => t('invalid_direction', getLang(req))),

    query('status')
        .optional()
        .isIn(['pending', 'completed', 'cancelled']).withMessage((_, { req }) => t('invalid_status', getLang(req))),

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

