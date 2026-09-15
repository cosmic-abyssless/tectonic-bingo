import { useSyncExternalStore, useEffect } from "react";
import { usePreference } from "./preferences";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemScheme(onChange: () => void) {
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
function readSystemScheme(): "light" | "dark" {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
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
