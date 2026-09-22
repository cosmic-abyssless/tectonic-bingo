import { useCallback, useSyncExternalStore } from "react";

// Which named sections (e.g. the player modal's "Records held") a viewer has
// collapsed — a single global client preference, not scoped per user or per
// player profile, same convention as useHiddenColumns.
const STORAGE_KEY = "pref:collapsedSections";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Set<string> } | null = null;

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function read(): Set<string> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (cache && cache.raw === raw) return cache.value;
  const value = parse(raw);
  cache = { raw, value };
  return value;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useCollapsedSections(): [Set<string>, (id: string, collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, read);
  const setCollapsed = useCallback((id: string, isCollapsed: boolean) => {
    const next = new Set(read());
    if (isCollapsed) next.add(id);
    else next.delete(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    cache = null;
    listeners.forEach((l) => l());
  }, []);
  return [collapsed, setCollapsed];
}
