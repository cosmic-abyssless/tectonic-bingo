import type { SubmissionStatus, TaskStatus } from "@bingo/shared";

const SUBMISSION_STYLE: Record<SubmissionStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-yellow-900/50 text-yellow-300 border-yellow-700" },
  approved: { label: "Approved", cls: "bg-green-900/50 text-green-300 border-green-700" },
  rejected: { label: "Rejected", cls: "bg-red-900/50 text-red-300 border-red-700" },
};

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const { label, cls } = SUBMISSION_STYLE[status];
  return <span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${cls}`}>{label}</span>;
}

export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  not_started: "bg-slate-600",
  in_progress: "bg-yellow-400",
  pending_approval: "bg-blue-400",
  completed: "bg-green-500",
};
