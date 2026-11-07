import * as _p30 from 'express-validator';
const {  body, param  } = _p30.default ?? _p30;
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
export const validatePriceCategory = [
    body('name')
        .notEmpty().withMessage((_, { req }) => t('name_required', getLang(req)))
        .isString().withMessage((_, { req }) => t('name_required', getLang(req)))
        .trim(),

    body('description')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_description', getLang(req)))
        .trim(),
];

