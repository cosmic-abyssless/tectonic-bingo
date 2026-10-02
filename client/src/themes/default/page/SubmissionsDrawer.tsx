import { useState } from "react";
import { SCREENSHOT_NOT_UPLOADED, type SubmissionStatus } from "@bingo/shared";
import { useBingoPage } from "../../../headless";
import type { SubmissionModel } from "../../../headless/types";
import { ReactionBar } from "../../../core/submissions/ReactionBar";
import { Dialog, DialogHeader } from "../../../core/ui/Dialog";
import { Button } from "../../../core/ui/Button";
import { Badge, EmptyState, FilterChip } from "../../../core/ui/Card";
import { MultiSelect } from "../../../core/ui/MultiSelect";
import { ImageIcon } from "../../../core/ui/icons";
import { SubmissionStatusBadge } from "../../../core/ui/StatusBadge";
import { ScreenshotThumb } from "../../../core/submissions/ScreenshotThumb";
import { PlayerName } from "../../../core/tectonic/PlayerName";
import { displayName } from "../../../core/ui/user";
import { LinkedClaimsSummary } from "../../../core/submissions/LinkedClaimsSummary";
import { useLoadMore } from "../../../core/ui/paging";

type Filter = SubmissionStatus | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export function SubmissionsDrawer({
  isOpen,
  submissions,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  submissions: SubmissionModel[];
  onClose: () => void;
  onSubmit?: () => void;
}) {
  const { reactions } = useBingoPage();
  const [filter, setFilter] = useState<Filter>("all");
  // None picked = everyone. Names come from the submissions themselves, so the list only ever offers people who
  // actually submitted something.
  const [picked, setPicked] = useState<string[]>([]);
  const submitters = [...new Set(submissions.flatMap((s) => (s.submittedBy ? [s.submittedBy] : [])))].sort();
  const submitterOptions = submitters.map((name) => ({ key: name, label: name, count: submissions.filter((s) => s.submittedBy === name).length }));
  const bySubmitter = picked.length > 0 ? submissions.filter((s) => s.submittedBy != null && picked.includes(s.submittedBy)) : submissions;
  const shown = filter === "all" ? bySubmitter : bySubmitter.filter((s) => s.status === filter);
  const countFor = (key: Filter) => (key === "all" ? bySubmitter.length : bySubmitter.filter((s) => s.status === key).length);
  // Drawn a page at a time, like the Mod panel's Submissions; back to the first page on a new filter or a fresh open.
  const drawn = useLoadMore(shown, `${isOpen}:${filter}:${picked.join(",")}`);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg" fixedHeight>
      <DialogHeader
        title="Team submissions"
        subtitle={`${submissions.length} submission${submissions.length !== 1 ? "s" : ""}`}
        onClose={onClose}
        action={
          onSubmit && (
            <Button variant="primary" size="sm" onPress={onSubmit}>
              Submit
            </Button>
          )
        }
      />

      {submissions.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-outline px-5 py-3">
          {FILTERS.map(({ key, label }) => (
            <FilterChip key={key} active={filter === key} count={countFor(key)} onPress={() => setFilter(key)}>
              {label}
            </FilterChip>
          ))}
          {submitters.length > 1 && (
            <div className="ml-auto">
              <MultiSelect label="Player" options={submitterOptions} selected={picked} onChange={setPicked} />
            </div>
          )}
        </div>
      )}

      {/* The one part that scrolls: the header and filters stay put, and an empty list keeps the dialog's height. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {submissions.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<ImageIcon />} title="No submissions yet">
              {onSubmit ? "Submit a completion using the Submit button in the header." : "Nothing has been submitted for this team yet."}
            </EmptyState>
          </div>
        ) : shown.length === 0 ? (
          <p className="p-5 text-sm text-on-surface-subtle">
            No {filter === "all" ? "" : `${filter} `}submissions{picked.length === 1 ? ` by ${picked[0]}` : picked.length > 1 && ` by those Players`}.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-outline">
              {drawn.rows.map((s) => (
                <li key={s.id} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-hover">
                  <ScreenshotThumb url={s.thumbnailUrl ?? undefined} pending={s.screenshotPending} />

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-on-surface">{s.tileName ?? "Unknown tile"}</span>
                      {s.taskLabels.map((label) => (
                        <Badge key={label}>{label}</Badge>
                      ))}
                    </div>
                    <p className="truncate text-sm text-on-surface-muted">
                      <LinkedClaimsSummary claims={s.detail.claims} isProof={s.isProof} />
                    </p>
                    {s.detail.submittedByUser && (
                      <p className="mt-0.5 text-xs text-on-surface-subtle">
                        by <PlayerName userId={s.detail.submittedByUser.id}>{s.submittedBy}</PlayerName>
                        {s.detail.postedByUser && <> (posted by <PlayerName userId={s.detail.postedByUser.id}>{displayName(s.detail.postedByUser)}</PlayerName>)</>}
                      </p>
                    )}
                    {s.screenshotPending && <p className="mt-0.5 text-xs italic text-on-surface-subtle">{SCREENSHOT_NOT_UPLOADED}</p>}
                    {s.reviewerNotes && <p className="mt-0.5 truncate text-xs text-warn">{s.reviewerNotes}</p>}
                    {!s.isProof && <ReactionBar className="mt-1.5" reactions={s.reactions} canReact={reactions.canReact} restricted={reactions.restricted} onToggle={(emoji) => reactions.toggle(s.id, emoji)} />}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <SubmissionStatusBadge status={s.status} />
                    <span className="text-xs text-on-surface-subtle">{s.timeAgo}</span>
                  </div>
                </li>
              ))}
            </ul>
            {drawn.remaining > 0 && (
              <div className="flex flex-col items-center gap-1 border-t border-outline py-4">
                <Button variant="ghost" onPress={drawn.more}>
                  Load more
                </Button>
                <span className="text-xs text-on-surface-subtle">
                  Showing {drawn.rows.length} of {shown.length}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
