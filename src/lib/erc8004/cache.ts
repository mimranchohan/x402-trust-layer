type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlSec: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export function cacheKey(parts: (string | number | null | undefined)[]): string {
  return parts.map((p) => String(p ?? "")).join(":");
}
