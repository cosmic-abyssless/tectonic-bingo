import type { NodeStatus, SubmissionStatus } from "@bingo/shared";
import { Badge } from "./Card";

const SUBMISSION_STYLE: Record<SubmissionStatus, { label: string; tone: "warn" | "ok" | "danger" }> = {
  pending: { label: "Pending", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
};

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const { label, tone } = SUBMISSION_STYLE[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const TASK_STATUS_DOT: Record<NodeStatus, string> = {
  not_started: "bg-on-surface-subtle/50",
  in_progress: "bg-warn",
  pending_approval: "bg-info",
  completed: "bg-ok",
};
