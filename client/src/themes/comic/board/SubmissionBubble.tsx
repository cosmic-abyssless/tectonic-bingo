import type { SubmissionModel } from "../../../headless/types";
import { ImageIcon } from "../../../core/ui/icons";
import { useResolvedColorScheme } from "../../../core/ui/colorScheme";
import { COMIC_FONT } from "../font";
import { getColors } from "./colors";

const STATUS_LABEL: Record<SubmissionModel["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

// A comic-styled stand-in for the shared, cross-theme <SubmissionRow> —
// that one stacks screenshot/status/claims/author/notes into a tall column,
// tuned for dense mod-dashboard lists. Here each submission gets a whole
// chat bubble to itself, so the same info spreads wider instead: a
// thumbnail beside the claims summary, with the author/time and status
// sharing one line underneath. Which part (A/B) it's for isn't shown here —
// that's already conveyed by which page of the book the tile modal has
// open when you submit.
export function SubmissionBubble({
  submission,
}: {
  submission: SubmissionModel;
}) {
  const { INK, INK_BODY, INK_SUBTLE, GREEN, ORANGE, RED } = getColors(useResolvedColorScheme());
  const STATUS_COLOR: Record<SubmissionModel["status"], string> = {
    pending: ORANGE,
    approved: GREEN,
    rejected: RED,
  };
  const meta = submission.submittedBy
    ? `by ${submission.submittedBy} ${submission.timeAgo}`
    : submission.timeAgo;

  return (
    <div>
      <div className="flex items-center gap-3">
        {submission.thumbnailUrl ? (
          <a
            href={submission.thumbnailUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0"
            title="View screenshot"
          >
            <img
              src={submission.thumbnailUrl}
              alt="Submission screenshot"
              className="size-12 rounded-md border-2 object-cover"
              style={{ borderColor: INK }}
            />
          </a>
        ) : (
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-md border-2"
            style={{ borderColor: INK, color: INK_SUBTLE }}
            aria-hidden
          >
            <ImageIcon size={14} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm" style={{ color: INK_BODY }}>
            {submission.summary}
          </p>
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <span
              className="truncate text-[11px]"
              style={{ color: INK_SUBTLE }}
            >
              {meta}
            </span>
            <span
              className="shrink-0 text-xs uppercase"
              style={{
                fontFamily: COMIC_FONT,
                color: STATUS_COLOR[submission.status],
                letterSpacing: "0.04em",
              }}
            >
              {STATUS_LABEL[submission.status]}
            </span>
          </div>
        </div>
      </div>

      {submission.reviewerNotes && (
        <p
          className="mt-2 border-l-2 pl-2 text-xs"
          style={{ borderColor: RED, color: RED }}
        >
          {submission.reviewerNotes}
        </p>
      )}
    </div>
  );
}
