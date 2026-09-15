import type { CSSProperties } from "react";

// Two layers of tokens, deliberately not merged into one system:
// - The app design system (index.css's `@theme`) is build-time, shared by
//   every page (mod/admin included), and NOT themeable.
// - ThemeTokens below is what a per-bingo theme CAN override at runtime,
//   applied by ThemeProvider as inline CSS custom properties on the page
//   root. `tile` replaces the old themes/default/tokens.ts board-only vars;
//   `chrome` is optional and, because Tailwind v4 compiles utilities like
//   `bg-background`/`text-on-surface` to `var(--color-background)`/`var(--color-on-surface)`
//   (the index.css @theme block is not `inline`), setting `--color-background`
//   here re-skins every one of those utilities under the provider div for
//   free — no component needs to know about theming.
export interface ThemeTokens {
  tile: {
    bg: string;
    border: string;
    empty: string;
    accent: string;
    complete: string;
    frozen: string;
  };
  chrome?: Partial<{
    background: string;
    surface: string;
    surfaceRaised: string;
    surfaceHover: string;
    outline: string;
    outlineStrong: string;
    onSurface: string;
    onSurfaceMuted: string;
    onSurfaceSubtle: string;
    accent: string;
    onAccent: string;
    ok: string;
    warn: string;
    danger: string;
    info: string;
    /** CSS length, e.g. "2px" — width of Button/AppHeader's borders. */
    borderWidth: string;
  }>;
}

// The neutral theme's tokens — every value themes/default/tokens.ts had.
export const defaultTokens: ThemeTokens = {
  tile: {
    bg: "#101012",
    border: "#232327",
    empty: "#0c0c0e",
    accent: "#a1a1aa",
    complete: "#4ade80",
    frozen: "#60a5fa",
  },
};

export function tokensToCssVars(tokens: ThemeTokens): CSSProperties {
  const vars: Record<string, string> = {
    "--tile-bg": tokens.tile.bg,
    "--tile-border": tokens.tile.border,
    "--tile-empty": tokens.tile.empty,
    "--tile-accent": tokens.tile.accent,
    "--tile-complete": tokens.tile.complete,
    "--tile-frozen": tokens.tile.frozen,
  };
  const chromeVarByKey: Record<keyof NonNullable<ThemeTokens["chrome"]>, string> = {
    background: "--color-background",
    surface: "--color-surface",
    surfaceRaised: "--color-surface-raised",
    surfaceHover: "--color-surface-hover",
    outline: "--color-outline",
    outlineStrong: "--color-outline-strong",
    onSurface: "--color-on-surface",
    onSurfaceMuted: "--color-on-surface-muted",
    onSurfaceSubtle: "--color-on-surface-subtle",
    accent: "--color-accent",
    onAccent: "--color-on-accent",
    ok: "--color-ok",
    warn: "--color-warn",
    danger: "--color-danger",
    info: "--color-info",
    borderWidth: "--control-border-width",
  };
  if (tokens.chrome) {
    for (const [key, value] of Object.entries(tokens.chrome)) {
      if (value === undefined) continue;
      vars[chromeVarByKey[key as keyof NonNullable<ThemeTokens["chrome"]>]] = value;
    }
  }
  return vars as CSSProperties;
}
