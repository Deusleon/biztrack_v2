/**
 * Minimal in-memory per-IP rate limiter for public endpoints (no dependency).
 * Suitable for single-instance deployments; for multi-instance setups swap
 * the store for Redis without changing the middleware signature.
 *
 * Usage: router.post("/x", rateLimit({ windowMs: 60*60*1000, max: 5 }), handler)
 */
function rateLimit({ windowMs = 60 * 60 * 1000, max = 5, message = "Too many requests. Please try again later." } = {}) {
  const hits = new Map(); // ip -> [timestamps]

  // Light periodic cleanup so the map doesn't grow forever
  const cleaner = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, stamps] of hits) {
      const fresh = stamps.filter((ts) => ts > cutoff);
      if (fresh.length) hits.set(ip, fresh);
      else hits.delete(ip);
    }
  }, windowMs);
  cleaner.unref?.();

  return (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();
    const cutoff = now - windowMs;

    const stamps = (hits.get(ip) || []).filter((ts) => ts > cutoff);
    if (stamps.length >= max) {
      return res.status(429).json({ success: false, message });
    }
    stamps.push(now);
    hits.set(ip, stamps);
    next();
  };
}

export { rateLimit };

