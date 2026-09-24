import { useCallback, useSyncExternalStore } from "react";

/**
 * Client-side user preferences, persisted in localStorage. Each key lists its
 * allowed values; the first is the default and also what an unknown stored
 * value falls back to.
 */
const PREFERENCES = {
  // What to do with mod tabs whose stage has passed or hasn't arrived yet.
  outOfStageTabs: ["hide", "dim"],
  // Light/dark appearance — "system" tracks the OS preference live.
  colorScheme: ["system", "light", "dark"],
  // Whether the mod Signups table / the draft pool table spans the whole page or keeps the reading width the
  // content above it uses.
  signupRosterWidth: ["full", "narrow"],
  draftPoolWidth: ["full", "narrow"],
  // How the stats timeline shows when each event happened (core/stats/timeFormat.ts).
  statsTimeFormat: ["clock", "sinceStart", "ago", "full"],
  // The player profile's last picked tab (core/tectonic/PlayerProfileDialog.tsx).
  profileTab: ["bingo", "clan", "past", "signup"],
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
