/**
 * Simple in-memory cache utility
 * NOTE: This is a lightweight in-memory cache. For multi-instance production use Redis.
 */

const cache = new Map();

export function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

export function setCache(key, value, ttlMs = 10000) {
    const expiry = Date.now() + ttlMs;
    cache.set(key, { value, expiry });
}

export function delCache(key) {
    cache.delete(key);
}

export function clearByPrefix(prefix) {
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
}

export default {
    get: getCache,
    set: setCache,
    del: delCache,
    clearByPrefix
};