import { useMemo, useState } from "react";
import type { AuditCategory } from "@bingo/shared";
import { useSiteAuditLog } from "../../api/adminQueries";
import { useBingos } from "../../api/queries";
import { CATEGORIES, DetailsView, buildCsv } from "../mod/AuditLog";
import { displayName } from "../ui/user";
import { timeAgo } from "../ui/time";
import { AuditActionBadge } from "../ui/AuditActionBadge";
import { Button } from "../ui/Button";
import { Card, EmptyState, Notice } from "../ui/Card";
import { ChevronDownIcon, ChevronRightIcon, ListIcon } from "../ui/icons";
import { Menu, MenuItem, MenuTrigger } from "../ui/Menu";
import { MultiSelect } from "../ui/MultiSelect";
import { DateTimeRangeFilter } from "../ui/DateTimeRangeFilter";
import { isRangeSet, type TimeRange } from "../ui/timeRange";

type BingoScope = string | null | "all";

// Single-select sibling of MultiSelect — "All bingos" / "Site-wide only" /
// one specific bingo. A checklist doesn't fit here since these are mutually
// exclusive scopes, not independent filters.
function BingoScopeFilter({ options, value, onChange }: { options: { key: string; label: string }[]; value: BingoScope; onChange: (v: BingoScope) => void }) {
  const selectedKey = value === "all" ? "all" : (value ?? "null");
  const summary = options.find((o) => o.key === selectedKey)?.label ?? "All bingos";
  return (
    <MenuTrigger>
      <Button variant="secondary" size="sm" className={value !== "all" ? "border-on-surface" : ""}>
        <span className="text-on-surface-subtle">Bingo:</span> {summary}
        <ChevronDownIcon size={14} />
      </Button>
      <Menu
        selectionMode="single"
        selectedKeys={new Set([selectedKey])}
        onSelectionChange={(keys) => {
          const k = [...keys][0] as string | undefined;
          onChange(k === undefined || k === "all" ? "all" : k === "null" ? null : k);
        }}
        items={options}
      >
        {(option) => <MenuItem id={option.key} textValue={option.label}>{option.label}</MenuItem>}
      </Menu>
    </MenuTrigger>
  );
}

// Site admin's counterpart to core/mod/AuditLog.tsx — every bingo (or just
// site-level entries, or one bingo), not one bingo's own log.
export function SiteAuditLog() {
  const [categories, setCategories] = useState<string[]>([]);
  const [actorUserIds, setActorUserIds] = useState<string[]>([]);
  const [bingoScope, setBingoScope] = useState<BingoScope>("all");
  const [range, setRange] = useState<TimeRange>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: bingosData } = useBingos();
  const bingos = bingosData?.bingos ?? [];
  const bingoById = useMemo(() => new Map(bingos.map((b) => [b.id, b])), [bingos]);
  const bingoScopeOptions = useMemo(() => [{ key: "all", label: "All bingos" }, { key: "null", label: "Site-wide only" }, ...bingos.map((b) => ({ key: b.id, label: b.name }))], [bingos]);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useSiteAuditLog(bingoScope, {
    category: categories.length ? (categories as AuditCategory[]) : undefined,
    actorUserId: actorUserIds.length ? actorUserIds : undefined,
    since: range.since,
    until: range.until,
  });
  const filtered = categories.length > 0 || actorUserIds.length > 0 || bingoScope !== "all" || isRangeSet(range);

  const entries = useMemo(() => data?.pages.flatMap((p) => p.entries) ?? [], [data]);

  const actorOptions = useMemo(() => {
    const byId = new Map<string, { key: string; label: string; count: number }>();
    for (const e of entries) {
      if (!e.actor) continue;
      const existing = byId.get(e.actor.id);
      if (existing) existing.count++;
      else byId.set(e.actor.id, { key: e.actor.id, label: displayName(e.actor), count: 1 });
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [entries]);

  async function copyCsv() {
    await navigator.clipboard.writeText(buildCsv(entries));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect label="Category" options={CATEGORIES} selected={categories} onChange={setCategories} />
        {actorOptions.length > 0 && <MultiSelect label="User" options={actorOptions} selected={actorUserIds} onChange={setActorUserIds} />}
        <BingoScopeFilter options={bingoScopeOptions} value={bingoScope} onChange={setBingoScope} />
        <DateTimeRangeFilter value={range} onChange={setRange} />
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
