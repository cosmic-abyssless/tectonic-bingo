// The client themes a Bingo can be drawn in (Bingo settings' theme select, the test data generator's theme option).
// A Bingo's `theme` is one of these; the default theme is always available. Keep in sync with the client's
// themes/registry.ts `loaders` (a theme registered there is listed here).
export const THEME_KEYS = ["default", "comic"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export const DEFAULT_THEME: ThemeKey = "default";
export const isThemeKey = (key: string): key is ThemeKey => (THEME_KEYS as readonly string[]).includes(key);
