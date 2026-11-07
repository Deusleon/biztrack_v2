import * as _p29 from 'express-validator';
const {  body, param  } = _p29.default ?? _p29;
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
export const validateProduct = [
    body('storeId')
        .notEmpty().withMessage((_, { req }) => t('store_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_store_id', getLang(req)))
        .bail(),

    body('product_category')
        .notEmpty().withMessage((_, { req }) => t('category_id_required', getLang(req)))
        .isUUID().withMessage((_, { req }) => t('invalid_category_id', getLang(req)))
        .bail(),

    body('product_name')
        .notEmpty().withMessage((_, { req }) => t('name_required', getLang(req)))
        .isString().withMessage((_, { req }) => t('invalid_name', getLang(req)))
        .trim()
        .bail(),

    body('product_description')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_description', getLang(req)))
        .trim()
        .bail(),

    body('selling_price')
        .notEmpty().withMessage((_, { req }) => t('price_required', getLang(req)))
        .isNumeric().withMessage((_, { req }) => t('invalid_price', getLang(req))),

    body('current_stock')
        .optional({ checkFalsy: true })
        .isInt({ min: 0 }).withMessage((_, { req }) => t('invalid_stock', getLang(req))),

    body('image')
        .optional({ checkFalsy: true })
        .isURL().withMessage((_, { req }) => t('invalid_image_url', getLang(req))),

    param('id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage((_, { req }) => t('invalid_product_id', getLang(req))),
];

