import { AUDIT_ACTIONS, type AuditAction } from "@bingo/shared";
import { Badge } from "./Card";

export function AuditActionBadge({ action }: { action: AuditAction }) {
  // A historical entry's action can outlive its AUDIT_ACTIONS registry entry — an action gets renamed or
  // removed (see server/src/audit/query.ts's own fallback for the exact same reason) — so this falls back to
  // the raw action string instead of crashing on the lookup.
  const def = AUDIT_ACTIONS[action] as (typeof AUDIT_ACTIONS)[AuditAction] | undefined;
  return <Badge tone={def?.tone ?? "neutral"}>{def?.title ?? action}</Badge>;
}
