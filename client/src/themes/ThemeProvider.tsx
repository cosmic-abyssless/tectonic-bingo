import { useEffect, useRef, useState, type ReactNode } from "react";
import { defaultTheme } from "./default";
import { defaultTokens } from "./tokens";
import { tokensToCssVars } from "./tokens";
import { isKnownTheme, onThemeHmrUpdate, resolveTheme, type ResolvedTheme } from "./registry";
import { ThemeContext } from "./context";
import type { ThemeSlots } from "./slots";

const DEFAULT_RESOLVED: ResolvedTheme = { key: defaultTheme.key, tokens: defaultTokens, slots: defaultTheme.slots as ThemeSlots };

// Not React.lazy/Suspense: we need a whole ThemeDefinition object, caching
// across remounts, and an admin theme-key edit must not re-suspend the tree.
// While a non-default theme loads, the tree renders under the default theme
// (its PageLoading slot is what a loading page shows).
export function ThemeProvider({ themeKey, children }: { themeKey: string; children: ReactNode }) {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => (isKnownTheme(themeKey) ? DEFAULT_RESOLVED : (resolveTheme(themeKey) as ResolvedTheme)));
  const requestedKey = useRef(themeKey);

  useEffect(() => {
    requestedKey.current = themeKey;
    const result = resolveTheme(themeKey);
    if (result instanceof Promise) {
      result.then((theme) => {
        if (requestedKey.current === themeKey) setResolved(theme);
      });
    } else {
      setResolved(result);
    }
  }, [themeKey]);

  // Dev-only: re-resolve when a theme file hot-updates (see registry.ts's
  // onThemeHmrUpdate) — editing tokens/slots wouldn't otherwise reach this
  // already-mounted provider, since nothing about `themeKey` changed.
  useEffect(() => {
    if (!import.meta.hot) return;
    return onThemeHmrUpdate(() => {
      const result = resolveTheme(themeKey);
      if (result instanceof Promise) {
        result.then((theme) => {
          if (requestedKey.current === themeKey) setResolved(theme);
        });
      } else {
        setResolved(result);
      }
    });
  }, [themeKey]);

  return (
    <ThemeContext.Provider value={resolved}>
      <div data-theme={resolved.key} style={tokensToCssVars(resolved.tokens)}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
