import { useCallback, useMemo, useState } from "react";
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

/**
 * True once a report in `reports` was filed or changed status after the viewer last looked (per `markSeen`,
 * remembered in localStorage under `storageKey`). Drives the small pulse dot on the bug-report entry points.
 */
export function useBugReportsUnseen(reports: BugReportWithReporter[] | undefined, storageKey: string) {
  const [lastSeen, setLastSeen] = useState(() => readLastSeen(storageKey));

  const latestActivityAt = useMemo(() => {
    if (!reports?.length) return 0;
    return Math.max(...reports.map((r) => Math.max(new Date(r.createdAt).getTime(), r.resolvedAt ? new Date(r.resolvedAt).getTime() : 0)));
  }, [reports]);

  const markSeen = useCallback(() => {
    const now = Date.now();
    setLastSeen(now);
    writeLastSeen(storageKey, now);
  }, [storageKey]);

  return { hasUnseen: latestActivityAt > lastSeen, markSeen };
}
