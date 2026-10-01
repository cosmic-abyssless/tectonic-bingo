import { useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { parseUrlSet, serializeUrlSet, withParams, type UrlParamChanges } from "./urlParams";

/**
 * A value kept in the page's URL (`?name=value`), so a link to the page opens it in the same state: which tab, which
 * profile. Setting null removes it. Replaces the current history entry unless `push` is set (opening a dialog pushes,
 * so Back closes it).
 */
export function useUrlParam(name: string): [string | null, (value: string | null, opts?: { push?: boolean }) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (value: string | null, opts?: { push?: boolean }) => {
      setParams((prev) => withParams(prev, { [name]: value }), { replace: !opts?.push });
    },
    [name, setParams],
  );
  return [params.get(name), set];
}

/**
 * Changes several URL params in one navigation. Two setters called back to back don't combine (each starts from the
 * URL as it was), so params that change together, like closing a Tile while switching Teams, have to be one update.
 * `state` goes on the history entry (see BingoPageProvider, which marks the entries its opens pushed); without one, a
 * replace keeps the entry's own.
 */
export function useSetUrlParams(): (changes: UrlParamChanges, opts?: { push?: boolean; state?: unknown }) => void {
  const [, setParams] = useSearchParams();
  const { state: currentState } = useLocation();
  return useCallback(
    (changes: UrlParamChanges, opts?: { push?: boolean; state?: unknown }) => {
      const state = opts && "state" in opts ? opts.state : opts?.push ? undefined : currentState;
      setParams((prev) => withParams(prev, changes), { replace: !opts?.push, state });
    },
    [setParams, currentState],
  );
}

/** Removes several URL params in one navigation (see useSetUrlParams for why it has to be one). */
export function useClearUrlParams(names: readonly string[]): () => void {
  const setParams = useSetUrlParams();
  return useCallback(() => setParams(Object.fromEntries(names.map((name) => [name, null]))), [names, setParams]);
}

/**
 * A set of picks kept in the URL as a comma list (`?status=pending,approved`), as a filter's checklist is. The default
 * keeps the URL clean, and a change replaces the history entry, so Back doesn't step through every click.
 */
export function useUrlSet(name: string, fallback: readonly string[] = []): [Set<string>, (values: Iterable<string>) => void] {
  const [value, setValue] = useUrlParam(name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const set = useMemo(() => parseUrlSet(value, fallback), [value, fallback.join(",")]);
  const update = useCallback((values: Iterable<string>) => setValue(serializeUrlSet(values, fallback)), [setValue, fallback]);
  return [set, update];
}

/**
 * A tab kept in the URL: the param's value when it names one of `tabs`, else `fallback`. Moving to another tab drops
 * `tabParams`, the params the tabs keep their own state in (a filter), so one tab's don't carry over to the next.
 */
export function useUrlTab<T extends string>(name: string, tabs: readonly T[], fallback: T, tabParams: readonly string[] = []): [T, (tab: T) => void] {
  const [params] = useSearchParams();
  const setParams = useSetUrlParams();
  const value = params.get(name);
  const tab = tabs.includes(value as T) ? (value as T) : fallback;
  const tabParamsKey = tabParams.join(",");
  const setTab = useCallback(
    (next: T) => {
      if (next === tab) return;
      const dropped = tabParamsKey ? Object.fromEntries(tabParamsKey.split(",").map((p) => [p, null])) : {};
      // The default tab keeps the URL clean.
      setParams({ ...dropped, [name]: next === fallback ? null : next });
    },
    [setParams, name, tab, fallback, tabParamsKey],
  );
  return [tab, setTab];
}
