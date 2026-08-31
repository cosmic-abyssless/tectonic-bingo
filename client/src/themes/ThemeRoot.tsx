import type { CSSProperties, ReactNode } from "react";
import { getTheme } from "./registry";

// Wraps a bingo page and applies its theme's CSS custom properties. Admin
// and mod pages never wrap in this — they render with the page's base
// styles regardless of the bingo's theme.
export function ThemeRoot({ themeKey, children }: { themeKey: string; children: ReactNode }) {
  const theme = getTheme(themeKey);
  return <div style={theme.tokens as CSSProperties}>{children}</div>;
}
