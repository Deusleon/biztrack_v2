import * as _n19 from 'jsonwebtoken';
const jwt = _n19.default ?? _n19;
import { t } from '../utils/translate.js';
import pool from '../config/db.js';
import { stampOf } from '../utils/passwordStamp.js';
import { enforceSubscriptionForRequest } from './subscriptionGuard.js';
import { getStoreSecurityPolicy, isPasswordExpired } from '../utils/securityPolicy.js';
import { addPhase } from '../utils/perf.js';
import { getUserRow } from '../utils/accessCache.js';
import 'dotenv/config';
const PASSWORD_CHANGE_ALLOWED_PATHS = [
  '/api/profile',
  '/api/profile/password',
  '/api/auth/logout',
  '/api/auth/verify-password',
  '/api/settings',
];

function isPasswordChangeAllowed(req) {
  const path = req.originalUrl?.split('?')[0] || req.path || '';
  return PASSWORD_CHANGE_ALLOWED_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

const verifyToken = async (req, res, next) => {
  const authStartedAt = Date.now();
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const fallbackLang = req.headers['x-language'] || 'en';

  if (!token) {
    return res.status(401).json({ message: t('no_token_provided', fallbackLang) });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cached for a few seconds (see utils/accessCache.js) instead of one DB
    // query on every single request.
    const user = await getUserRow(decoded.id);

    if (!user) {
      return res.status(401).json({ message: t('user_not_found', fallbackLang) });
    }

    const lang = user.preferred_language || fallbackLang;

    // The password was changed or reset after this token was issued: the session is over.
    if (decoded.pwa !== undefined && decoded.pwa < stampOf(user.password_changed_at)) {
      return res.status(401).json({ code: 'SESSION_EXPIRED', message: lang === 'sw' ? 'Nenosiri lako lilibadilishwa. Tafadhali ingia tena.' : 'Your password was changed. Please sign in again.' });
    }

    if (!user.status) {
      return res.status(403).json({ message: t('account_disabled', lang) });
    }

    const currentStoreId =
      req.headers['x-store-id'] ||
      decoded.current_store_role?.store_id ||
      null;
    const security = await getStoreSecurityPolicy(currentStoreId);
    const passwordChangeRequired = decoded.password_change_required || isPasswordExpired(user, security);

    if (passwordChangeRequired && !isPasswordChangeAllowed(req)) {
      return res.status(428).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        redirect: '/profile?passwordExpired=1',
        message: lang === 'sw'
          ? 'Nenosiri lako limepitwa na muda. Badilisha nenosiri ili kuendelea.'
          : 'Your password has expired. Change it to continue.',
      });
    }

    req.user = {
      ...decoded,
      email: user.email,
      status: user.status,
      preferred_language: user.preferred_language,
      lang,
      password_change_required: passwordChangeRequired,
      session_timeout_minutes: security.sessionTimeout,
      current_store_id: currentStoreId,
    };

    const subscriptionResult = await enforceSubscriptionForRequest(req, res);
    if (subscriptionResult.blocked) return;

    addPhase('auth', Date.now() - authStartedAt);
    next();
  } catch (err) {
    console.error('Auth Middleware Error:', err.message);
    return res.status(403).json({ message: t('invalid_or_expired_token', fallbackLang) });
  }
};

export default verifyToken;