import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ModSubmission } from "../types";
import { useWebSocket } from "../hooks/useWebSocket";

const STATUS_STYLE: Record<
  ModSubmission["status"],
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

const BADGE_DOT: Record<string, string> = {
  demonic: "bg-red-500",
  draconic: "bg-emerald-500",
  spectral: "bg-purple-500",
  animalistic: "bg-orange-500",
  god_wars: "bg-yellow-500",
  vampyric: "bg-rose-500",
  desert: "bg-amber-500",
};

type Filter = "pending" | "approved" | "rejected" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface ReviewForm {
  points: string;
  notes: string;
}

export function ModPanel() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<ModSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, ReviewForm>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/mod/submissions")
      .then((r) => r.json())
      .then((d) => setSubmissions(d.submissions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  useWebSocket(
    useCallback(
      (msg) => {
        if (
          msg.type === "submission_created" ||
          msg.type === "submission_reviewed"
        ) {
          load();
        }
      },
      [load],
    ),
  );

  // Sorted unique team names derived from loaded submissions
  const allTeams = [...new Set(submissions.map((s) => s.teamName))].sort();

  const byStatus =
    filter === "all"
      ? submissions
      : submissions.filter((s) => s.status === filter);

  const counts: Record<Filter, number> = {
    pending: submissions.filter((s) => s.status === "pending").length,
    approved: submissions.filter((s) => s.status === "approved").length,
    rejected: submissions.filter((s) => s.status === "rejected").length,
    all: submissions.length,
  };

  const byTeam = teamFilter
    ? byStatus.filter((s) => s.teamName === teamFilter)
    : byStatus;
  // Pending uses FIFO (oldest first); all other views keep newest-first from the server
  const visible = filter === "pending" ? [...byTeam].reverse() : byTeam;

  function getForm(sub: ModSubmission): ReviewForm {
    return forms[sub.id] ?? { points: String(sub.sidePoints), notes: "" };
  }

  function setForm(id: string, patch: Partial<ReviewForm>) {
    setForms((prev) => ({
      ...prev,
      [id]: {
        ...getForm(submissions.find((s) => s.id === id)!),
        ...prev[id],
        ...patch,
      },
    }));
  }

  async function submitReview(
    sub: ModSubmission,
    action: "approve" | "reject",
  ) {
    const form = getForm(sub);
    setSubmitting(sub.id);
    setError(null);
    try {
      const r = await fetch(`/api/mod/submissions/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          pointsAwarded: action === "approve" ? Number(form.points) : undefined,
          reviewerNotes: form.notes || undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error ?? "Review failed");
      }
      setExpandedId(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <span className="font-bold text-lg tracking-tight text-white">
          Mod Panel
        </span>
        <button
          onClick={() => navigate("/")}
          className="text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 text-sm transition-colors cursor-pointer"
        >
          Back to board
        </button>
      </header>
      <div className="w-full flex flex-col items-center">
        <div className="w-full max-w-6xl">
          {/* Status filter tabs */}
          <div className="flex gap-1 px-6 pt-4 pb-2 shrink-0 overflow-x-auto">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`shrink-0 text-sm font-medium rounded-full px-3 py-1 transition-colors cursor-pointer ${
                  filter === key
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {label}
                {counts[key] > 0 && (
                  <span
                    className={`ml-1.5 text-xs rounded-full px-1.5 ${
                      filter === key
                        ? "bg-indigo-500 text-white"
                        : "bg-slate-600 text-slate-300"
                    }`}
                  >
                    {counts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Team filter tabs */}
          {allTeams.length > 0 && (
            <div className="flex gap-1 px-6 pb-3 shrink-0 overflow-x-auto">
              <button
                onClick={() => setTeamFilter(null)}
                className={`shrink-0 text-xs font-medium rounded-full px-3 py-1 transition-colors cursor-pointer ${
                  teamFilter === null
                    ? "bg-slate-500 text-white"
                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                }`}
              >
                All teams
              </button>
              {allTeams.map((team) => (
                <button
                  key={team}
                  onClick={() =>
                    setTeamFilter(teamFilter === team ? null : team)
                  }
                  className={`shrink-0 text-xs font-medium rounded-full px-3 py-1 transition-colors cursor-pointer ${
                    teamFilter === team
                      ? "bg-slate-500 text-white"
                      : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                  }`}
                >
                  {team}
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                Loading…
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <div className="text-4xl text-slate-600">✓</div>
                <p className="text-slate-400">Nothing here</p>
              </div>
            ) : (
              <div className="space-y-2 mt-2">
                {visible.map((sub) => {
                  const { label, cls } = STATUS_STYLE[sub.status];
                  const thumb = sub.screenshots[0]?.url;
                  const isExpanded = expandedId === sub.id;
                  const canReview = sub.status === "pending";
                  const form = getForm(sub);

                  return (
                    <div
                      key={sub.id}
                      className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden"
                    >
                      {/* Row */}
                      <div
                        className={`flex items-start gap-4 px-4 py-3 ${canReview ? "cursor-pointer hover:bg-slate-700/40 transition-colors" : ""}`}
                        onClick={() =>
                          canReview && setExpandedId(isExpanded ? null : sub.id)
                        }
                      >
                        {/* Thumbnail */}
                        {thumb ? (
                          <a
                            href={thumb}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <img
                              src={thumb}
                              alt="screenshot"
                              className="w-14 h-14 object-cover rounded border border-slate-600 hover:border-indigo-400 transition-colors"
                            />
                          </a>
                        ) : (
                          <div className="w-14 h-14 rounded border border-slate-700 bg-slate-900/50 shrink-0 flex items-center justify-center text-slate-600 text-xs">
                            —
                          </div>
                        )}

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span
                              className={`inline-block w-2 h-2 rounded-full shrink-0 ${BADGE_DOT[sub.badgeCategory] ?? "bg-slate-500"}`}
                            />
                            <span className="text-white text-sm font-semibold">
                              {sub.tileName}
                            </span>
                            <span className="text-xs text-slate-500 bg-slate-700 rounded-full px-2 py-0.5">
                              Part {sub.side}
                            </span>
                            <span className="text-xs text-slate-500 bg-slate-700 rounded-full px-2 py-0.5">
                              {sub.teamName}
                            </span>
                            {sub.codewordVerified === true && (
                              <span className="text-xs font-semibold border rounded-full px-2 py-0.5 bg-green-900/50 text-green-300 border-green-700">
                                ✓ codeword
                              </span>
                            )}
                            {sub.codewordVerified === false && (
                              <span className="text-xs font-semibold border rounded-full px-2 py-0.5 bg-red-900/50 text-red-300 border-red-700">
                                ✗ codeword
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-300 truncate">
                            {sub.items
                              .map((i) =>
                                i.targetQuantity > 1
                                  ? `${i.quantity}× ${i.itemName}`
                                  : i.itemName,
                              )
                              .join(", ")}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            by {sub.submittedBy}
                          </p>
                          {sub.reviewerNotes && (
                            <p className="text-xs text-amber-400 mt-0.5 truncate">
                              {sub.reviewerNotes}
                            </p>
                          )}
                        </div>

                        {/* Status + time + expand hint */}
                        <div className="shrink-0 text-right flex flex-col items-end gap-1">
                          <span
                            className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${cls}`}
                          >
                            {label}
                          </span>
                          {sub.status === "approved" &&
                            sub.pointsAwarded != null && (
                              <span className="text-xs text-yellow-400 font-semibold">
                                {sub.pointsAwarded} pts
                              </span>
                            )}
                          <span className="text-xs text-slate-500">
                            {timeAgo(sub.submittedAt)}
                          </span>
                          {canReview && (
                            <span className="text-xs text-slate-500">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Review form (expanded) */}
                      {isExpanded && canReview && (
                        <div
                          className="border-t border-slate-700 px-4 py-4 bg-slate-900/50 space-y-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Screenshots — full width for inspection */}
                          {sub.screenshots.length > 0 && (
                            <div className="space-y-2">
                              {sub.screenshots.map((ss, i) => (
                                <a
                                  key={i}
                                  href={ss.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Open full size in new tab"
                                >
                                  <img
                                    src={ss.url}
                                    alt={ss.type}
                                    className="w-full max-h-[60vh] object-contain rounded-lg bg-black border border-slate-700 hover:border-indigo-400 transition-colors"
                                  />
                                </a>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-3">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-slate-400 mb-1">
                                Points to award
                                <span className="text-slate-600 ml-1">
                                  (max {sub.sidePoints})
                                </span>
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={sub.sidePoints}
                                value={form.points}
                                onChange={(e) =>
                                  setForm(sub.id, { points: e.target.value })
                                }
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">
                              Notes (optional)
                            </label>
                            <textarea
                              value={form.notes}
                              onChange={(e) =>
                                setForm(sub.id, { notes: e.target.value })
                              }
                              placeholder="Visible to the submitting player…"
                              rows={2}
                              className="w-full bg-slate-800 border border-slate-600 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                            />
                          </div>

                          {error && submitting === sub.id && (
                            <p className="text-red-400 text-sm">{error}</p>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => submitReview(sub, "approve")}
                              disabled={submitting === sub.id}
                              className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              {submitting === sub.id ? "…" : "Approve"}
                            </button>
                            <button
                              onClick={() => submitReview(sub, "reject")}
                              disabled={submitting === sub.id}
                              className="flex-1 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              Reject
                            </button>
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
      </div>
    </div>
  );
}
