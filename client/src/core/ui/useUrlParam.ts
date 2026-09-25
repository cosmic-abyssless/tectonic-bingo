import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A value kept in the page's URL (`?name=value`), so a link to the page opens it in the same state: which tab, which
 * profile. Setting null removes it. Replaces the current history entry unless `push` is set (opening a dialog pushes,
 * so Back closes it).
 */
export function useUrlParam(name: string): [string | null, (value: string | null, opts?: { push?: boolean }) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (value: string | null, opts?: { push?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null) next.delete(name);
          else next.set(name, value);
          return next;
        },
        { replace: !opts?.push },
      );
    },
    [name, setParams],
  );
  return [params.get(name), set];
}

/**
 * Removes several URL params in one navigation. Two setters called back to back don't combine (each starts from the
 * URL as it was), so clearing related params, like a dialog and its tab, has to be one update.
 */
export function useClearUrlParams(names: readonly string[]): () => void {
  const [, setParams] = useSearchParams();
  return useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        names.forEach((name) => next.delete(name));
        return next;
      },
      { replace: true },
    );
  }, [names, setParams]);
}

/** A tab kept in the URL: the param's value when it names one of `tabs`, else `fallback`. */
export function useUrlTab<T extends string>(name: string, tabs: readonly T[], fallback: T): [T, (tab: T) => void] {
  const [value, setValue] = useUrlParam(name);
  const tab = tabs.includes(value as T) ? (value as T) : fallback;
  // The default tab keeps the URL clean.
  const setTab = useCallback((next: T) => setValue(next === fallback ? null : next), [setValue, fallback]);
  return [tab, setTab];
}
