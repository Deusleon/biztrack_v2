import { t } from './translate.js';
import { getLang } from './getLang.js';

/**
 * Minimal in-memory rate limiter (no dependency).
 * Suitable for single-instance deployments; for multi-instance setups swap the store for Redis
 * without changing the middleware signature.
 *
 * Usage: router.post("/x", rateLimit({ windowMs: 60*60*1000, max: 5 }), handler)
 *
 * Options (all optional — the original `{ windowMs, max, message }` call still works unchanged):
 *   keyGenerator(req)      what to count by. Default: the caller's IP address.
 *   messageKey             translation key of the 429 message (answered in the caller's language).
 *   countOnlyFailures      true → a request that succeeds (HTTP < 400) is not counted. Right for login:
 *                          people who sign in correctly are never slowed down, only repeated failures are.
 *
 * RATE_LIMIT_DISABLED=1 in the environment switches every limiter off (automated tests, load tests).
 */
function rateLimit({
  windowMs = 60 * 60 * 1000,
  max = 5,
  message = "Too many requests. Please try again later.",
  messageKey = null,
  keyGenerator = null,
  countOnlyFailures = false,
} = {}) {
  const hits = new Map(); // key -> [timestamps]

  // Light periodic cleanup so the map doesn't grow forever
  const cleaner = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, stamps] of hits) {
      const fresh = stamps.filter((ts) => ts > cutoff);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }, windowMs);
  cleaner.unref?.();

  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === "1") return next();

    const key = (keyGenerator ? keyGenerator(req) : null) || req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();
    const cutoff = now - windowMs;

    const stamps = (hits.get(key) || []).filter((ts) => ts > cutoff);
    if (stamps.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((stamps[0] + windowMs - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      const text = messageKey ? t(messageKey, { minutes: Math.max(1, Math.ceil(retryAfter / 60)) }, getLang(req)) : message;
      return res.status(429).json({ success: false, code: "RATE_LIMITED", message: text });
    }
    stamps.push(now);
    hits.set(key, stamps);

    if (countOnlyFailures) {
      // A request that ends well gives its slot back.
      res.on("finish", () => {
        if (res.statusCode < 400) {
          const list = hits.get(key);
          if (!list) return;
          const i = list.lastIndexOf(now);
          if (i !== -1) list.splice(i, 1);
          if (!list.length) hits.delete(key);
        }
      });
    }
    next();
  };
}

export { rateLimit };
