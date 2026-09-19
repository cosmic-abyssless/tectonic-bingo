import { useEffect, useRef, useState, type ReactNode } from "react";
import { tokensToCssVars } from "./tokens";
import { onThemeHmrUpdate, peekTheme, resolveTheme, type ResolvedTheme } from "./registry";
import { ThemeContext } from "./context";
import { useResolvedColorScheme } from "../core/ui/colorScheme";

// Not React.lazy/Suspense: we need a whole ThemeDefinition object, caching
// across remounts, and an admin theme-key edit must not re-suspend the tree.
// While a non-default theme's chunk is still loading, `fallback` (a neutral
// loading state) is shown instead of the page: rendering the page under the
// default theme and swapping when the real one arrives paints a visibly
// un-themed page for a few frames. Themes are preloaded early (see
// rememberedTheme.ts) so this is rarely on screen for long. Once a theme is
// showing, a later change of `themeKey` keeps the current one until the new one
// is ready rather than falling back to the loading state.
export function ThemeProvider({ themeKey, children, fallback = null }: { themeKey: string; children: ReactNode; fallback?: ReactNode }) {
  const scheme = useResolvedColorScheme();
  const [resolved, setResolved] = useState<ResolvedTheme | null>(() => peekTheme(themeKey));
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

  if (!resolved) return <>{fallback}</>;

  const activeTokens = resolved.tokens[scheme];
  return (
    <ThemeContext.Provider value={{ key: resolved.key, tokens: activeTokens, slots: resolved.slots, palette: resolved.palettes[scheme] }}>
      <div data-theme={resolved.key} style={tokensToCssVars(activeTokens)}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
