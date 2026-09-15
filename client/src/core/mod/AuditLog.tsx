import { useMemo, useState } from "react";
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
            <div className="mb-1 font-medium text-fg-subtle">Before</div>
            {Object.entries(changes.before).map(([k, v]) => (
              <div key={k} className="text-fg-muted">
                <span className="text-fg-subtle">{k}:</span> {String(v)}
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 font-medium text-fg-subtle">After</div>
            {Object.entries(changes.after).map(([k, v]) => (
              <div key={k} className="text-fg-muted">
                <span className="text-fg-subtle">{k}:</span> {String(v)}
              </div>
            ))}
          </div>
        </div>
      )}
      {Object.entries(rest).map(([k, v]) => (
        <div key={k} className="text-fg-muted">
          <span className="text-fg-subtle">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
        </div>
      ))}
    </div>
  );
}

export function AuditLog({ slug }: { slug: string }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [actorUserIds, setActorUserIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: shell } = useBingo(slug);
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useAuditLog(slug, {
    category: categories.length ? (categories as AuditCategory[]) : undefined,
    teamId: teamIds.length ? teamIds : undefined,
    actorUserId: actorUserIds.length ? actorUserIds : undefined,
  });

  const entries = useMemo(() => data?.pages.flatMap((p) => p.entries) ?? [], [data]);
  const teamOptions = useMemo(() => (shell?.teams ?? []).map((t) => ({ key: t.id, label: t.name })), [shell]);

  // Every distinct actor seen across loaded pages — there's no dedicated
  // "everyone who could ever act on this bingo" endpoint, so the picker
  // grows as more history loads rather than listing every mod/player upfront.
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect label="Category" options={CATEGORIES} selected={categories} onChange={setCategories} />
        {teamOptions.length > 0 && <MultiSelect label="Team" options={teamOptions} selected={teamIds} onChange={setTeamIds} />}
        {actorOptions.length > 0 && <MultiSelect label="User" options={actorOptions} selected={actorUserIds} onChange={setActorUserIds} />}
        <div className="ml-auto">
          <Button size="sm" onPress={copyCsv} isDisabled={entries.length === 0}>
            {copied ? "Copied" : "Copy as CSV"}
          </Button>
        </div>
      </div>

      {isError ? (
        <Notice tone="danger">{error instanceof Error ? error.message : "Failed to load the audit log"}</Notice>
      ) : isLoading ? (
        <p className="py-20 text-center text-sm text-fg-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyState icon={<ListIcon />} title="No activity yet">
          Actions taken on this bingo will show up here as they happen.
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
                      {entry.team && <span className="text-xs text-fg-subtle">{entry.team.name}</span>}
                    </div>
                    <p className="text-sm text-fg">{entry.label}</p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {entry.actor ? <PlayerName userId={entry.actor.id}>{displayName(entry.actor)}</PlayerName> : entry.actorType} · {entry.actorRole}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <span title={new Date(entry.at).toLocaleString()} className="text-xs text-fg-subtle">
                      {timeAgo(entry.at)}
                    </span>
                    <span className="text-fg-subtle">{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-line bg-bg px-4 py-3">
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
