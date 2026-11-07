// Tiny in-memory TTL cache (no dependencies).
//
// Used for data that is read on EVERY request but changes rarely
// (a user's role in a store, their permission set, a store's subscription).
// Entries expire on their own; callers also clear the cache explicitly after
// writes so changes made through the app show up immediately in this process.
//
// ttlMs <= 0 disables the cache entirely (every get() misses, set() is a no-op),
// which is the quick way to switch the optimisation off if it is ever suspected.
class TtlCache {
  constructor({ ttlMs = 30_000, maxEntries = 5000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    if (this.ttlMs <= 0) return undefined;
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    if (this.ttlMs <= 0) return value;
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      // Map keeps insertion order, so the first key is the oldest one.
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

export { TtlCache };

