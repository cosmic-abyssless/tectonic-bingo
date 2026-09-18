// A per-user copy of the board structure in localStorage, so the grid can paint
// instantly on a page load and then revalidate (see useBoard). Only the board is
// persisted: it is the big, slow-changing response (~175 KB), frozen from the
// `live` stage on, while everything else (shell, progress, submissions) is
// user-specific or changes constantly.
//
// Keyed by user as well as slug because the board depends on who is asking —
// before the reveal stage a mod gets the full board and everyone else gets an
// empty one — so one user's copy must never be read for another on a shared
// browser. All storage access is best-effort: private mode, disabled storage
// and a full quota degrade to "no cache", never to an error.

/** Bump when the board response's shape changes, so old copies are ignored. */
export const BOARD_CACHE_SCHEMA = 1;
export const BOARD_CACHE_MAX_AGE_MS = 7 * 24 * 3600_000;
/** Most boards kept per browser, newest first. */
export const BOARD_CACHE_MAX_ENTRIES = 3;

const PREFIX = "board:v";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

interface Stored<T> {
  savedAt: number;
  /** The client build that wrote it — a deploy discards every copy, so a changed response shape can't be hydrated into new code. */
  build: string;
  data: T;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function boardCacheKey(userId: string, slug: string): string {
  return `${PREFIX}${BOARD_CACHE_SCHEMA}:${userId}:${slug}`;
}

function boardKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

function parse<T>(raw: string | null): Stored<T> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Stored<T>;
    return value && typeof value.savedAt === "number" && typeof value.build === "string" && "data" in value ? value : null;
  } catch {
    return null;
  }
}

/** The cached board for this user and slug, or undefined if there is none, it is corrupt, from another build, or expired. */
export function readBoardCache<T>(userId: string, slug: string, build: string, now = Date.now(), storage: StorageLike | null = defaultStorage()): T | undefined {
  if (!storage) return undefined;
  const key = boardCacheKey(userId, slug);
  try {
    const raw = storage.getItem(key);
    const stored = parse<T>(raw);
    if (stored && stored.build === build && now - stored.savedAt <= BOARD_CACHE_MAX_AGE_MS) return stored.data;
    if (raw !== null) storage.removeItem(key);
  } catch {
    // Unreadable storage is the same as an empty cache.
  }
  return undefined;
}

/** Saves the board, then drops the oldest copies beyond BOARD_CACHE_MAX_ENTRIES. */
export function writeBoardCache<T>(userId: string, slug: string, build: string, data: T, now = Date.now(), storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  const key = boardCacheKey(userId, slug);
  const value = JSON.stringify({ savedAt: now, build, data } satisfies Stored<T>);
  try {
    try {
      storage.setItem(key, value);
    } catch {
      // Most likely the quota: make room by dropping every other board, then try once more.
      for (const other of boardKeys(storage)) if (other !== key) storage.removeItem(other);
      storage.setItem(key, value);
    }
    const entries = boardKeys(storage).map((k) => ({ key: k, savedAt: parse(storage.getItem(k))?.savedAt ?? -1 }));
    entries.sort((a, b) => b.savedAt - a.savedAt);
    for (const stale of entries.slice(BOARD_CACHE_MAX_ENTRIES)) storage.removeItem(stale.key);
  } catch {
    // Still no room, or storage is unavailable: run without a cache.
  }
}

/** Removes every persisted board (all users, all schema versions) — used on logout. */
export function clearBoardCache(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    for (const key of boardKeys(storage)) storage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
