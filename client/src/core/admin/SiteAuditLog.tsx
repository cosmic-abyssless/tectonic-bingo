import { useEffect, useMemo, useState } from "react";
import type { AuditCategory } from "@bingo/shared";
import { useSiteAuditLog } from "../../api/adminQueries";
import { useBingos } from "../../api/queries";
import { AUDIT_FILTER_PARAMS, actorFilter, useAuditFilters } from "../mod/auditFilters";
import { useUrlParam } from "../ui/useUrlParam";
import { CATEGORIES, DetailsView, actorOptionsFrom, buildCsv, useActorCatalog } from "../mod/AuditLog";
import { inclusionFilter } from "../ui/inclusionFilter";
import { displayName } from "../ui/user";
import { timeAgo } from "../ui/time";
import { AuditActionBadge } from "../ui/AuditActionBadge";
import { Button } from "../ui/Button";
import { Card, EmptyState, Notice } from "../ui/Card";
import { ChevronDownIcon, ChevronRightIcon, ListIcon } from "../ui/icons";
import { MultiSelect } from "../ui/MultiSelect";
import { SingleSelect } from "../ui/SingleSelect";
import { DateTimeRangeFilter } from "../ui/DateTimeRangeFilter";
import { isRangeSet } from "../ui/timeRange";
import { TableSearchInput } from "../ui/tableSearch";

type BingoScope = string | null | "all";

/** Every param the Site audit log's filters use, to drop together when Site admin moves to another tab. */
export const SITE_AUDIT_FILTER_PARAMS = [...AUDIT_FILTER_PARAMS, "bingo"] as const;
const BINGO_PARAM = "bingo";

// Site admin's counterpart to core/mod/AuditLog.tsx — every bingo (or just
// site-level entries, or one bingo), not one bingo's own log.
export function SiteAuditLog() {
  // The filters are in the URL, so a link opens the log filtered the same way; the Bingo as ?bingo=<id>, or
  // ?bingo=site for site-wide entries only.
  const { filters, update, search, setSearch } = useAuditFilters();
  const { range, q: debouncedSearch } = filters;
  const [bingoParam, setBingoParam] = useUrlParam(BINGO_PARAM);
  const bingoScope: BingoScope = bingoParam === null ? "all" : bingoParam === "site" ? null : bingoParam;
  const setBingoScope = (scope: BingoScope) => setBingoParam(scope === "all" ? null : scope === null ? "site" : scope);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: bingosData } = useBingos();
  const bingos = bingosData?.bingos ?? [];
  const bingoById = useMemo(() => new Map(bingos.map((b) => [b.id, b])), [bingos]);
  const bingoScopeOptions = useMemo(() => [{ key: "all", label: "All bingos" }, { key: "null", label: "Site-wide only" }, ...bingos.map((b) => ({ key: b.id, label: b.name }))], [bingos]);
  const [actorNames, rememberActors] = useActorCatalog("site");
  const categories = inclusionFilter(filters.categories, CATEGORIES);
  // Alphabetical, matching actorOptionsFrom's sort below — see the same line in core/mod/AuditLog.tsx for why an
  // order mismatch between `selected` and the rendered options confuses the picker dropdown's initial focus/scroll.
  const actorKeys = useMemo(() => [...actorNames.keys()].sort((a, b) => (actorNames.get(a) ?? "").localeCompare(actorNames.get(b) ?? "")), [actorNames]);
  const actors = actorFilter(filters.actors, actorKeys);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useSiteAuditLog(bingoScope, {
    category: categories.query as AuditCategory[] | undefined,
    actorUserId: actors.query,
    since: range.since,
    until: range.until,
    q: debouncedSearch || undefined,
  });
  const filtered = categories.narrowed || actors.narrowed || bingoScope !== "all" || isRangeSet(range) || debouncedSearch !== "";

  const entries = useMemo(() => data?.pages.flatMap((p) => p.entries) ?? [], [data]);
  useEffect(() => {
    rememberActors(entries);
  }, [entries, rememberActors]);
  const actorOptions = useMemo(() => actorOptionsFrom(actorNames, entries), [actorNames, entries]);

  async function copyCsv() {
    await navigator.clipboard.writeText(buildCsv(entries));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          label="Category"
          options={CATEGORIES}
          selected={categories.checked}
          onChange={(visible) => update({ categories: new Set(visible) })}
        />
        {actorOptions.length > 0 && (
          <MultiSelect
            label="User"
            options={actorOptions}
            selected={actors.checked}
            onChange={(visible) => update({ actors: actors.pick(visible) })}
          />
        )}
        <SingleSelect
          label="Bingo"
          options={bingoScopeOptions}
          selected={bingoScope === "all" ? "all" : (bingoScope ?? "null")}
          onChange={(key) => setBingoScope(key === "all" ? "all" : key === "null" ? null : key)}
        />
        <DateTimeRangeFilter value={range} onChange={(next) => update({ range: next })} />
        <TableSearchInput value={search} onChange={setSearch} placeholder="Search…" />
        <div className="ml-auto">
          <Button size="sm" onPress={copyCsv} isDisabled={entries.length === 0}>
            {copied ? "Copied" : "Copy as CSV"}
          </Button>
        </div>
      </div>

      {isError ? (
        <Notice tone="danger">{error instanceof Error ? error.message : "Failed to load the audit log"}</Notice>
      ) : isLoading ? (
        <p className="py-20 text-center text-sm text-on-surface-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyState icon={<ListIcon />} title={filtered ? "No matching activity" : "No activity yet"}>
          {filtered ? "Nothing in the log matches these filters. Try widening them." : "Actions taken across the site will show up here as they happen."}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const bingoName = entry.bingoId ? (bingoById.get(entry.bingoId)?.name ?? null) : null;
            return (
              <Card key={entry.id} className="overflow-hidden">
                <div className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <AuditActionBadge action={entry.action} />
                      {entry.team ? <span className="text-xs text-on-surface-subtle">{entry.team.name}</span> : bingoName ? <span className="text-xs text-on-surface-subtle">{bingoName}</span> : null}
                    </div>
                    <p className="text-sm text-on-surface">{entry.label}</p>
                    <p className="mt-0.5 text-xs text-on-surface-subtle">
                      {entry.actor ? displayName(entry.actor) : entry.actorType} · {entry.actorRole}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <span title={new Date(entry.at).toLocaleString()} className="text-xs text-on-surface-subtle">
                      {timeAgo(entry.at)}
                    </span>
                    <span className="text-on-surface-subtle">{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-outline bg-background px-4 py-3">
                    <DetailsView details={entry.details} />
                  </div>
                )}
              </Card>
            );
          })}

          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button variant="ghost" onPress={() => fetchNextPage()} isDisabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
