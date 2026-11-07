// utils/response.js
import { t } from './translate.js';
import { getLang } from './getLang.js';
const respondWithError = (req, res, statusCode = 500, key = 'server_error', message = null) => {
  const lang = getLang(req);
  const msg = message || t(key, lang);

  res.status(statusCode).json({
    success: false,
    message: msg
  });
};

export { respondWithError };

