// The signed-in user (the /api/me response) in localStorage, so a page load can
// start from who you were last time instead of a "Loading…" screen while it asks
// again. It is only ever a starting point: AuthProvider revalidates it on every
// load and replaces or clears it. Best-effort throughout, like boardCache.

const KEY = "auth:v1";
export const AUTH_CACHE_MAX_AGE_MS = 7 * 24 * 3600_000;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface CachedAuth<U> {
  user: U;
  devMode: boolean;
  canGrantAdmin: boolean;
}

interface Stored<U> extends CachedAuth<U> {
  savedAt: number;
  /** The client build that wrote it: a deploy discards it, so a changed user shape can't be hydrated into new code. */
  build: string;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readAuthCache<U>(build: string, now = Date.now(), storage: StorageLike | null = defaultStorage()): CachedAuth<U> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored<U> | null;
    if (stored && stored.build === build && typeof stored.savedAt === "number" && now - stored.savedAt <= AUTH_CACHE_MAX_AGE_MS && stored.user) {
      return { user: stored.user, devMode: !!stored.devMode, canGrantAdmin: !!stored.canGrantAdmin };
    }
    storage.removeItem(KEY);
  } catch {
    // Unreadable or corrupt storage is the same as an empty cache.
  }
  return null;
}

export function writeAuthCache<U>(build: string, auth: CachedAuth<U>, now = Date.now(), storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify({ ...auth, savedAt: now, build } satisfies Stored<U>));
  } catch {
    // No room, or storage unavailable: run without a cache.
  }
}

export function clearAuthCache(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(KEY);
  } catch {
    // Nothing to clean up.
  }
}
