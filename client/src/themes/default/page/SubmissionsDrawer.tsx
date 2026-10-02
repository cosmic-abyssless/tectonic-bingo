import { SCREENSHOT_NOT_UPLOADED } from "@bingo/shared";
import { useBingoPage } from "../../../headless";
import type { SubmissionModel } from "../../../headless/types";
import { ReactionBar } from "../../../core/submissions/ReactionBar";
import { Dialog, DialogHeader } from "../../../core/ui/Dialog";
import { Button } from "../../../core/ui/Button";
import { Badge, EmptyState } from "../../../core/ui/Card";
import { MultiSelect } from "../../../core/ui/MultiSelect";
import { ImageIcon } from "../../../core/ui/icons";
import { SubmissionStatusBadge } from "../../../core/ui/StatusBadge";
import { ScreenshotThumb } from "../../../core/submissions/ScreenshotThumb";
import { PlayerName } from "../../../core/tectonic/PlayerName";
import { displayName } from "../../../core/ui/user";
import { LinkedClaimsSummary } from "../../../core/submissions/LinkedClaimsSummary";
import { useTeamSubmissionsFilter } from "../../../core/submissions/useTeamSubmissionsFilter";

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
  const { statusOptions, statuses, setStatuses, playerOptions, players, setPlayers, showPlayers, shown, drawn, emptyText } = useTeamSubmissionsFilter(submissions, isOpen);

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
          <MultiSelect label="Status" options={statusOptions} selected={statuses} onChange={setStatuses} />
          {showPlayers && <MultiSelect label="Player" options={playerOptions} selected={players} onChange={setPlayers} />}
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
          <p className="p-5 text-sm text-on-surface-subtle">{emptyText}</p>
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
