// Collapses runs of alike entries in one page of the audit log, for the team activity feed.
// See docs/audit-points-activity-plan.md §Phase 3.
import { AUDIT_ACTIONS, toAuditLabelInput, type AuditActionDef, type AuditAction, type AuditEntry } from "./audit.ts";

const runKey = (e: AuditEntry) => `${e.actor?.id ?? e.actorType}|${e.team?.id ?? ""}`;

function merge(members: AuditEntry[]): AuditEntry {
  const newest = members[0]!;
  if (members.length === 1) return newest;
  // condenseRun only ever buckets an action whose def.condense it already confirmed truthy, so def is always
  // defined and def.condense always set here — but typed `| undefined` regardless, matching every other
  // AUDIT_ACTIONS lookup that has to survive a historical entry whose action was later renamed or removed.
  const def = AUDIT_ACTIONS[newest.action] as AuditActionDef<AuditAction> | undefined;
  const label = def?.condense ? def.condense(members.map(toAuditLabelInput)) : newest.label;
  return { ...newest, label, condensed: { count: members.length, ids: members.map((m) => m.id), oldestAt: members[members.length - 1]!.at } };
}

function condenseRun(run: AuditEntry[]): AuditEntry[] {
  const buckets = new Map<AuditAction, AuditEntry[]>();
  // Each slot is either an entry to keep as it is, or the action whose bucket goes there (the position of its OLDEST member).
  // Walking oldest to newest, then flipping back, keeps a batch's points together above the one line that summarises it.
  const slots: (AuditEntry | AuditAction)[] = [];
  for (const entry of [...run].reverse()) {
    // ?. — a historical entry's action can outlive its AUDIT_ACTIONS registry entry (renamed or removed since);
    // treat "unknown" the same as "doesn't define condense" rather than crashing on the lookup.
    if (!AUDIT_ACTIONS[entry.action]?.condense) {
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
  // Buckets were filled oldest first; merge wants newest first.
  return slots.reverse().map((slot) => (typeof slot === "string" ? merge(buckets.get(slot)!.reverse()) : slot));
}

/**
 * Collapses runs of alike entries. A "run" is a stretch of consecutive entries (newest first, as every
 * query returns them) by the same actor for the same team. Inside a run, every action that defines
 * `condense` is merged into one entry, placed where its oldest member was; everything else, including
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
