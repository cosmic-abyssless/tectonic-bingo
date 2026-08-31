import type { SubmissionSummary } from "../types";

const STATUS_STYLE: Record<
  SubmissionSummary["status"],
  { label: string; cls: string }
> = {
  pending: {
    label: "Pending",
    cls: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  },
  approved: {
    label: "Approved",
    cls: "bg-green-900/50  text-green-300  border-green-700",
  },
  rejected: {
    label: "Rejected",
    cls: "bg-red-900/50    text-red-300    border-red-700",
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SubmissionRow({ sub }: { sub: SubmissionSummary }) {
  const { label, cls } = STATUS_STYLE[sub.status];
  const thumb = sub.screenshots[0]?.url;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-700/50 last:border-0">
      {thumb ? (
        <a
          href={thumb}
          target="_blank"
          rel="noreferrer"
          className="shrink-0"
          title="View screenshot"
        >
          <img
            src={thumb}
            alt="screenshot"
            className="w-12 h-12 object-cover rounded border border-slate-600 hover:border-indigo-400 transition-colors"
          />
        </a>
      ) : (
        <div className="w-12 h-12 rounded border border-slate-700 bg-slate-900/50 shrink-0 flex items-center justify-center text-slate-600 text-xs">
          —
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span
            className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${cls}`}
          >
            {label}
          </span>
          {sub.isWildcardRedemption && (
            <span className="text-xs font-semibold border rounded-full px-2 py-0.5 bg-amber-900/50 text-amber-300 border-amber-700">
              ✦ wildcard
            </span>
          )}
          <span className="text-xs text-slate-500">{timeAgo(sub.submittedAt)}</span>
        </div>
        <p className="text-sm text-slate-200 truncate">
          {sub.items
            .map((i) =>
              i.targetQuantity > 1
                ? `${i.quantity}× ${i.itemName}`
                : i.itemName,
            )
            .join(", ")}
          {sub.isWildcardRedemption && sub.wildcardItemName && (
            <span className="text-slate-500"> via {sub.wildcardItemName}</span>
          )}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">by {sub.submittedBy}</p>
        {sub.reviewerNotes && (
          <p className="text-xs text-amber-400 mt-0.5 truncate">
            {sub.reviewerNotes}
          </p>
        )}
      </div>
    </div>
  );
}
