// Persists useDominantColor's results across page loads. The colour of a tile's
// artwork never changes for a given URL (uploads are immutable), but decoding
// each image on a canvas takes a moment on every load — long enough for the cover
// to flash its fallback colour first. Storing "url -> rgb(...)" in localStorage
// lets covers paint in their final colour on the first frame.
//
// Best-effort throughout: unavailable or full storage just means no persistence.
// Only found colours are stored (a failed load may be transient).

export const DOMINANT_COLOR_STORAGE_KEY = "dominant:v1";
export const DOMINANT_COLOR_MAX_ENTRIES = 300;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const RGB = /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The persisted `[url, color]` pairs, oldest first; anything malformed is dropped. */
export function readPersistedColors(storage: StorageLike | null = defaultStorage()): [string, string][] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(DOMINANT_COLOR_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is [string, string] => Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string" && RGB.test(entry[1]));
  } catch {
    return [];
  }
}

/** Saves the newest DOMINANT_COLOR_MAX_ENTRIES found colours (a Map iterates oldest first). */
export function persistColors(colors: ReadonlyMap<string, string | null>, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  const found = [...colors].filter((entry): entry is [string, string] => entry[1] !== null);
  try {
    storage.setItem(DOMINANT_COLOR_STORAGE_KEY, JSON.stringify(found.slice(-DOMINANT_COLOR_MAX_ENTRIES)));
  } catch {
    // Storage is full or unavailable: colours are simply recomputed next load.
  }
}
