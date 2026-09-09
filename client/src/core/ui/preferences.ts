import { useCallback, useSyncExternalStore } from "react";

/**
 * Client-side user preferences, persisted in localStorage. Each key lists its
 * allowed values; the first is the default and also what an unknown stored
 * value falls back to.
 */
const PREFERENCES = {
  // What to do with mod tabs whose stage has passed or hasn't arrived yet.
  outOfStageTabs: ["hide", "dim"],
} as const satisfies Record<string, readonly string[]>;

type PreferenceKey = keyof typeof PREFERENCES;
type PreferenceValue<K extends PreferenceKey> = (typeof PREFERENCES)[K][number];

const STORAGE_PREFIX = "pref:";
const listeners = new Set<() => void>();

function read<K extends PreferenceKey>(key: K): PreferenceValue<K> {
  const allowed = PREFERENCES[key] as readonly string[];
  const stored = localStorage.getItem(STORAGE_PREFIX + key);
  return (stored !== null && allowed.includes(stored) ? stored : allowed[0]) as PreferenceValue<K>;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePreference<K extends PreferenceKey>(key: K): [PreferenceValue<K>, (value: PreferenceValue<K>) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key));
  const set = useCallback(
    (next: PreferenceValue<K>) => {
      localStorage.setItem(STORAGE_PREFIX + key, next);
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
