import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { BugReportWithReporter } from "@bingo/shared";

function readLastSeen(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeLastSeen(key: string, at: number): void {
  try {
    localStorage.setItem(key, String(at));
  } catch {
    // Private browsing / blocked storage — the pulse just won't persist across reloads.
  }
}

/** Where a site admin's "last looked at every bug report" is kept: the Bug reports tab and the header's dot share it. */
export const ADMIN_BUG_REPORTS_SEEN_KEY = "bugReports:lastSeen:admin";

// One "last seen" per storage key, shared by every hook using that key, so marking reports seen in one place (the
// admin page's Bug reports tab) clears the dot everywhere else at once (the header's account button). Other browser
// tabs catch up through the storage event.
const lastSeenByKey = new Map<string, number>();
const listeners = new Set<() => void>();

function lastSeenFor(key: string): number {
  let at = lastSeenByKey.get(key);
  if (at === undefined) {
    at = readLastSeen(key);
    lastSeenByKey.set(key, at);
  }
  return at;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key && lastSeenByKey.has(e.key)) {
      lastSeenByKey.set(e.key, readLastSeen(e.key));
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * True once a report in `reports` was filed (or, unless `newOnly`, changed status) after the viewer last looked (per
 * `markSeen`, remembered in localStorage under `storageKey` and shared by every hook with that key). Drives the small
 * pulse dots on the bug-report entry points.
 */
export function useBugReportsUnseen(reports: BugReportWithReporter[] | undefined, storageKey: string, { newOnly = false }: { newOnly?: boolean } = {}) {
  const lastSeen = useSyncExternalStore(subscribe, () => lastSeenFor(storageKey));

  const latestActivityAt = useMemo(() => {
    if (!reports?.length) return 0;
    return Math.max(...reports.map((r) => Math.max(new Date(r.createdAt).getTime(), !newOnly && r.resolvedAt ? new Date(r.resolvedAt).getTime() : 0)));
  }, [reports, newOnly]);

  const markSeen = useCallback(() => {
    const now = Date.now();
    lastSeenByKey.set(storageKey, now);
    writeLastSeen(storageKey, now);
    for (const listener of listeners) listener();
  }, [storageKey]);

  return { hasUnseen: latestActivityAt > lastSeen, markSeen };
}
