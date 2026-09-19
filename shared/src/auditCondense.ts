// Collapses runs of alike entries in one page of the audit log, for the team activity feed.
// See docs/audit-points-activity-plan.md §Phase 3.
import { AUDIT_ACTIONS, toAuditLabelInput, type AuditActionDef, type AuditAction, type AuditEntry } from "./audit.ts";

const runKey = (e: AuditEntry) => `${e.actor?.id ?? e.actorType}|${e.team?.id ?? ""}`;

function merge(members: AuditEntry[]): AuditEntry {
  const newest = members[0]!;
  if (members.length === 1) return newest;
  const def = AUDIT_ACTIONS[newest.action] as AuditActionDef<AuditAction>;
  const label = def.condense!(members.map(toAuditLabelInput));
  return { ...newest, label, condensed: { count: members.length, ids: members.map((m) => m.id), oldestAt: members[members.length - 1]!.at } };
}

function condenseRun(run: AuditEntry[]): AuditEntry[] {
  const buckets = new Map<AuditAction, AuditEntry[]>();
  // Each slot is either an entry to keep as it is, or the action whose bucket goes there (the position of its newest member).
  const slots: (AuditEntry | AuditAction)[] = [];
  for (const entry of run) {
    if (!AUDIT_ACTIONS[entry.action].condense) {
      slots.push(entry);
      continue;
    }
    const bucket = buckets.get(entry.action);
    if (bucket) bucket.push(entry);
    else {
      buckets.set(entry.action, [entry]);
      slots.push(entry.action);
    }
  }
  return slots.map((slot) => (typeof slot === "string" ? merge(buckets.get(slot)!) : slot));
}

/**
 * Collapses runs of alike entries. A "run" is a stretch of consecutive entries (newest first, as every
 * query returns them) by the same actor for the same team. Inside a run, every action that defines
 * `condense` is merged into one entry, placed where its newest member was; everything else, including
 * every points entry, is left exactly as it is. Groups never span pages: the cursor still counts raw rows.
 */
export function condenseAuditEntries(entries: AuditEntry[]): AuditEntry[] {
  const out: AuditEntry[] = [];
  let start = 0;
  while (start < entries.length) {
    const key = runKey(entries[start]!);
    let end = start + 1;
    while (end < entries.length && runKey(entries[end]!) === key) end++;
    out.push(...condenseRun(entries.slice(start, end)));
    start = end;
  }
  return out;
}
