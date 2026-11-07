import * as _p17 from 'express-validator';
const {  validationResult  } = _p17.default ?? _p17;
import { t } from '../utils/translate.js';
import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const lang = getLang(req);
    const firstError = errors.array()[0].msg || t('validation_error', lang);
    return respondWithError(req, res, 400, null, firstError);
  }
  next();
};

export default validate;