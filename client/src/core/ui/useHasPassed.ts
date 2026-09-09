import { useEffect, useState } from "react";

// setTimeout overflows past ~24.8 days, so long waits are chunked.
const MAX_DELAY = 2 ** 31 - 1;

/**
 * True once `iso` is in the past (or missing). Re-renders exactly once, when
 * the moment arrives, so gates like "submissions open at startsAt" flip
 * without a page reload.
 */
export function useHasPassed(iso: string | null | undefined): boolean {
  const target = iso ? new Date(iso).getTime() : null;
  const [passed, setPassed] = useState(() => target === null || Date.now() >= target);

  useEffect(() => {
    if (target === null) {
      setPassed(true);
      return;
    }
    let id: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = target - Date.now();
      if (remaining <= 0) setPassed(true);
      else id = setTimeout(check, Math.min(remaining, MAX_DELAY));
    };
    setPassed(Date.now() >= target);
    check();
    return () => clearTimeout(id);
  }, [target]);

  return passed;
}
