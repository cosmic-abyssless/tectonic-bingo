import { useEffect } from "react";

// A bingo's theme key only arrives with the shell request, and the theme itself
// is a separate chunk that would then be fetched after it: two round trips in a
// row before the page can be drawn. Remembering the last theme each bingo used
// lets the chunk start loading at startup, in parallel with the shell request.

const KEY_PREFIX = "theme:v1:";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function rememberTheme(slug: string, themeKey: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(KEY_PREFIX + slug, themeKey);
  } catch {
    // Best-effort: without it the theme just loads after the shell instead.
  }
}

/** The theme this bingo last used, or null. */
export function rememberedTheme(slug: string, storage: StorageLike | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(KEY_PREFIX + slug) ?? null;
  } catch {
    return null;
  }
}

/** The remembered theme for the bingo a page path belongs to (`/b/<slug>`, `/b/<slug>/draft`, …), or null. */
export function rememberedThemeForPath(pathname: string, storage: StorageLike | null = defaultStorage()): string | null {
  const match = /^\/b\/([^/]+)/.exec(pathname);
  return match ? rememberedTheme(decodeURIComponent(match[1]!), storage) : null;
}

/** Keeps the remembered theme for `slug` current. */
export function useRememberTheme(slug: string | undefined, themeKey: string | undefined): void {
  useEffect(() => {
    if (slug && themeKey) rememberTheme(slug, themeKey);
  }, [slug, themeKey]);
}
