import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuditCategory, AuditEntry } from "@bingo/shared";
import { useAuditLog, useBingo } from "../../api/queries";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { timeAgo } from "../ui/time";
import { AuditActionBadge } from "../ui/AuditActionBadge";
import { Button } from "../ui/Button";
import { Card, EmptyState, Notice } from "../ui/Card";
import { ChevronDownIcon, ChevronRightIcon, ListIcon } from "../ui/icons";
import { MultiSelect } from "../ui/MultiSelect";
import { applyColumnVisibility } from "../ui/hiddenColumns";
import { DateTimeRangeFilter } from "../ui/DateTimeRangeFilter";
import { isRangeSet, type TimeRange } from "../ui/timeRange";

// Shared with SiteAuditLog.tsx — bug_report entries are bingo-scoped when
// reported from a bingo's own pages, so this filter is meaningful in both.
export const CATEGORIES: { key: AuditCategory; label: string }[] = [
  { key: "bingo", label: "Bingo" },
  { key: "settings", label: "Settings" },
  { key: "board", label: "Board" },
  { key: "signup", label: "Signups" },
  { key: "draft", label: "Draft" },
  { key: "team", label: "Teams" },
  { key: "submission", label: "Submissions" },
  { key: "points", label: "Points" },
  { key: "moderation", label: "Moderation" },
  { key: "system", label: "System" },
  { key: "bug_report", label: "Bug reports" },
  { key: "http", label: "Unaudited" },
];

export function inclusionFilter(excluded: Set<string>, options: { key: string }[]) {
  const checked = options.map((o) => o.key).filter((key) => !excluded.has(key));
  const narrowed = checked.length < options.length;
  return {
    checked,
    query: narrowed && checked.length > 0 ? checked : undefined,
    none: options.length > 0 && checked.length === 0,
    narrowed,
  };
}

export function useActorCatalog(scope: string): [Map<string, string>, (entries: AuditEntry[]) => void] {
  const [catalog, setCatalog] = useState<{ scope: string; names: Map<string, string> }>({ scope, names: new Map() });
  const names = catalog.scope === scope ? catalog.names : new Map<string, string>();
  const remember = useCallback((entries: AuditEntry[]) => {
    setCatalog((prev) => {
      const base = prev.scope === scope ? prev.names : new Map<string, string>();
      let next = base;
      for (const entry of entries) {
        if (!entry.actor) continue;
        const label = displayName(entry.actor);
        if (next.get(entry.actor.id) === label) continue;
        if (next === base) next = new Map(base);
        next.set(entry.actor.id, label);
      }
      return next === base && prev.scope === scope ? prev : { scope, names: next };
    });
  }, [scope]);
  return [names, remember];
}

