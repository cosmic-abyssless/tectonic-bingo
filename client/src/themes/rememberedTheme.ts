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

// The theme's page colour, so the wait for its chunk can be painted in that colour
// (see ThemeProvider) rather than the default page colour — which flashes, then
// jumps to the theme's own.
const BG_KEY_PREFIX = "theme-bg:v1:";
// Only plain colours are ever applied: this is read from storage and set as a style.
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i;

export function rememberThemeBackground(themeKey: string, scheme: "light" | "dark", color: string, storage: StorageLike | null = defaultStorage()): void {
  if (!COLOR.test(color)) return;
  try {
    storage?.setItem(`${BG_KEY_PREFIX}${themeKey}:${scheme}`, color);
  } catch {
    // Best-effort.
  }
}

/** The page colour this theme last had in this colour scheme, or null. */
export function rememberedThemeBackground(themeKey: string, scheme: "light" | "dark", storage: StorageLike | null = defaultStorage()): string | null {
  try {
    const color = storage?.getItem(`${BG_KEY_PREFIX}${themeKey}:${scheme}`) ?? null;
    return color && COLOR.test(color) ? color : null;
  } catch {
    return null;
  }
}

/** Keeps the remembered theme for `slug` current. */
export function useRememberTheme(slug: string | undefined, themeKey: string | undefined): void {
  useEffect(() => {
    if (slug && themeKey) rememberTheme(slug, themeKey);
  }, [slug, themeKey]);
}
