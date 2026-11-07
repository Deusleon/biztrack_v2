// path: backend/utils/cache.js
//
// Lightweight in-memory cache for read-heavy, rarely-changing data
// (store settings, price categories, permissions, dashboard summaries).
//
// Why: On shared hosting, every avoidable DB round-trip competes for the
// same limited CPU/connections as everything else running on the box.
// Cutting repeat reads for data that barely changes (e.g. store settings
// read on almost every product/sales request) reduces DB load system-wide,
// which is exactly what causes the "random page is slow" symptom.
//
// This is intentionally simple (no Redis dependency) since it works fine
// for a single Node process. If you later scale to multiple app instances/
// PM2 cluster mode, move this to Redis so all instances share one cache.

class TTLCache {
  constructor() {
    this.store = new Map(); // key -> { value, expiresAt }
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs = 30_000) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Invalidate one key (call this after any UPDATE to the underlying data). */
  del(key) {
    this.store.delete(key);
  }

  /** Invalidate every key starting with a prefix, e.g. del by storeId. */
  delPrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }
}

const cache = new TTLCache();

/**
 * Wrap an async DB-fetching function with caching.
 *
 * Usage:
 *   const settings = await withCache(`store_settings:${storeId}`, 60_000, () =>
 *     pool.query('SELECT settings FROM store_settings WHERE store_id = $1', [storeId])
 *   );
 */
async function withCache(key, ttlMs, fetchFn) {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const value = await fetchFn();
  cache.set(key, value, ttlMs);
  return value;
}

export { cache, withCache };

