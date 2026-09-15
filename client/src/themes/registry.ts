import { defaultTheme } from "./default";
import { defaultTokens, type ThemeTokens } from "./tokens";
import type { ThemeSlots } from "./slots";

export interface ThemeDefinition {
  key: string;
  tokens?: { light?: Partial<ThemeTokens>; dark?: Partial<ThemeTokens> };
  slots?: Partial<ThemeSlots>;
}

// Distinct from ThemeContextValue (themes/context.ts), which holds a single
// ThemeTokens already resolved for the CURRENT scheme — this holds both, so
// ThemeProvider can pick the right one whenever the scheme changes without
// re-resolving/re-fetching the theme itself.
export interface ResolvedTheme {
  key: string;
  tokens: { light: ThemeTokens; dark: ThemeTokens };
  slots: ThemeSlots;
}

// Follow-up themes register here as one line each.
const loaders: Record<string, () => Promise<{ default: ThemeDefinition }>> = {
  comic: () => import("./comic"),
};

const DEFAULT_RESOLVED: ResolvedTheme = { key: defaultTheme.key, tokens: defaultTokens, slots: defaultTheme.slots as ThemeSlots };

// Both live on import.meta.hot.data rather than plain module-level `const`s.
// Each lazy theme file self-accepts its own HMR updates (see
// themes/comic/index.ts) and calls pushThemeHmrUpdate below — but Vite
// re-imports *this* module fresh (a genuinely new top-level execution, own
// `cache`/`hmrListeners` if they were plain consts) as part of resolving
// that accepting module's own dependencies on every one of its updates.
// hot.data is the one thing Vite keeps stable across that, keyed by this
// file regardless of which "instance" of it is currently executing — so
// it's the only way pushThemeHmrUpdate (called from whichever instance
// comic/index.ts's accept just re-imported) and an already-mounted
// ThemeProvider's `resolveTheme` (called from the ORIGINAL instance it
// statically imported at initial page load) end up reading/writing the
// same Map/Set.
//
// No-op — and dead code eliminated — in a production build, where
// import.meta.hot is statically undefined and every module is loaded
// exactly once.
const cache: Map<string, Promise<ResolvedTheme>> = import.meta.hot?.data.themeCache ?? new Map();
const hmrListeners: Set<() => void> = import.meta.hot?.data.hmrListeners ?? new Set();
if (import.meta.hot) {
  import.meta.hot.data.themeCache = cache;
  import.meta.hot.data.hmrListeners = hmrListeners;
}

export function isKnownTheme(key: string): boolean {
  return key in loaders;
}

function mergeSchemeTokens(base: ThemeTokens, def?: Partial<ThemeTokens>): ThemeTokens {
  return { tile: { ...base.tile, ...def?.tile }, chrome: { ...base.chrome, ...def?.chrome } };
}

export function mergeTheme(base: ResolvedTheme, def: ThemeDefinition): ResolvedTheme {
  return {
    key: def.key,
    tokens: {
      light: mergeSchemeTokens(base.tokens.light, def.tokens?.light),
      dark: mergeSchemeTokens(base.tokens.dark, def.tokens?.dark),
    },
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

// Dev-only: ThemeProvider resolves a theme once per `themeKey` (see its
// effect's dependency array), so editing a theme's tokens/slots wouldn't
// otherwise be visible without a full page reload — nothing about
// `themeKey` changes when you save the file. Each lazy theme module calls
// pushThemeHmrUpdate from its own `import.meta.hot.accept` (see
// themes/comic/index.ts for the ~3-line snippet) so mounted providers can
// re-render with the new tokens/slots.
//
// This is *not* done by re-`import()`ing the theme after its own update:
// a plain dynamic import() with a static specifier is cached forever by
// the browser's native ESM module registry for that URL, regardless of
// server-side content changes — only Vite's own `accept` callback is
// guaranteed to hand back the freshly-evaluated module. pushThemeHmrUpdate
// takes that fresh ThemeDefinition directly and writes it straight into
// `cache`, so no re-import ever happens.
export function onThemeHmrUpdate(listener: () => void): () => void {
  hmrListeners.add(listener);
  return () => hmrListeners.delete(listener);
}
export function pushThemeHmrUpdate(def: ThemeDefinition): void {
  cache.set(def.key, Promise.resolve(mergeTheme(DEFAULT_RESOLVED, def)));
  hmrListeners.forEach((listener) => listener());
}
