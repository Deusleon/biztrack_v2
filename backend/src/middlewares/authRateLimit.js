import { rateLimit } from '../utils/rateLimit.js';

/**
 * Rate limits for the sign-in and account-recovery endpoints.
 *
 * Why the key includes the e-mail address: behind a shared proxy (cPanel/Passenger) every visitor can look like
 * the same IP address. Counting by IP alone would then let ONE person's typing mistakes lock EVERYONE out.
 * Counting by IP + e-mail slows down someone guessing one account without touching anybody else.
 * (Set TRUST_PROXY in .env so req.ip is the real visitor address when the server is behind a proxy.)
 *
 * Every number can be changed in .env; RATE_LIMIT_DISABLED=1 switches all limiters off (tests only).
 */
const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const email = (req) => String(req.body?.email || '').trim().toLowerCase();

/** Sign in: only FAILED attempts count — 10 wrong tries per address + e-mail in 15 minutes. */
export const loginLimiter = rateLimit({
  windowMs: num('LOGIN_RATE_WINDOW_MIN', 15) * MIN,
  max: num('LOGIN_RATE_MAX', 10),
  messageKey: 'too_many_attempts',
  countOnlyFailures: true,
  keyGenerator: (req) => `login|${req.ip}|${email(req)}`,
});

/** Same safety net for one address trying MANY different e-mails (password spraying). */
export const loginIpLimiter = rateLimit({
  windowMs: num('LOGIN_RATE_WINDOW_MIN', 15) * MIN,
  max: num('LOGIN_IP_RATE_MAX', 100),
  messageKey: 'too_many_attempts',
  countOnlyFailures: true,
  keyGenerator: (req) => `login-ip|${req.ip}`,
});

/** Creating accounts. */
export const registerLimiter = rateLimit({
  windowMs: HOUR,
  max: num('REGISTER_RATE_MAX', 20),
  messageKey: 'too_many_attempts',
  keyGenerator: (req) => `register|${req.ip}`,
});

/** Mails that send something (verification link, password reset link): per address + e-mail. */
export const emailActionLimiter = rateLimit({
  windowMs: HOUR,
  max: num('EMAIL_ACTION_RATE_MAX', 10),
  messageKey: 'too_many_attempts',
  keyGenerator: (req) => `mail|${req.ip}|${email(req)}`,
});

/** Using a token from an e-mail link (verify e-mail, reset password) — failed tries only. */
export const tokenLimiter = rateLimit({
  windowMs: 15 * MIN,
  max: num('TOKEN_RATE_MAX', 30),
  messageKey: 'too_many_attempts',
  countOnlyFailures: true,
  keyGenerator: (req) => `token|${req.ip}`,
});

/** "Confirm with your password" (lock screen, sensitive actions): failed tries per signed-in person. */
export const verifyPasswordLimiter = rateLimit({
  windowMs: 15 * MIN,
  max: num('VERIFY_PASSWORD_RATE_MAX', 10),
  messageKey: 'too_many_attempts',
  countOnlyFailures: true,
  keyGenerator: (req) => `verify|${req.user?.id || req.user?.userId || req.ip}`,
});
