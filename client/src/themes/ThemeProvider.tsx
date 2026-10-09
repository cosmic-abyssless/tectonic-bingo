import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { rememberThemeBackground, rememberedThemeBackground } from "./rememberedTheme";
import { tokensToCssVars } from "./tokens";
import { letteringClasses } from "./lettering";
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

  const activeTokens = resolved?.tokens[scheme];
  const pageColor = activeTokens?.chrome?.background;
  useEffect(() => {
    if (resolved && pageColor) rememberThemeBackground(resolved.key, scheme, pageColor);
  }, [resolved, scheme, pageColor]);

  // The same object for as long as the theme and scheme are: nearly every component reads this context (useSlot,
  // useThemeTokens), so a new one on each render of the page above re-rendered the whole board, every memoised Tile
  // included, e.g. three times over as a Tile opened (#470).
  const value = useMemo(
    () => (resolved && activeTokens ? { key: resolved.key, tokens: activeTokens, slots: resolved.slots, palette: resolved.palettes[scheme] } : null),
    [resolved, activeTokens, scheme],
  );
  const cssVars = useMemo(() => (activeTokens ? tokensToCssVars(activeTokens) : undefined), [activeTokens]);
  // A theme that sets a heading font names it in these variables, which letters the page (lettering.ts).
  const lettering = useMemo(() => letteringClasses(cssVars) || undefined, [cssVars]);

  // Still loading: paint the wait in the colour this theme's page had last time, so a
  // reload goes straight from that colour to the finished page rather than default
  // colour -> themed colour.
  if (!resolved || !value) {
    const waitingColor = rememberedThemeBackground(themeKey, scheme);
    return <div style={{ minHeight: "100dvh", backgroundColor: waitingColor ?? undefined }}>{fallback}</div>;
  }
  return (
    <ThemeContext.Provider value={value}>
      <div data-theme={resolved.key} className={lettering} style={cssVars}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
