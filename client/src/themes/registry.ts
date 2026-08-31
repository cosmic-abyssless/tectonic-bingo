import type { ComponentType } from "react";
import { defaultTokens } from "./default/tokens";

export interface ThemeDefinition {
  tokens: Record<string, string>;
  // Optional per-component visual overrides, keyed by core component name
  // (e.g. "TileCell", "BoardGrid"). A themed bingo (bingos.theme) that wants
  // custom art/layout for one piece of the board provides just that
  // override — everything else still comes from core/.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components?: Partial<Record<string, ComponentType<any>>>;
}

const themes: Record<string, ThemeDefinition> = {
  default: { tokens: defaultTokens },
};

export function getTheme(key: string): ThemeDefinition {
  return themes[key] ?? themes.default;
}

// Admin and mod surfaces must never theme (they always import core/*
// directly) — this hook is only for player-facing pages.
export function useThemedComponent<T>(themeKey: string, name: string, fallback: T): T {
  const theme = getTheme(themeKey);
  return (theme.components?.[name] as T) ?? fallback;
}
