import { AUDIT_ACTIONS, type AuditAction } from "@bingo/shared";
import { Badge } from "./Card";

export function AuditActionBadge({ action }: { action: AuditAction }) {
  const { title, tone } = AUDIT_ACTIONS[action];
  return <Badge tone={tone}>{title}</Badge>;
}
