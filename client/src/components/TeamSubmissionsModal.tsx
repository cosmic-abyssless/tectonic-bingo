import { useEffect } from "react";
import type { SubmissionSummary } from "../types";

const STATUS_STYLE: Record<
  SubmissionSummary["status"],
  { label: string; cls: string }
> = {
  pending:  { label: "Pending",  cls: "bg-yellow-900/50 text-yellow-300 border-yellow-700" },
  approved: { label: "Approved", cls: "bg-green-900/50  text-green-300  border-green-700"  },
  rejected: { label: "Rejected", cls: "bg-red-900/50    text-red-300    border-red-700"    },
};

const BADGE_DOT: Record<string, string> = {
  demonic:     "bg-red-500",
  draconic:    "bg-emerald-500",
  spectral:    "bg-purple-500",
  animalistic: "bg-orange-500",
  god_wars:    "bg-yellow-500",
  vampyric:    "bg-rose-500",
  desert:      "bg-amber-500",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  submissions: SubmissionSummary[];
  onClose: () => void;
  onSubmit?: () => void;
}

export function TeamSubmissionsModal({ submissions, onClose, onSubmit }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Team Submissions</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onSubmit && (
              <button
                onClick={onSubmit}
                className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded px-3 py-1 transition-colors cursor-pointer"
              >
                Submit
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-lg leading-none p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="text-4xl text-slate-600">📋</div>
              <p className="text-slate-400">No submissions yet</p>
              <p className="text-slate-600 text-sm">
                Submit a completion using the Submit button in the header.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-700/60">
              {submissions.map((sub) => {
                const { label, cls } = STATUS_STYLE[sub.status];
                const thumb = sub.screenshots[0]?.url;
                return (
                  <li key={sub.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors">
                    {/* Screenshot thumbnail */}
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
                          className="w-14 h-14 object-cover rounded-md border border-slate-600 hover:border-indigo-400 transition-colors"
                        />
                      </a>
                    ) : (
                      <div className="w-14 h-14 rounded-md border border-slate-700 bg-slate-900/50 shrink-0 flex items-center justify-center text-slate-600 text-xs">
                        —
                      </div>
                    )}

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      {/* Tile + Part */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={`inline-block w-2 h-2 rounded-full shrink-0 ${BADGE_DOT[sub.badgeCategory] ?? "bg-slate-500"}`}
                        />
                        <span className="text-white text-sm font-semibold truncate">
                          {sub.tileName}
                        </span>
                        <span className="text-xs text-slate-500 bg-slate-700 rounded-full px-2 py-0.5 shrink-0">
                          Part {sub.side}
                        </span>
                      </div>

                      {/* Items */}
                      <p className="text-sm text-slate-300 truncate">
                        {sub.items
                          .map((i) =>
                            i.targetQuantity > 1 ? `${i.quantity}× ${i.itemName}` : i.itemName
                          )
                          .join(", ")}
                      </p>

                      {/* Submitted by */}
                      <p className="text-xs text-slate-500 mt-0.5">by {sub.submittedBy}</p>

                      {/* Reviewer notes */}
                      {sub.reviewerNotes && (
                        <p className="text-xs text-amber-400 mt-0.5 truncate">
                          {sub.reviewerNotes}
                        </p>
                      )}
                    </div>

                    {/* Status + time */}
                    <div className="shrink-0 text-right flex flex-col items-end gap-1">
                      <span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${cls}`}>
                        {label}
                      </span>
                      <span className="text-xs text-slate-500">{timeAgo(sub.submittedAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
