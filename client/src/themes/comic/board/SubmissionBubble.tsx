import type { SubmissionModel } from "../../../headless/types";
import { thumbUrl } from "../../../api/imageVariants";
import { ImageIcon } from "../../../core/ui/icons";
import { PlayerName } from "../../../core/tectonic/PlayerName";
import { InkTag } from "../ui/CaptionBox";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";
import { displayName } from "../../../core/ui/user";
import { ClaimsSummary } from "../../../core/submissions/ClaimsSummary";

/**
 * A submission rendered as a postcard-ish paper card
 * with a screenshot "photo" clipped to the corner, the claim summary as the
 * body text, sender + time as the sign-off, and a rubber stamp for status.
 */
export function SubmissionBubble({ submission, showTile = false }: { submission: SubmissionModel; showTile?: boolean }) {
  const { colors } = useComic();
  const stampKind = submission.status;
  const who = submission.detail.submittedByUser;

  return (
    <article
      className="relative border-[3px] p-3 pr-4"
      style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `4px 4px 0 ${colors.LINE}`, color: colors.INK_BODY }}
    >
      <Stamp kind={stampKind} size="sm" rotate={-10} className="absolute -right-2 -top-3" />

      <div className="flex items-start gap-3">
        {submission.thumbnailUrl ? (
          <a href={submission.thumbnailUrl} target="_blank" rel="noreferrer" className="shrink-0 -rotate-3 cursor-pointer border-[3px] outline-none transition-[filter] hover:brightness-90 focus-visible:ring-2" style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, padding: 2, boxShadow: `2px 2px 0 ${colors.LINE}` }} title="View screenshot">
            <img src={thumbUrl(submission.thumbnailUrl)} alt="Submission screenshot" className="block size-14 object-cover" />
          </a>
        ) : (
          <div className="flex size-14 shrink-0 -rotate-3 items-center justify-center border-[3px]" style={{ borderColor: colors.LINE, color: colors.INK_SUBTLE, background: colors.PAPER }} aria-hidden>
            <ImageIcon size={16} />
          </div>
        )}

        <div className="min-w-0 flex-1 pr-10">
          {showTile && (
            <p className="mb-1 truncate text-xs uppercase tracking-wider" style={{ color: colors.INK_SUBTLE }}>
              {submission.tileName}
            </p>
          )}
          {submission.taskLabels.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {submission.taskLabels.map((l) => (
                <InkTag key={l} className="!text-xs">
                  {l}
                </InkTag>
              ))}
            </div>
          )}
          <p className="text-sm leading-snug" style={{ color: colors.INK }}>
            <ClaimsSummary claims={submission.detail.claims} />
          </p>
          <p className="mt-1 text-xs italic" style={{ color: colors.INK_SUBTLE }}>
            {"— "}
            {who ? <PlayerName userId={who.id}>{submission.submittedBy ?? "someone"}</PlayerName> : submission.submittedBy ?? "someone"}
            {submission.detail.postedByUser && <> (posted by {displayName(submission.detail.postedByUser)})</>}
            {", "}
            {submission.timeAgo}
          </p>
        </div>
      </div>

      {submission.reviewerNotes && (
        <p className="mt-2 border-l-[3px] pl-2 text-xs leading-relaxed" style={{ borderColor: colors.BAD, color: colors.BAD }}>
          <span className="uppercase tracking-wider">Reviewer: </span>
          {submission.reviewerNotes}
        </p>
      )}
    </article>
  );
}
