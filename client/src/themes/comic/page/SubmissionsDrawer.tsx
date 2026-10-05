import type { SubmissionModel } from "../../../headless/types";
import { MultiSelect } from "../../../core/ui/MultiSelect";
import { ComicDialog, ComicDialogHeader } from "../ui/ComicDialog";
import { ComicButton } from "../ui/ComicButton";
import { CaptionBox } from "../ui/CaptionBox";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";
import { SubmissionBubble } from "../board/SubmissionBubble";
import { COMIC_FONT } from "../font";
import { useTeamSubmissionsFilter } from "../../../core/submissions/useTeamSubmissionsFilter";
import { LETTERED } from "../../lettering";

/**
 * Submissions — every claim the team has sent in, stacked as a pile of
 * mail with rubber-stamped verdicts. Status and Player filters sit under the
 * header; the list scrolls inside the dialog.
 */
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
  const { colors } = useComic();
  const { statusOptions, statuses, setStatuses, playerOptions, players, setPlayers, showPlayers, shown, drawn, emptyText } = useTeamSubmissionsFilter(submissions, isOpen);
  const pending = submissions.filter((s) => s.status === "pending").length;

  // Pinned under the header (ComicDialogHeader's `below`), so the filters stay put while the list scrolls.
  const filters = submissions.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 border-b-[3px] px-5 py-2.5" style={{ borderColor: colors.LINE, background: colors.PAPER_ALT }}>
      <MultiSelect label="Status" options={statusOptions} selected={statuses} onChange={setStatuses} />
      {showPlayers && <MultiSelect label="Player" options={playerOptions} selected={players} onChange={setPlayers} />}
    </div>
  );

  return (
    <ComicDialog isOpen={isOpen} onClose={onClose} size="lg" fixedHeight>
      <ComicDialogHeader
        title="Submissions"
        tone="red"
        subtitle={
          submissions.length === 0
            ? "No submissions yet"
            : `${submissions.length} submission${submissions.length !== 1 ? "s" : ""}${pending ? ` · ${pending} pending review` : ""}`
        }
        onClose={onClose}
        below={filters}
        action={
          onSubmit && (
            <ComicButton
              variant="yellow"
              size="sm"
              sfx="SUBMIT!"
              onPress={() => {
                onSubmit();
              }}
            >
              Submit
            </ComicButton>
          )
        }
      />

      <div className="isolate p-5">
        {submissions.length === 0 ? (
          <EmptySubmissions hasSubmit={!!onSubmit} />
        ) : shown.length === 0 ? (
          <CaptionBox tone="paper" tilt={-0.5}>
            <p className="text-sm" style={{ color: colors.INK_BODY }}>
              {emptyText}
            </p>
          </CaptionBox>
        ) : (
          <>
            <ul className="space-y-5">
              {drawn.rows.map((s, i) => (
                // Each card is its own stacking context (the tilt). Stack earlier
                // cards above later ones so an overhanging stamp isn't covered
                // by the next card's top edge.
                <li key={s.id} className="relative" style={{ transform: `rotate(${i % 2 === 0 ? -0.5 : 0.5}deg)`, zIndex: drawn.rows.length - i }}>
                  <SubmissionBubble submission={s} showTile />
                </li>
              ))}
            </ul>
            {drawn.remaining > 0 && (
              <div className="flex flex-col items-center gap-2 pt-6">
                <ComicButton size="sm" sfx={false} onPress={drawn.more}>
                  Load more
                </ComicButton>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.INK_SUBTLE }}>
                  Showing {drawn.rows.length} of {shown.length}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </ComicDialog>
  );
}

function EmptySubmissions({ hasSubmit }: { hasSubmit: boolean }) {
  const { colors } = useComic();
  return (
    <div className="relative flex flex-col items-center gap-3 py-8 text-center">
      <div className="relative">
        <div
          className={`${LETTERED} flex h-28 w-40 items-center justify-center border-[3px] text-2xl uppercase`}
          style={{ fontFamily: COMIC_FONT, borderColor: colors.LINE, background: colors.PAPER_RAISED, color: colors.INK_SUBTLE, boxShadow: `5px 5px 0 ${colors.SHADOW}` }}
        >
          Empty
        </div>
        <Stamp kind="custom" size="sm" rotate={14} className="absolute -right-6 -top-4">
          Nothing yet
        </Stamp>
      </div>
      <p className="max-w-xs text-sm" style={{ color: colors.INK_BODY }}>
        {hasSubmit ? "Nothing submitted yet. Submit a screenshot to get your first stamp." : "Nothing has been submitted for this team yet."}
      </p>
    </div>
  );
}
