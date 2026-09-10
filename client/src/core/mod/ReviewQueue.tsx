import { useState } from "react";
import type { ModSubmissionRow, SubmissionStatus } from "@bingo/shared";
import { useCreatePointAdjustment, useModSubmissions, useReviewSubmission } from "../../api/queries";
import { SubmissionStatusBadge } from "../ui/StatusBadge";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";
import { Button } from "../ui/Button";
import { Badge, Card, EmptyState, FilterChip, Notice } from "../ui/Card";
import { Field, Input, Textarea } from "../ui/Field";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "../ui/icons";
import { ScreenshotThumb } from "../submissions/ScreenshotThumb";
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(({ key, label }) => (
          <FilterChip key={key} active={filter === key} count={counts[key]} onPress={() => setFilter(key)}>
            {label}
          </FilterChip>
        ))}
      </div>

      {allTeams.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={teamFilter === null} onPress={() => setTeamFilter(null)}>
            All teams
          </FilterChip>
          {allTeams.map((team) => (
            <FilterChip key={team} active={teamFilter === team} onPress={() => setTeamFilter(teamFilter === team ? null : team)}>
              {team}
            </FilterChip>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="py-20 text-center text-sm text-fg-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState icon={<CheckIcon />} title="Nothing to review">
          {filter === "pending" ? "New submissions show up here as they come in." : "No submissions match this filter."}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => {
            const isExpanded = expandedId === row.submission.id;
            const canReview = row.submission.status === "pending";
            const isManual = isManualRow(row);

            return (
              <Card key={row.submission.id} className="overflow-hidden">
                <div
                  className={`flex items-start gap-4 px-4 py-3 ${canReview ? "cursor-pointer transition-colors hover:bg-surface-hover" : ""}`}
                  onClick={() => canReview && setExpandedId(isExpanded ? null : row.submission.id)}
                >
                  <span onClick={(e) => e.stopPropagation()}>
                    <ScreenshotThumb url={row.screenshots[0]?.storageUrl} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-fg">{row.tile.name}</span>
                      {row.leaves.map((leaf) => (
                        <Badge key={leaf.id}>{leaf.label ?? "Item"}</Badge>
                      ))}
                      <Badge>{row.team.name}</Badge>
                      {isManual && <Badge tone="info">manual</Badge>}
                    </div>
                    <p className="truncate text-sm text-fg-muted">{claimsSummary(row.claims)}</p>
                    <p className="mt-0.5 text-xs text-fg-subtle">by {row.submittedByUser ? displayName(row.submittedByUser) : "unknown"}</p>
                    {row.submission.reviewerNotes && <p className="mt-0.5 truncate text-xs text-warn">{row.submission.reviewerNotes}</p>}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <SubmissionStatusBadge status={row.submission.status} />
                    <span className="text-xs text-fg-subtle">{timeAgo(row.submission.submittedAt)}</span>
                    {canReview && <span className="text-fg-subtle">{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>}
                  </div>
                </div>

                {isExpanded && canReview && (
                  <div className="space-y-3 border-t border-line bg-bg px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    {row.screenshots.map((ss) => (
                      <div key={ss.id}>
                        <a href={ss.storageUrl} target="_blank" rel="noreferrer" title="Open full size in new tab" className="block">
                          <img
                            src={ss.storageUrl}
                            alt={ss.screenshotType}
                            className="max-h-[60vh] w-full rounded-md border border-line bg-black object-contain transition-colors hover:border-line-strong"
                          />
                        </a>
                        {ss.scrapeStatus === "completed" ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Badge tone={ss.codewordVerified ? "ok" : "warn"}>
                              {ss.codewordVerified ? "Codeword found" : "Codeword not found"}
                            </Badge>
                            <Badge tone={ss.detectedItemName ? "ok" : "neutral"}>
                              {ss.detectedItemName ? `Item detected: ${ss.detectedItemName}` : "No item detected"}
                            </Badge>
                          </div>
                        ) : (ss.scrapeStatus === "pending" || ss.scrapeStatus === "processing") ? (
                          <p className="mt-1.5 text-xs text-fg-subtle">Analyzing screenshot…</p>
                        ) : null}
                      </div>
                    ))}

                    {isManual && (
                      <Notice tone="info">Approving completes this immediately and awards its points — reject instead if it isn't done.</Notice>
                    )}

                    <Field label="Notes (optional)">
                      <Textarea
                        value={notes[row.submission.id] ?? ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [row.submission.id]: e.target.value }))}
                        placeholder="Visible to the submitting player…"
                        rows={2}
                        className="resize-none"
                      />
                    </Field>

                    {error && <Notice tone="danger">{error}</Notice>}

                    <div className="flex gap-2">
                      <Button variant="primary" className="flex-1" onPress={() => submitReview(row, "approve")} isDisabled={review.isPending}>
                        {review.isPending ? "…" : "Approve"}
                      </Button>
                      <Button variant="danger" className="flex-1" onPress={() => submitReview(row, "reject")} isDisabled={review.isPending}>
                        Reject
                      </Button>
                    </div>

                    <div className="border-t border-line pt-3">
                      {adjustOpenFor === row.submission.id ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label="Points +/-">
                            <Input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} className="num w-24" />
                          </Field>
                          <div className="min-w-32 flex-1">
                            <Field label="Reason">
                              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
                            </Field>
                          </div>
                          <Button onPress={() => submitAdjustment(row.team.id)} isDisabled={adjust.isPending}>
                            Apply
                          </Button>
                          <Button variant="ghost" onPress={() => setAdjustOpenFor(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onPress={() => setAdjustOpenFor(row.submission.id)}>
                          Adjust {row.team.name}'s points…
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
