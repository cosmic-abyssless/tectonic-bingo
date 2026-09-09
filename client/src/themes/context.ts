// Imports only slots.ts/tokens.ts types — never registry.ts or default/index.ts.
// default/* slot components import useSlot from here, so importing the
// registry here would create a cycle.
import { createContext, useContext } from "react";
import type { ThemeTokens } from "./tokens";
import type { SlotName, ThemeSlots } from "./slots";

export interface ThemeContextValue {
  key: string;
  tokens: ThemeTokens;
  slots: ThemeSlots;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useSlot<K extends SlotName>(name: K): ThemeSlots[K] {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useSlot must be used within ThemeProvider");
  return ctx.slots[name];
}

export function useThemeTokens(): ThemeTokens {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeTokens must be used within ThemeProvider");
  return ctx.tokens;
}
