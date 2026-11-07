import * as _p24 from 'express-validator';
const {  body  } = _p24.default ?? _p24;
import { getLang } from '../utils/getLang.js';
import { t } from '../utils/translate.js';
import { isValidPhoneNumber } from './phoneNumber.validator.js';
// Standalone customer CRUD validator

const isOnlyCountryCode = (value) => /^\+?[0-9]{1,4}$/.test(value.trim());

export const validateCustomerCRUD = [
    body('name')
        .notEmpty().withMessage((_, { req }) => t('customer_name_required', getLang(req)))
        .isString().withMessage((_, { req }) => t('invalid_customer_name', getLang(req)))
        .trim()
        .isLength({ min: 2 }).withMessage((_, { req }) => t('customer_name_too_short', getLang(req))),

    body('phone')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_phone_number', getLang(req)))
        .custom((value, { req }) => {
            if (isOnlyCountryCode(value)) {
                return true;
            }
            if (!isValidPhoneNumber(value)) {
                throw new Error(t('invalid_phone_number', getLang(req)));
            }
            return true;
        })
        .trim(),

    body('email')
        .optional({ checkFalsy: true })
        .isEmail().withMessage((_, { req }) => t('invalid_email', getLang(req)))
        .trim(),

    body('address')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_address', getLang(req)))
        .trim(),

    body('customer_type')
        .optional({ checkFalsy: true })
        .isString().withMessage((_, { req }) => t('invalid_customer_type', getLang(req)))
        .trim(),

    body('credit_limit')
        .optional()
        .isFloat({ min: 0 }).withMessage((_, { req }) => t('invalid_credit_limit', getLang(req))),

    body('credit_due_days')
        .optional()
        .isInt({ min: 0 }).withMessage((_, { req }) => t('invalid_credit_due_days', getLang(req))),
];

