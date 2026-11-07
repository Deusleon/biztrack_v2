import _m18 from '../services/subscription.service.js';
const {  ensureSubscriptionAccess  } = _m18;
const EXEMPT_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/resend-email',
  '/api/auth/logout',
  '/api/auth/switch-store',
  '/api/subscriptions',
  '/api/qz',
  '/api/test',
];

// Reading the list of MY stores must work even when the current store's subscription has lapsed — otherwise a
// person who belongs to several stores is locked out with no way to move to one that is paid up. Only GET, and
// only these exact paths: creating, editing or deleting a store still needs an active subscription.
const EXEMPT_GET_PATHS = ['/api/stores', '/api/stores/default'];

function isExemptPath(pathname = '', method = 'GET') {
  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  const bare = pathname.split('?')[0].replace(/\/+$/, '');
  return String(method).toUpperCase() === 'GET' && EXEMPT_GET_PATHS.includes(bare);
}

async function enforceSubscriptionForRequest(req, res) {
  if (isExemptPath(req.originalUrl || req.path || '', req.method)) {
    return { blocked: false };
  }

  const storeId = req.user?.current_store_id || req.user?.current_store_role?.store_id || req.headers['x-store-id'];
  const accountId = storeId;

  // if (!accountId) {
  //   return { blocked: false };
  // }

  if (!accountId) {
    res.status(400).json({
      success: false,
      code: "store_required",
      message: "Store ID is required to verify subscription access.",
    });

    return { blocked: true };
  }

  const access = await ensureSubscriptionAccess(accountId);

  if (access.allowed) {
    req.subscription = access.subscription;
    return { blocked: false };
  }

  res.status(402).json({
    success: false,
    code: 'subscription_required',
    message: 'Your subscription is inactive or expired. Please renew to continue using the system.',
    subscription: access.subscription,
    reason: access.reason,
  });

  return { blocked: true };
}

export { enforceSubscriptionForRequest };

