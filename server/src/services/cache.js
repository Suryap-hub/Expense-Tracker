/**
 * Per-user versioned cache for expensive reads (dashboard analytics, AI
 * insights). Any write by a user bumps their version, so stale entries are
 * never served - no manual key tracking needed.
 *
 * In-memory is right for a single instance. For several instances, swap
 * this for Redis with the same three functions.
 */
const versions = new Map();
const store = new Map();
const MAX_ENTRIES = 5000;

const version = (userId) => versions.get(String(userId)) || 0;

export function bumpUser(userId) {
  versions.set(String(userId), version(userId) + 1);
}

export function cacheGet(userId, key) {
  const k = `${userId}:${version(userId)}:${key}`;
  const hit = store.get(k);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(k);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(userId, key, value, ttlMs = 60_000) {
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value); // oldest first
  store.set(`${userId}:${version(userId)}:${key}`, { value, expires: Date.now() + ttlMs });
}

export async function cached(userId, key, ttlMs, compute) {
  const hit = cacheGet(userId, key);
  if (hit !== undefined) return hit;
  const value = await compute();
  cacheSet(userId, key, value, ttlMs);
  return value;
}
