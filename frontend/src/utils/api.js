// FILE PATH: frontend/src/utils/api.js
import axios from 'axios';
import { t } from './i18n';

// BizTrack's API lives under /api (not /api/v1).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export const createApi = (unwrap = true) => {
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // the refresh-token cookie
  // Without a limit a stalled request (slow mobile network, server waking up) leaves the page on "Loading…" forever.
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Endpoints that work without being signed in — they must never trigger the "session expired" redirect.
const PUBLIC_ENDPOINTS = [
  '/auth/login', '/auth/register', '/auth/verify-email', '/auth/resend-email',
  '/auth/forgot-password', '/auth/reset-password', '/support/tickets/public', '/support/tickets/track',
];
const isPublic = (url = '') => PUBLIC_ENDPOINTS.some((e) => url.includes(e));

const currentLang = () => {
  try { return window.__auth_user?.preferred_language || localStorage.getItem('lang') || 'en'; } catch { return 'en'; }
};

// Request: token, current store (every store-scoped route reads X-Store-ID) and language.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token && !isPublic(config.url)) config.headers.Authorization = `Bearer ${token}`;
  const storeId = localStorage.getItem('currentStoreId');
  if (storeId && !isPublic(config.url)) config.headers['X-Store-ID'] = storeId;
  config.headers['x-language'] = currentLang();
  return config;
}, (error) => Promise.reject(error));

/**
 * Turns any axios failure into an object with a readable `.message`.
 *
 *   1. JSON error body      → { message: '...' }   (BizTrack's servers answer like this)
 *   2. no response at all   → network failure, timeout, server restarting
 *   3. non-JSON body        → an HTML 502 page from a proxy
 *
 * The original object is kept on `.original`; the HTTP status on `.status`, any `code` the server sent on `.code`.
 */
const normalizeApiError = (error) => {
  const data = error.response?.data;
  if (data && typeof data === 'object') {
    return { ...data, success: false, status: error.response.status, message: data.message || data.error || `Request failed (HTTP ${error.response.status}).`, original: error, response: error.response };
  }
  if (data && typeof data !== 'object') {
    return { success: false, status: error.response.status, message: `Server error (HTTP ${error.response.status}). The response wasn't valid JSON.`, original: error };
  }
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const timedOut = error.code === 'ECONNABORTED';
  return {
    success: false, status: null, original: error,
    message: offline ? t('check_internet_connection')
      : timedOut ? 'The server took too long to respond. Try again in a moment.'
      : "Couldn't reach the server. It may be restarting — try again in a moment.",
  };
};

api.interceptors.response.use(
  (response) => (unwrap ? response.data : response),
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const url = error.config?.url || '';

    // 401 on a signed-in page: the session is over. (Not on login itself — that page shows its own message.)
    if (status === 401 && !isPublic(url) && localStorage.getItem('accessToken')) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      localStorage.removeItem('cachedPermissions');
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login?error=unauthorized';
    }

    // 428 = the password has expired and must be changed first.
    if (status === 428 && !isPublic(url)) {
      window.dispatchEvent(new CustomEvent('biztrack:password-change-required', { detail: error.response.data }));
      const redirect = error.response.data?.redirect || '/profile?passwordExpired=1';
      if (!window.location.pathname.startsWith('/profile')) window.location.href = redirect;
    }

    // 402 = the subscription has lapsed. The app locks itself (SubscriptionContext) and shows the Subscription page.
    if (status === 402 && !isPublic(url)) {
      window.dispatchEvent(new CustomEvent('biztrack:subscription-locked', { detail: { code } }));
    }

    return Promise.reject(normalizeApiError(error));
  },
);

return api;
};

/** The app's own client: resolves to the response BODY. */
const api = createApi(true);
export default api;
