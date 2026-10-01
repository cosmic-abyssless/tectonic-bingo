import { useEffect, useRef, useState } from "react";
import type { ModSubmissionRow, SubmissionScreenshot, SubmissionStatus } from "@bingo/shared";
import { useBingo, useChangeSubmissionAttribution, useCreatePointAdjustment, useModSubmissions, useReviewSubmission } from "../../api/queries";
import { SubmissionStatusBadge } from "../ui/StatusBadge";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { Button } from "../ui/Button";
import { Badge, Card, EmptyState, Notice } from "../ui/Card";
import { Field, Input, Textarea } from "../ui/Field";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "../ui/icons";
import { SearchableSelect } from "../ui/SearchableSelect";
import { MultiSelect } from "../ui/MultiSelect";
import { inclusionFilter } from "../ui/inclusionFilter";
import { useUrlSet } from "../ui/useUrlParam";
import { ScreenshotLink, ScreenshotThumb } from "../submissions/ScreenshotThumb";
import { claimsGpBreakdown, claimsGpValue } from "../submissions/claimsSummary";
import { LinkedClaimsSummary } from "../submissions/LinkedClaimsSummary";
import { formatGp } from "../ui/gp";
import { RepriceGpButton } from "./RepriceGpButton";
import { fullUrl } from "../../api/imageVariants";
import { ProofChecks, ProofFlagBadges } from "./ProofChecks";
import { TooltipSpan } from "../ui/Tooltip";
import { filterSubmissions, page, PAGE_SIZE, reviewerOptions, shownToInclude, submitterOptions } from "./reviewQueueFilters";

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-outline bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-on-surface-subtle shadow-xs">
      {children}
    </kbd>
  );
}

// Both filters are checklists now (issue #121) — status used to be buttons, but "commonly-used-view" only really
// meant Pending, which the default (selectedStatuses below) still lands on directly. Team was one button per
// team, unbounded. inclusionFilter is AuditLog.tsx's own pattern for this same shape of checklist filter (nothing
// ticked = Any, so a newly appearing team is included until something's picked) — reused here rather than
// reinvented.
const STATUS_OPTIONS: { key: SubmissionStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

// A MANUAL leaf has no separate completion decision — approving its claim IS
// the decision (rejecting is "not done yet"). See docs/node-graph-model.md §5.
/** The Submissions filters' params (#389): `?status=pending,approved&teams=<id>,<id>`. */
export const SUBMISSION_FILTER_PARAMS = ["status", "teams", "submitters", "reviewers"] as const;
const DEFAULT_STATUSES = ["pending"];

const isManualRow = (row: ModSubmissionRow) => row.leaves.some((l) => l.kind === "MANUAL");
// A Proof screenshot (CONTEXT.md): no claims, so no item to match or drop value to show.
const isProofRow = (row: ModSubmissionRow) => row.submission.kind === "proof";

// Shared between the collapsed row and the expanded review view — see
// submissionService.recordScreenshotAnalysis for where these get populated.
// A proof screenshot shows no drop, so only the codeword matters on it.
function ScreenshotAnalysisBadges({ screenshot }: { screenshot: SubmissionScreenshot }) {
  if (screenshot.scrapeStatus === "completed") {
    return (
      <>
        <Badge tone={screenshot.codewordVerified ? "ok" : "warn"}>
          {screenshot.codewordVerified ? "Codeword found" : "Codeword not found"}
        </Badge>
        {screenshot.screenshotType !== "proof" && (
          <Badge tone={screenshot.detectedItemName ? "ok" : "neutral"}>
            {screenshot.detectedItemName ? `Item detected: ${screenshot.detectedItemName}` : "No item detected"}
          </Badge>
        )}
      </>
    );
  }
  if (screenshot.scrapeStatus === "pending" || screenshot.scrapeStatus === "processing") {
    return <span className="text-xs text-on-surface-subtle">Analyzing screenshot…</span>;
  }
  return null;
}

const REVEAL_MARGIN = 12;

/**
 * Scrolls just far enough that a submission's first screenshot and its Approve / Reject buttons are on screen
 * together, below the sticky header. If they can't both fit, the screenshot's top wins.
 */
function revealReview(submissionId: string) {
  const first = document.getElementById(`review-shots-${submissionId}`);
  const actions = document.getElementById(`review-actions-${submissionId}`);
  if (!first || !actions) return;
  const top = (document.querySelector("header")?.getBoundingClientRect().height ?? 0) + REVEAL_MARGIN;
  const bottom = window.innerHeight - REVEAL_MARGIN;
  const start = first.getBoundingClientRect().top;
  const end = actions.getBoundingClientRect().bottom;
  let delta = 0;
  if (end - start > bottom - top || start < top) delta = start - top;
  else if (end > bottom) delta = end - bottom;
  if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: "smooth" });
}