export function actorOptionsFrom(names: Map<string, string>, entries: AuditEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.actor) continue;
    counts.set(entry.actor.id, (counts.get(entry.actor.id) ?? 0) + 1);
  }
  return [...names.entries()]
    .map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildCsv(entries: AuditEntry[]): string {
  const headers = ["Time", "Action", "Actor", "Team", "Label"];
  const rows = entries.map((e) => [new Date(e.at).toISOString(), e.action, e.actor ? displayName(e.actor) : e.actorType, e.team?.name ?? "", e.label]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

// A before/after diff for a `changes` field; every other detail key renders
// as a plain key/value line.
export function DetailsView({ details }: { details: unknown }) {
  if (!details || typeof details !== "object") return null;
  const { changes, ...rest } = details as { changes?: { before: Record<string, unknown>; after: Record<string, unknown> } };

  return (
    <div className="space-y-2 text-xs">
      {changes && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 font-medium text-on-surface-subtle">Before</div>
            {Object.entries(changes.before).map(([k, v]) => (
              <div key={k} className="text-on-surface-muted">
                <span className="text-on-surface-subtle">{k}:</span> {String(v)}
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 font-medium text-on-surface-subtle">After</div>
            {Object.entries(changes.after).map(([k, v]) => (
              <div key={k} className="text-on-surface-muted">
                <span className="text-on-surface-subtle">{k}:</span> {String(v)}
              </div>
            ))}
          </div>
        </div>
      )}
      {Object.entries(rest).map(([k, v]) => (
        <div key={k} className="text-on-surface-muted">
          <span className="text-on-surface-subtle">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
        </div>
      ))}
    </div>
  );
}

export function AuditLog({ slug }: { slug: string }) {
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(() => new Set());
  const [excludedTeams, setExcludedTeams] = useState<Set<string>>(() => new Set());
  const [excludedActors, setExcludedActors] = useState<Set<string>>(() => new Set());
  const [range, setRange] = useState<TimeRange>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: shell } = useBingo(slug);
  const [actorNames, rememberActors] = useActorCatalog(slug);
  const teamOptions = useMemo(() => (shell?.teams ?? []).map((t) => ({ key: t.id, label: t.name })), [shell]);
  const categories = inclusionFilter(excludedCategories, CATEGORIES);
  const teams = inclusionFilter(excludedTeams, teamOptions);
  const actors = inclusionFilter(excludedActors, [...actorNames.keys()].map((key) => ({ key })));

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useAuditLog(slug, {
    category: categories.query as AuditCategory[] | undefined,
    teamId: teams.query,
    actorUserId: actors.query,
    since: range.since,
    until: range.until,
  });
  const entries = useMemo(() => data?.pages.flatMap((p) => p.entries) ?? [], [data]);
  useEffect(() => {
    rememberActors(entries);
  }, [entries, rememberActors]);
  const actorOptions = useMemo(() => actorOptionsFrom(actorNames, entries), [actorNames, entries]);
  const filtered = categories.narrowed || teams.narrowed || actors.narrowed || isRangeSet(range);
  const blocked = categories.none || teams.none || actors.none;

  async function copyCsv() {
    await navigator.clipboard.writeText(buildCsv(entries));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          label="Category"
          options={CATEGORIES}
          selected={categories.checked}
          onChange={(visible) => setExcludedCategories(applyColumnVisibility(excludedCategories, CATEGORIES.map((c) => c.key), visible))}
        />
        {teamOptions.length > 0 && (
          <MultiSelect
            label="Team"
            options={teamOptions}
            selected={teams.checked}
            onChange={(visible) => setExcludedTeams(applyColumnVisibility(excludedTeams, teamOptions.map((t) => t.key), visible))}
          />
        )}
        {actorOptions.length > 0 && (
          <MultiSelect
            label="User"
            options={actorOptions}
            selected={actors.checked}
            onChange={(visible) => setExcludedActors(applyColumnVisibility(excludedActors, actorOptions.map((a) => a.key), visible))}
          />
        )}
        <DateTimeRangeFilter value={range} onChange={setRange} />
        <div className="ml-auto">
          <Button size="sm" onPress={copyCsv} isDisabled={blocked || entries.length === 0}>
            {copied ? "Copied" : "Copy as CSV"}
          </Button>
        </div>
      </div>

      {isError ? (
        <Notice tone="danger">{error instanceof Error ? error.message : "Failed to load the audit log"}</Notice>
      ) : isLoading && !blocked ? (
        <p className="py-20 text-center text-sm text-on-surface-muted">Loading…</p>
      ) : blocked || entries.length === 0 ? (
        <EmptyState icon={<ListIcon />} title={filtered ? "No matching activity" : "No activity yet"}>
          {filtered ? "Nothing in the log matches these filters. Try widening them." : "Actions taken on this bingo will show up here as they happen."}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <Card key={entry.id} className="overflow-hidden">
                <div className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <AuditActionBadge action={entry.action} />
                      {entry.team && <span className="text-xs text-on-surface-subtle">{entry.team.name}</span>}
                    </div>
                    <p className="text-sm text-on-surface">{entry.label}</p>
                    <p className="mt-0.5 text-xs text-on-surface-subtle">
                      {entry.actor ? <PlayerName userId={entry.actor.id}>{displayName(entry.actor)}</PlayerName> : entry.actorType} · {entry.actorRole}
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
