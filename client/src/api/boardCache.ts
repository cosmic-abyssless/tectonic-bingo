// A per-user copy of the board structure in localStorage, so the grid can paint
// instantly on a page load and then revalidate (see useBoard). Only the board is
// persisted: it is the big, slow-changing response (~175 KB), frozen from the
// `live` stage on, while everything else (shell, progress, submissions) is
// user-specific or changes constantly.
//
// Keyed by user as well as slug because the board depends on who is asking —
// before the reveal stage a mod gets the full board and everyone else gets an
// empty one, and while the Tiles are sealed a player gets the sealed board — so one user's copy must never be read for another on a shared
// browser. All storage access is best-effort: private mode, disabled storage
// and a full quota degrade to "no cache", never to an error.

/** Bump when the board response's shape changes, so old copies are ignored. */
export const BOARD_CACHE_SCHEMA = 2;
export const BOARD_CACHE_MAX_AGE_MS = 7 * 24 * 3600_000;
/**
 * Most entries kept per browser, newest first. Besides each board this holds the
 * page-load queries stored under the same key with `:<part>` on the slug (shell,
 * team progress, team submissions — see queries.ts), so it allows a few bingos' worth.
 */
export const BOARD_CACHE_MAX_ENTRIES = 12;
/**
 * How long an unchanged copy goes without being written again. A refetch that returns what is already stored skips
 * the write (and the scan of every other entry) unless the stored copy is older than this, so its age and its place
 * among the newest entries stay current to within this window.
 */
export const BOARD_CACHE_REFRESH_MS = 3600_000;

const PREFIX = "board:v";
/** Every stored copy starts with this, then its savedAt (see writeBoardCache). */
const SAVED_AT = '{"savedAt":';

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

/** The stored form of one copy, built by hand so the payload is serialised once and its tail can be compared as-is. */
function storedTail(build: string, json: string): string {
  return `,"build":${JSON.stringify(build)},"data":${json}}`;
}

/**
 * Saves the board, then drops the oldest copies beyond BOARD_CACHE_MAX_ENTRIES. Does nothing when storage already
 * holds this exact data from this build, written less than BOARD_CACHE_REFRESH_MS ago.
 */
export function writeBoardCache<T>(userId: string, slug: string, build: string, data: T, now = Date.now(), storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  const key = boardCacheKey(userId, slug);
  const json = JSON.stringify(data) as string | undefined;
  if (json === undefined) return;
  const tail = storedTail(build, json);
  try {
    const raw = storage.getItem(key);
    if (raw?.startsWith(SAVED_AT) && raw.endsWith(tail) && now - Number(raw.slice(SAVED_AT.length, raw.length - tail.length)) < BOARD_CACHE_REFRESH_MS) return;
  } catch {
    // Unreadable: fall through and try to write.
  }
  const value = `${SAVED_AT}${now}${tail}`;
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

interface PendingWrite {
  userId: string;
  slug: string;
  build: string;
  data: unknown;
  now: number;
}

/** Writes waiting for the browser to be idle, by storage key: a later write to the same key replaces the earlier one. */
const pending = new Map<string, PendingWrite>();
let flushScheduled = false;

/** Runs every waiting write now. Also runs as the page is hidden or unloaded, so a reload still finds the latest copy. */
export function flushBoardCacheWrites(storage: StorageLike | null = defaultStorage()): void {
  flushScheduled = false;
  const writes = [...pending.values()];
  pending.clear();
  for (const w of writes) writeBoardCache(w.userId, w.slug, w.build, w.data, w.now, storage);
}

if (typeof window !== "undefined") window.addEventListener("pagehide", () => flushBoardCacheWrites());

/**
 * writeBoardCache once the browser is idle, so serialising a large response never runs between the fetch resolving
 * and the page re-rendering with it. Only the latest data per key is written.
 */
export function scheduleBoardCacheWrite<T>(userId: string, slug: string, build: string, data: T, now = Date.now()): void {
  pending.set(boardCacheKey(userId, slug), { userId, slug, build, data, now });
  if (flushScheduled) return;
  flushScheduled = true;
  const flush = () => flushBoardCacheWrites();
  if (typeof requestIdleCallback === "function") requestIdleCallback(flush, { timeout: 2000 });
  else setTimeout(flush, 0);
}

/** Removes this user's copies for one bingo: its board and the page-load parts stored beside it (`<slug>:<part>`). */
export function removeBoardCacheForSlug(userId: string, slug: string, storage: StorageLike | null = defaultStorage()): void {
  const exact = boardCacheKey(userId, slug);
  // A write still waiting would otherwise put the copy back.
  for (const key of pending.keys()) if (key === exact || key.startsWith(`${exact}:`)) pending.delete(key);
  if (!storage) return;
  try {
    for (const key of boardKeys(storage)) if (key === exact || key.startsWith(`${exact}:`)) storage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** Removes every persisted board (all users, all schema versions) — used on logout. */
export function clearBoardCache(storage: StorageLike | null = defaultStorage()): void {
  // Including writes still waiting, which would otherwise put a logged-out user's copy back.
  pending.clear();
  if (!storage) return;
  try {
    for (const key of boardKeys(storage)) storage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
