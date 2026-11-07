import * as _p27 from 'express-validator';
const {  body, param  } = _p27.default ?? _p27;
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
export const validateSupplier = [
    body('name')
        .notEmpty().withMessage((_, { req }) => t('name_required', getLang(req)))
        .isString().withMessage((_, { req }) => t('name_required', getLang(req)))
        .trim(),

    body('contact_person')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_contact_person', getLang(req)))
        .trim(),

    body('email')
        .optional()
        .isEmail().withMessage((_, { req }) => t('invalid_email', getLang(req)))
        .trim(),

    body('phone')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_phone', getLang(req)))
        .trim(),

    body('address')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_address', getLang(req)))
        .trim(),

    body('city')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_city', getLang(req)))
        .trim(),

    body('country')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_country', getLang(req)))
        .trim(),

    body('tax_id')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_tax_id', getLang(req)))
        .trim(),

    body('vat_number')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_vat_number', getLang(req)))
        .trim(),

    body('payment_terms')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_payment_terms', getLang(req)))
        .trim(),

    body('notes')
        .optional()
        .isString().withMessage((_, { req }) => t('invalid_notes', getLang(req)))
        .trim(),

    param('id')
        .optional()
        .isUUID().withMessage((_, { req }) => t('invalid_supplier_id', getLang(req))),
];

