class ResponseCache {
  constructor() {
    this.store = new Map();
    this.cleanupInterval = null;
  }

  startCleanup(ttlMs) {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now - entry.createdAt > entry.ttlMs) {
          this.store.delete(key);
        }
      }
    }, ttlMs);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data, ttlMs) {
    this.store.set(key, { data, createdAt: Date.now(), ttlMs });
  }

  clear() {
    this.store.clear();
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

const cache = new ResponseCache();

module.exports = cache;
