import type { SubmissionDetails } from "@bingo/shared";
import { SubmissionStatusBadge } from "../ui/StatusBadge";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { claimsSummary } from "./claimsSummary";
import { ScreenshotThumb } from "./ScreenshotThumb";

export function SubmissionRow({ detail }: { detail: SubmissionDetails }) {
  const { submission, screenshots, claims, submittedByUser, postedByUser } = detail;

  return (
    <div className="flex items-start gap-3 border-b border-outline py-2.5 last:border-0">
      <ScreenshotThumb url={screenshots[0]?.storageUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <SubmissionStatusBadge status={submission.status} />
          <span className="text-xs text-on-surface-subtle">{timeAgo(submission.submittedAt)}</span>
        </div>
        <p className="truncate text-sm text-on-surface">{claimsSummary(claims)}</p>
        {submittedByUser && (
          <p className="mt-0.5 text-xs text-on-surface-subtle">
            by <PlayerName userId={submittedByUser.id}>{displayName(submittedByUser)}</PlayerName>
            {postedByUser && <> (posted by <PlayerName userId={postedByUser.id}>{displayName(postedByUser)}</PlayerName>)</>}
          </p>
        )}
        {submission.reviewerNotes && <p className="mt-0.5 truncate text-xs text-warn">{submission.reviewerNotes}</p>}
      </div>
    </div>
  );
}
