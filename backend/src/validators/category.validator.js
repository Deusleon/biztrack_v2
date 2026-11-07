import * as _p25 from 'express-validator';
const {  body, param  } = _p25.default ?? _p25;
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
export const validateCategory = [
    body('name')
        .notEmpty().withMessage((_, { req }) => t('name_required', getLang(req)))
        .isString().withMessage((_, { req }) => t('name_required', getLang(req)))
        .trim(),

    body('description')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_description', getLang(req)))
        .trim(),

    param('id')
        .optional()
        .isUUID().withMessage((_, { req }) => t('invalid_category_id', getLang(req))),
];

