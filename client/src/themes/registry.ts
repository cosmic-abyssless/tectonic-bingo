import { defaultTheme } from "./default";
import { defaultTokens, type ThemeTokens } from "./tokens";
import type { ThemeSlots } from "./slots";
import type { ThemeContextValue } from "./context";

export interface ThemeDefinition {
  key: string;
  tokens?: Partial<ThemeTokens>;
  slots?: Partial<ThemeSlots>;
}

export type ResolvedTheme = ThemeContextValue;

// Follow-up themes register here as one line each, e.g.:
//   comic: () => import("./comic"),
const loaders: Record<string, () => Promise<{ default: ThemeDefinition }>> = {};

const DEFAULT_RESOLVED: ResolvedTheme = { key: defaultTheme.key, tokens: defaultTokens, slots: defaultTheme.slots as ThemeSlots };

const cache = new Map<string, Promise<ResolvedTheme>>();

export function isKnownTheme(key: string): boolean {
  return key in loaders;
}

export function mergeTheme(base: ResolvedTheme, def: ThemeDefinition): ResolvedTheme {
  return {
    key: def.key,
    tokens: { ...base.tokens, ...def.tokens, tile: { ...base.tokens.tile, ...def.tokens?.tile }, chrome: { ...base.tokens.chrome, ...def.tokens?.chrome } },
    slots: { ...base.slots, ...def.slots },
  };
}

// "default" or an unknown key resolves synchronously to the merged default
// theme. A known lazy key resolves asynchronously, cached per key; an import
// failure warns and falls back to default (never throws).
export function resolveTheme(key: string): ResolvedTheme | Promise<ResolvedTheme> {
  const loader = loaders[key];
  if (!loader) return DEFAULT_RESOLVED;

  let cached = cache.get(key);
  if (!cached) {
    cached = loader()
      .then((mod) => mergeTheme(DEFAULT_RESOLVED, mod.default))
      .catch((err) => {
        console.warn(`[themes] failed to load theme "${key}", falling back to default`, err);
        return DEFAULT_RESOLVED;
      });
    cache.set(key, cached);
  }
  return cached;
}
