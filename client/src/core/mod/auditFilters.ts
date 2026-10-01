import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedValue } from "../../headless/useDebouncedValue";
import { parseUrlSet, serializeUrlSet, type UrlParamChanges } from "../ui/urlParams";
import { useSetUrlParams } from "../ui/useUrlParam";
import type { TimeRange } from "../ui/timeRange";

// The audit logs' filters (the Mod panel's and Site admin's) kept in the URL (#389), so a link opens the log filtered
// the same way: ?category=board,team&teams=<id>&actors=<id>&since=<iso>&until=<iso>&q=<search>. Nothing picked (Any)
// and no search keep the URL clean.

export interface AuditFilters {
  categories: Set<string>;
  teams: Set<string>;
  actors: Set<string>;
  range: TimeRange;
  q: string;
}

/** Every param the audit logs' filters use, to drop together when the page moves to another tab. */
export const AUDIT_FILTER_PARAMS = ["category", "teams", "actors", "since", "until", "q"] as const;

export function readAuditFilters(params: URLSearchParams): AuditFilters {
  return {
    categories: parseUrlSet(params.get("category"), []),
    teams: parseUrlSet(params.get("teams"), []),
    actors: parseUrlSet(params.get("actors"), []),
    range: { since: params.get("since") || undefined, until: params.get("until") || undefined },
    q: params.get("q") ?? "",
  };
}

export function writeAuditFilters(filters: AuditFilters): UrlParamChanges {
  // Nothing picked is Any, which is the default; an empty list would only say the same thing.
  const list = (values: Set<string>) => (values.size ? serializeUrlSet(values, []) : null);
  return {
    category: list(filters.categories),
    teams: list(filters.teams),
    actors: list(filters.actors),
    since: filters.range.since ?? null,
    until: filters.range.until ?? null,
    q: filters.q.trim() || null,
  };
}

/**
 * The audit log filters as the URL has them, a setter that changes some of them (replacing the history entry, so Back
 * doesn't step through every click), and the search box's own text, which reaches the URL once typing pauses.
 */
export function useAuditFilters() {
  const [params] = useSearchParams();
  const setUrl = useSetUrlParams();
  const filters = useMemo(() => readAuditFilters(params), [params]);
  const update = useCallback((patch: Partial<AuditFilters>) => setUrl(writeAuditFilters({ ...filters, ...patch })), [filters, setUrl]);

  const [search, setSearch] = useState(filters.q);
  const debouncedSearch = useDebouncedValue(search, 300).trim();
  useEffect(() => {
    if (debouncedSearch !== filters.q) update({ q: debouncedSearch });
    // Only the search's own changes write it; the URL changing for another filter mustn't undo a pause in typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  return { filters, update, search, setSearch };
}

/**
 * The User filter. Its options are only the actors whose entries have been seen so far, which a link's picks may not be
 * among yet, so what's picked filters as it is (unlike inclusionFilter, which only counts picks it has options for),
 * and `withPicked` lists the picks among the options whether seen or not, so the filter shows and can be cleared.
 * Picking every option is Any, as for the other checklists: `pick` stores that as nothing picked.
 */
export function actorFilter(selected: Set<string>, known: readonly string[]) {
  const query = selected.size ? [...selected] : undefined;
  const unseen = [...selected].filter((key) => !known.includes(key));
  return {
    checked: [...known.filter((key) => selected.has(key)), ...unseen],
    query,
    narrowed: !!query,
    withPicked: <T extends { key: string; label: string }>(options: T[]) => [...options, ...unseen.map((key) => ({ key, label: "Unknown user" }) as T)],
    pick: (visible: string[]) => new Set(visible.length >= known.length ? [] : visible),
  };
}
