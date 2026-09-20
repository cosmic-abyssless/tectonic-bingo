import { useCallback, useSyncExternalStore } from "react";

const STORAGE_PREFIX = "pref:hiddenColumns:";
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: Set<string> }>();

function parseHidden(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function read(tableId: string): Set<string> {
  const raw = localStorage.getItem(STORAGE_PREFIX + tableId);
  const hit = cache.get(tableId);
  if (hit && hit.raw === raw) return hit.value;
  const value = parseHidden(raw);
  cache.set(tableId, { raw, value });
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

function notify() {
  listeners.forEach((l) => l());
}

export function useHiddenColumns(tableId: string): [Set<string>, (next: Set<string>) => void] {
  const hidden = useSyncExternalStore(subscribe, () => read(tableId));
  const setHidden = useCallback(
    (next: Set<string>) => {
      localStorage.setItem(STORAGE_PREFIX + tableId, JSON.stringify([...next]));
      cache.delete(tableId);
      notify();
    },
    [tableId],
  );
  return [hidden, setHidden];
}

export function applyColumnVisibility(prev: Set<string>, columnIds: string[], visibleIds: string[]): Set<string> {
  const next = new Set(prev);
  const visible = new Set(visibleIds);
  for (const id of columnIds) {
    if (visible.has(id)) next.delete(id);
    else next.add(id);
  }
  return next;
}
