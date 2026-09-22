import { useEffect, useState } from "react";

// Holds `value` until it's stopped changing for `delayMs`, so a query keyed on it (e.g. a server search)
// fires once per pause in typing instead of once per keystroke.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
