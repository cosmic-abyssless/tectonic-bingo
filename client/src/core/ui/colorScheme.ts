import { useSyncExternalStore, useEffect } from "react";
import { usePreference } from "./preferences";

const DARK_QUERY = "(prefers-color-scheme: dark)";

// One query for the page's life: readSystemScheme runs on every render of every component that reads the scheme, and
// a matchMedia call each time added up across a whole board re-rendering (#470).
let darkQuery: MediaQueryList | null = null;
const systemDarkQuery = () => (darkQuery ??= window.matchMedia(DARK_QUERY));

function subscribeToSystemScheme(onChange: () => void) {
  const mql = systemDarkQuery();
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
function readSystemScheme(): "light" | "dark" {
  return systemDarkQuery().matches ? "dark" : "light";
}

/** The user's raw "system" | "light" | "dark" choice, and a setter — for the appearance menu. */
export function useColorSchemePreference() {
  return usePreference("colorScheme");
}

/** The concrete "light" | "dark" scheme in effect right now — resolves "system" via the live OS preference. */
export function useResolvedColorScheme(): "light" | "dark" {
  const [preference] = usePreference("colorScheme");
  const systemScheme = useSyncExternalStore(subscribeToSystemScheme, readSystemScheme);
  return preference === "system" ? systemScheme : preference;
}

/** Keeps <html data-color-scheme> in sync with the raw preference — call once at the app root. */
export function useSyncColorSchemeAttribute(): void {
  const [preference] = usePreference("colorScheme");
  useEffect(() => {
    if (preference === "system") document.documentElement.removeAttribute("data-color-scheme");
    else document.documentElement.setAttribute("data-color-scheme", preference);
  }, [preference]);
}