export function ReviewQueue({ slug }: { slug: string }) {
  const { data, isLoading } = useModSubmissions(slug);
  const review = useReviewSubmission(slug);
  const adjust = useCreatePointAdjustment(slug);
  const changeAttribution = useChangeSubmissionAttribution(slug);
  const { data: shell } = useBingo(slug);
  const submissions = data?.submissions ?? [];

  // Nothing ticked is Any. Status starts on Pending so the view still lands on "Pending only" by default, same as
  // before; Team, Submitter and Reviewer start on Any. All four are in the URL, so a link opens the queue filtered the
  // same way.
  const [selectedStatuses, setSelectedStatuses] = useUrlSet("status", DEFAULT_STATUSES);
  const [selectedTeams, setSelectedTeams] = useUrlSet("teams");
  const [selectedSubmitters, setSelectedSubmitters] = useUrlSet("submitters");
  const [selectedReviewers, setSelectedReviewers] = useUrlSet("reviewers");
  // How many of the filtered list are drawn (issue #383): a Bingo has 1,000+ Submissions, and drawing every one is
  // what's slow, so Load more adds a page at a time. Changing a filter goes back to the first page.
  const [shown, setShown] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [adjustOpenFor, setAdjustOpenFor] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  // Changing who a submission is credited to: which one is being edited, the player picked, and any refusal.
  const [creditFor, setCreditFor] = useState<string | null>(null);
  const [creditUserId, setCreditUserId] = useState("");
  const [creditError, setCreditError] = useState<string | null>(null);
  // A screenshot's height isn't known until it loads, so a load shortly after opening a submission reveals again.
  const revealUntil = useRef(0);

  useEffect(() => {
    if (!expandedId) return;
    revealUntil.current = Date.now() + 2000;
    const frame = requestAnimationFrame(() => revealReview(expandedId));
    return () => cancelAnimationFrame(frame);
  }, [expandedId]);

  // By id, so a link survives a Team being renamed.
  const allTeams = [...new Map(submissions.map((s) => [s.team.id, s.team.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const teamOptions = allTeams.map(([key, label]) => ({ key, label }));
  const statusCounts: Record<SubmissionStatus, number> = {
    pending: submissions.filter((s) => s.submission.status === "pending").length,
    approved: submissions.filter((s) => s.submission.status === "approved").length,
    rejected: submissions.filter((s) => s.submission.status === "rejected").length,
  };
  const submitterChoices = submitterOptions(submissions);
  const reviewerChoices = reviewerOptions(submissions);
  const statuses = inclusionFilter(selectedStatuses, STATUS_OPTIONS);
  const teams = inclusionFilter(selectedTeams, teamOptions);
  const submitters = inclusionFilter(selectedSubmitters, submitterChoices);
  const reviewers = inclusionFilter(selectedReviewers, reviewerChoices);
  const filtered = filterSubmissions(submissions, { status: statuses, team: teams, submitter: submitters, reviewer: reviewers });
  // "Pending only" (the default) reads newest-first; any other mix of statuses reads however the server ordered
  // them, same as before.
  const onlyPending = statuses.checked.length === 1 && statuses.checked[0] === "pending";
  const visible = onlyPending ? [...filtered].reverse() : filtered;
  const drawn = page(visible, shown);

  // Picking a filter starts its list from the top.
  function setFilter(set: (keys: Set<string>) => void) {
    return (keys: string[]) => {
      set(new Set(keys));
      setShown(PAGE_SIZE);
    };
  }

  // Opening a row (the keyboard can reach past the drawn ones) draws enough pages to show it.
  function expand(id: string) {
    setShown((n) => shownToInclude(visible.findIndex((r) => r.submission.id === id), n));
    setExpandedId(id);
  }

  async function submitReview(row: ModSubmissionRow, action: "approve" | "reject") {
    setError(null);
    try {
      await review.mutateAsync({ submissionId: row.submission.id, action, reviewerNotes: notes[row.submission.id] || undefined });
      setExpandedId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Review failed");
    }
  }

  // Sends an approved/rejected submission back to pending; the server
  // recomputes the team's points if it had been approved.
  async function undoReview(row: ModSubmissionRow) {
    setError(null);
    try {
      await review.mutateAsync({ submissionId: row.submission.id, action: "undo" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Undo failed");
    }
  }

  async function saveCredit(row: ModSubmissionRow) {
    if (!creditUserId) return;
    setCreditError(null);
    try {
      await changeAttribution.mutateAsync({ submissionId: row.submission.id, userId: creditUserId });
      setCreditFor(null);
    } catch (e: unknown) {
      setCreditError(e instanceof Error ? e.message : "Couldn't change the player");
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

  // Keyboard navigation & shortcuts for reviewing submissions
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        const pendingRows = visible.filter((r) => r.submission.status === "pending");
        if (pendingRows.length === 0) return;
        const currIndex = pendingRows.findIndex((r) => r.submission.id === expandedId);
        const next = currIndex === -1 || currIndex >= pendingRows.length - 1 ? pendingRows[0] : pendingRows[currIndex + 1];
        expand(next.submission.id);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        const pendingRows = visible.filter((r) => r.submission.status === "pending");
        if (pendingRows.length === 0) return;
        const currIndex = pendingRows.findIndex((r) => r.submission.id === expandedId);
        const prev = currIndex <= 0 ? pendingRows[pendingRows.length - 1] : pendingRows[currIndex - 1];
        expand(prev.submission.id);
      } else if (e.key === "a" || e.key === "A") {
        if (!expandedId) return;
        const curr = visible.find((r) => r.submission.id === expandedId && r.submission.status === "pending");
        if (curr && !review.isPending) {
          e.preventDefault();
          submitReview(curr, "approve");
        }
      } else if (e.key === "r" || e.key === "R") {
        if (!expandedId) return;
        const curr = visible.find((r) => r.submission.id === expandedId && r.submission.status === "pending");
        if (curr) {
          e.preventDefault();
          const textarea = document.getElementById(`notes-${curr.submission.id}`);
          if (textarea) textarea.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedId, visible, review.isPending, notes]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            label="Status"
            options={STATUS_OPTIONS.map((o) => ({ ...o, count: statusCounts[o.key] }))}
            selected={statuses.checked}
            onChange={setFilter(setSelectedStatuses)}
          />
          {allTeams.length > 0 && (
            <MultiSelect
              label="Team"
              options={teamOptions}
              selected={teams.checked}
              onChange={setFilter(setSelectedTeams)}
            />
          )}
          {submitterChoices.length > 0 && (
            <MultiSelect label="Submitter" options={submitterChoices} selected={submitters.checked} onChange={setFilter(setSelectedSubmitters)} />
          )}
          {reviewerChoices.length > 0 && (
            <MultiSelect label="Reviewer" options={reviewerChoices} selected={reviewers.checked} onChange={setFilter(setSelectedReviewers)} />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-on-surface-subtle">
          <span className="flex items-center gap-1">
            <KeyCap>↑</KeyCap><KeyCap>↓</KeyCap> or <KeyCap>J</KeyCap><KeyCap>K</KeyCap> Navigate
          </span>
          <span className="flex items-center gap-1">
            <KeyCap>A</KeyCap> Approve
          </span>
          <span className="flex items-center gap-1">
            <KeyCap>R</KeyCap> Reject
          </span>
        </div>
      </div>

      {error && expandedId === null && <Notice tone="danger">{error}</Notice>}

      {isLoading ? (
        <p className="py-20 text-center text-sm text-on-surface-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState icon={<CheckIcon />} title="Nothing to review">
          {onlyPending && !teams.narrowed && !submitters.narrowed && !reviewers.narrowed ? "New submissions show up here as they come in." : "No submissions match this filter."}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {drawn.rows.map((row) => {
            const isExpanded = expandedId === row.submission.id;
            const canReview = row.submission.status === "pending";
            const isManual = isManualRow(row);
            const isProof = isProofRow(row);

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
                      <span className="text-sm font-semibold text-on-surface">
                        {isProof ? `Proof screenshot · ${row.tile.name}${row.submittedByUser ? ` · ${displayName(row.submittedByUser)}` : ""}` : row.tile.name}
                      </span>
                      {row.proofTaskLabel && <Badge>{row.proofTaskLabel}</Badge>}
                      {row.leaves.map((leaf) => (
                        <Badge key={leaf.id}>{leaf.label ?? "Item"}</Badge>
                      ))}
                      <Badge>{row.team.name}</Badge>
                      {isManual && <Badge tone="info">manual</Badge>}
                      {isProof && <Badge tone="info">starting state</Badge>}
                      <ProofFlagBadges checks={row.proofChecks ?? []} />
                    </div>
                    <p className="truncate text-sm text-on-surface-muted">
                      <LinkedClaimsSummary claims={row.claims} isProof={isProof} />
                      {row.claims.some((c) => c.itemName !== null) && (
                        <>
                          {" · "}
                          <TooltipSpan
                            text={claimsGpBreakdown(row.claims, formatGp, new Map(row.leaves.flatMap((l) => (l.valuedAs ? [[l.id, l.valuedAs] as const] : []))))}
                            label={claimsGpValue(row.claims) === null ? "No drop value" : `${formatGp(claimsGpValue(row.claims))} GP`}
                            className="num"
                          >
                            {claimsGpValue(row.claims) === null ? "— drop value" : `${formatGp(claimsGpValue(row.claims))} GP`}
                          </TooltipSpan>{" "}
                          <RepriceGpButton slug={slug} submissionId={row.submission.id} />
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-on-surface-subtle">by {row.submittedByUser ? <PlayerName userId={row.submittedByUser.id}>{displayName(row.submittedByUser)}</PlayerName> : "unknown"}
                      {row.postedByUser && <> (posted by <PlayerName userId={row.postedByUser.id}>{displayName(row.postedByUser)}</PlayerName>)</>}
                      {creditFor !== row.submission.id && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="underline-offset-2 hover:text-on-surface hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreditFor(row.submission.id);
                              setCreditUserId("");
                              setCreditError(null);
                            }}
                          >
                            Change player
                          </button>
                        </>
                      )}

                    </p>
                    {creditFor === row.submission.id && (
                      <div className="mt-2 max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
                        <Field label={`Credit this submission to (a player on ${row.team.name})`}>
                          <SearchableSelect
                            value={creditUserId}
                            options={(shell?.teams.find((t) => t.id === row.team.id)?.members ?? [])
                              .filter((m) => m.user.id !== row.submission.submittedByUserId)
                              .map((m) => ({ id: m.user.id, label: displayName(m.user) }))
                              .sort((a, b) => a.label.localeCompare(b.label))}
                            placeholder="Search players…"
                            onChange={setCreditUserId}
                          />
                        </Field>
                        {creditError && <p className="text-xs text-danger">{creditError}</p>}
                        <div className="flex gap-2">
                          <Button size="sm" variant="primary" onPress={() => saveCredit(row)} isDisabled={!creditUserId || changeAttribution.isPending}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onPress={() => setCreditFor(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                    {row.screenshots[0] && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <ScreenshotAnalysisBadges screenshot={row.screenshots[0]} />
                      </div>
                    )}
                    {row.submission.reviewerNotes && <p className="mt-0.5 truncate text-xs text-warn">{row.submission.reviewerNotes}</p>}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <SubmissionStatusBadge status={row.submission.status} />
                    <span className="text-xs text-on-surface-subtle">{timeAgo(row.submission.submittedAt)}</span>
                    {canReview && <span className="text-on-surface-subtle">{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>}
                    {!canReview && (
                      <Button variant="ghost" size="sm" onPress={() => undoReview(row)} isDisabled={review.isPending}>
                        Undo review
                      </Button>
                    )}
                  </div>
                </div>

                {isExpanded && canReview && (
                  <div className="space-y-3 border-t border-outline bg-background px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    {row.screenshots.map((ss, i) => (
                      <div key={ss.id} id={i === 0 ? `review-shots-${row.submission.id}` : undefined}>
                        <ScreenshotLink href={ss.storageUrl} tooltip="Open full size in new tab" className="block">
                          <img
                            src={fullUrl(ss.storageUrl)}
                            alt={ss.screenshotType}
                            // Leaves room for the header, the notes and the buttons (and shares it between screenshots), so they fit together.
                            style={{ maxHeight: `max(12rem, calc((100dvh - 19rem) / ${row.screenshots.length}))` }}
                            onLoad={() => Date.now() < revealUntil.current && revealReview(row.submission.id)}
                            className="w-full rounded-md border border-outline bg-black object-contain transition-colors hover:border-outline-strong"
                          />
                        </ScreenshotLink>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <ScreenshotAnalysisBadges screenshot={ss} />
                        </div>
                      </div>
                    ))}

                    {isManual && (
                      <Notice tone="info">Approving completes this immediately and awards its points — reject instead if it isn't done.</Notice>
                    )}

                    {isProof && (
                      <Notice tone="info">
                        A Proof screenshot: the starting state before this player's drops on {row.proofTaskLabel ?? row.tile.name} count. It awards no points.
                      </Notice>
                    )}

                    <ProofChecks checks={row.proofChecks ?? []} dropSubmittedAt={row.submission.submittedAt} />

                    <Field label="Notes (optional)">
                      <Textarea
                        id={`notes-${row.submission.id}`}
                        value={notes[row.submission.id] ?? ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [row.submission.id]: e.target.value }))}
                        placeholder="Visible to the submitting player…"
                        rows={2}
                        className="resize-none"
                      />
                    </Field>

                    {error && <Notice tone="danger">{error}</Notice>}

                    <div id={`review-actions-${row.submission.id}`} className="flex gap-2">
                      <Button variant="primary" className="flex-1" onPress={() => submitReview(row, "approve")} isDisabled={review.isPending}>
                        <span className="flex items-center justify-center gap-1.5">
                          {review.isPending ? "…" : "Approve"}
                          <KeyCap>A</KeyCap>
                        </span>
                      </Button>
                      <Button variant="danger" className="flex-1" onPress={() => submitReview(row, "reject")} isDisabled={review.isPending}>
                        <span className="flex items-center justify-center gap-1.5">
                          Reject
                          <KeyCap>R</KeyCap>
                        </span>
                      </Button>
                    </div>

                    <div className="border-t border-outline pt-3">
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
          {drawn.remaining > 0 && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="ghost" onPress={() => setShown((n) => n + PAGE_SIZE)}>
                Load more
              </Button>
              <span className="text-xs text-on-surface-subtle">
                Showing {drawn.rows.length} of {visible.length}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
