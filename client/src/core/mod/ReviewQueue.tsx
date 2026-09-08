import { useState } from "react";
import type { ModSubmissionRow, SubmissionStatus } from "@bingo/shared";
import { useCreatePointAdjustment, useModSubmissions, useReviewSubmission } from "../../api/queries";
import { SubmissionStatusBadge } from "../ui/StatusBadge";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";
import { claimsSummary } from "../submissions/claimsSummary";

type Filter = SubmissionStatus | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

// A MANUAL leaf has no separate completion decision — approving its claim IS
// the decision (rejecting is "not done yet"). See docs/node-graph-model.md §5.
const isManualRow = (row: ModSubmissionRow) => row.leaves.some((l) => l.kind === "MANUAL");

export function ReviewQueue({ slug }: { slug: string }) {
  const { data, isLoading } = useModSubmissions(slug);
  const review = useReviewSubmission(slug);
  const adjust = useCreatePointAdjustment(slug);
  const submissions = data?.submissions ?? [];

  const [filter, setFilter] = useState<Filter>("pending");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [adjustOpenFor, setAdjustOpenFor] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const allTeams = [...new Set(submissions.map((s) => s.team.name))].sort();
  const byStatus = filter === "all" ? submissions : submissions.filter((s) => s.submission.status === filter);
  const counts: Record<Filter, number> = {
    pending: submissions.filter((s) => s.submission.status === "pending").length,
    approved: submissions.filter((s) => s.submission.status === "approved").length,
    rejected: submissions.filter((s) => s.submission.status === "rejected").length,
    all: submissions.length,
  };
  const byTeam = teamFilter ? byStatus.filter((s) => s.team.name === teamFilter) : byStatus;
  const visible = filter === "pending" ? [...byTeam].reverse() : byTeam;

  async function submitReview(row: ModSubmissionRow, action: "approve" | "reject") {
    setError(null);
    try {
      await review.mutateAsync({ submissionId: row.submission.id, action, reviewerNotes: notes[row.submission.id] || undefined });
      setExpandedId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Review failed");
    }
  }

  async function submitAdjustment(teamId: string) {
    const amount = Number(adjustAmount);
    if (!amount || !adjustReason.trim()) return;
    setError(null);
    try {
      await adjust.mutateAsync({ teamId, amount, reason: adjustReason.trim() });
      setAdjustOpenFor(null);
      setAdjustAmount("");
      setAdjustReason("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Adjustment failed");
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="flex gap-1 px-6 pt-4 pb-2 shrink-0 overflow-x-auto">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`shrink-0 text-sm font-medium rounded-full px-3 py-1 transition-colors cursor-pointer ${
              filter === key ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className={`ml-1.5 text-xs rounded-full px-1.5 ${filter === key ? "bg-indigo-500 text-white" : "bg-slate-600 text-slate-300"}`}>{counts[key]}</span>
            )}
          </button>
        ))}
      </div>

      {allTeams.length > 0 && (
        <div className="flex gap-1 px-6 pb-3 shrink-0 overflow-x-auto">
          <button
            onClick={() => setTeamFilter(null)}
            className={`shrink-0 text-xs font-medium rounded-full px-3 py-1 transition-colors cursor-pointer ${
              teamFilter === null ? "bg-slate-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
            }`}
          >
            All teams
          </button>
          {allTeams.map((team) => (
            <button
              key={team}
              onClick={() => setTeamFilter(teamFilter === team ? null : team)}
              className={`shrink-0 text-xs font-medium rounded-full px-3 py-1 transition-colors cursor-pointer ${
                teamFilter === team ? "bg-slate-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
              }`}
            >
              {team}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="text-4xl text-slate-600">✓</div>
            <p className="text-slate-400">Nothing here</p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {visible.map((row) => {
              const thumb = row.screenshots[0]?.storageUrl;
              const isExpanded = expandedId === row.submission.id;
              const canReview = row.submission.status === "pending";
              const isManual = isManualRow(row);

              return (
                <div key={row.submission.id} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                  <div
                    className={`flex items-start gap-4 px-4 py-3 ${canReview ? "cursor-pointer hover:bg-slate-700/40 transition-colors" : ""}`}
                    onClick={() => canReview && setExpandedId(isExpanded ? null : row.submission.id)}
                  >
                    {thumb ? (
                      <a href={thumb} target="_blank" rel="noreferrer" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <img src={thumb} alt="screenshot" className="w-14 h-14 object-cover rounded border border-slate-600 hover:border-indigo-400 transition-colors" />
                      </a>
                    ) : (
                      <div className="w-14 h-14 rounded border border-slate-700 bg-slate-900/50 shrink-0 flex items-center justify-center text-slate-600 text-xs">—</div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-white text-sm font-semibold">{row.tile.name}</span>
                        {row.leaves.map((leaf) => (
                          <span key={leaf.id} className="text-xs text-slate-500 bg-slate-700 rounded-full px-2 py-0.5">{leaf.label ?? "Item"}</span>
                        ))}
                        <span className="text-xs text-slate-500 bg-slate-700 rounded-full px-2 py-0.5">{row.team.name}</span>
                        {isManual && (
                          <span className="text-xs font-semibold border rounded-full px-2 py-0.5 bg-purple-900/50 text-purple-300 border-purple-700">manual</span>
                        )}
                        {row.claims.some((c) => c.wildcardId !== null) && (
                          <span className="text-xs font-semibold border rounded-full px-2 py-0.5 bg-amber-900/50 text-amber-300 border-amber-700">✦ wildcard</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-300 truncate">
                        {claimsSummary(row.claims)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">by {row.submittedByUser ? displayName(row.submittedByUser) : "unknown"}</p>
                      {row.submission.reviewerNotes && <p className="text-xs text-amber-400 mt-0.5 truncate">{row.submission.reviewerNotes}</p>}
                    </div>

                    <div className="shrink-0 text-right flex flex-col items-end gap-1">
                      <SubmissionStatusBadge status={row.submission.status} />
                      <span className="text-xs text-slate-500">{timeAgo(row.submission.submittedAt)}</span>
                      {canReview && <span className="text-xs text-slate-500">{isExpanded ? "▲" : "▼"}</span>}
                    </div>
                  </div>

                  {isExpanded && canReview && (
                    <div className="border-t border-slate-700 px-4 py-4 bg-slate-900/50 space-y-3" onClick={(e) => e.stopPropagation()}>
                      {row.screenshots.length > 0 && (
                        <div className="space-y-2">
                          {row.screenshots.map((ss) => (
                            <a key={ss.id} href={ss.storageUrl} target="_blank" rel="noreferrer" title="Open full size in new tab">
                              <img src={ss.storageUrl} alt={ss.screenshotType} className="w-full max-h-[60vh] object-contain rounded-lg bg-black border border-slate-700 hover:border-indigo-400 transition-colors" />
                            </a>
                          ))}
                        </div>
                      )}

                      {isManual && (
                        <p className="text-xs text-purple-300 bg-purple-900/30 border border-purple-700 rounded px-3 py-2">
                          Approving completes this immediately and awards its points — reject instead if the mod judges it isn't done.
                        </p>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Notes (optional)</label>
                        <textarea
                          value={notes[row.submission.id] ?? ""}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [row.submission.id]: e.target.value }))}
                          placeholder="Visible to the submitting player…"
                          rows={2}
                          className="w-full bg-slate-800 border border-slate-600 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                        />
                      </div>

                      {error && <p className="text-red-400 text-sm">{error}</p>}

                      <div className="flex gap-2">
                        <button
                          onClick={() => submitReview(row, "approve")}
                          disabled={review.isPending}
                          className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          {review.isPending ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => submitReview(row, "reject")}
                          disabled={review.isPending}
                          className="flex-1 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          Reject
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-700">
                        {adjustOpenFor === row.submission.id ? (
                          <div className="flex items-end gap-2 flex-wrap">
                            <div>
                              <label className="block text-xs text-slate-400 mb-1">Points +/-</label>
                              <input
                                type="number"
                                value={adjustAmount}
                                onChange={(e) => setAdjustAmount(e.target.value)}
                                className="w-24 bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="flex-1 min-w-32">
                              <label className="block text-xs text-slate-400 mb-1">Reason</label>
                              <input
                                value={adjustReason}
                                onChange={(e) => setAdjustReason(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <button
                              onClick={() => submitAdjustment(row.team.id)}
                              disabled={adjust.isPending}
                              className="text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded px-2.5 py-1.5 cursor-pointer"
                            >
                              Apply
                            </button>
                            <button onClick={() => setAdjustOpenFor(null)} className="text-xs text-slate-400 hover:text-white cursor-pointer px-1">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setAdjustOpenFor(row.submission.id)} className="text-xs text-slate-400 hover:text-white cursor-pointer">
                            Adjust {row.team.name}'s points…
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
