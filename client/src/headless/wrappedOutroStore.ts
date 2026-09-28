// Whether the viewer has reached a Bingo's Wrapped Outro (its share cards) before, remembered in their browser only, so
// later visits can offer a jump straight to the cards. Best-effort: storage that's missing, full or blocked just means
// no jump, never an error.

const KEY_PREFIX = "wrapped:outro-reached:v1:";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function hasReachedOutro(slug: string, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(KEY_PREFIX + slug) === "1";
  } catch {
    return false;
  }
}

export function rememberOutroReached(slug: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(KEY_PREFIX + slug, "1");
  } catch {
    // Not remembered: the next visit just starts without the jump.
  }
}
