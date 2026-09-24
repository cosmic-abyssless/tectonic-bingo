import { useCallback, useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept live as the window changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Below Tailwind's `md` (768px): a phone, where pages that don't fit get a layout of their own. */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
