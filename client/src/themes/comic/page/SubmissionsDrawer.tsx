import { useState } from "react";
import type { SubmissionStatus } from "@bingo/shared";
import type { SubmissionModel } from "../../../headless/types";
import { Select } from "../../../core/ui/Field";
import { ComicDialog, ComicDialogHeader } from "../ui/ComicDialog";
import { ComicButton } from "../ui/ComicButton";
import { CaptionBox } from "../ui/CaptionBox";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";
import { SubmissionBubble } from "../board/SubmissionBubble";
import { COMIC_FONT } from "../font";

type Filter = SubmissionStatus | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

/**
 * Submissions — every claim the team has sent in, stacked as a pile of
 * mail with rubber-stamped verdicts. Filter tabs are ink-bordered
 * index tabs; the list scrolls inside the dialog.
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
  const [filter, setFilter] = useState<Filter>("all");
  const [submitter, setSubmitter] = useState("");
  const submitters = [...new Set(submissions.flatMap((s) => (s.submittedBy ? [s.submittedBy] : [])))].sort();
  const bySubmitter = submitter ? submissions.filter((s) => s.submittedBy === submitter) : submissions;
  const shown = filter === "all" ? bySubmitter : bySubmitter.filter((s) => s.status === filter);
  const countFor = (key: Filter) => (key === "all" ? bySubmitter.length : bySubmitter.filter((s) => s.status === key).length);
  const pending = submissions.filter((s) => s.status === "pending").length;

  return (
    <ComicDialog isOpen={isOpen} onClose={onClose} size="lg">
      <ComicDialogHeader
        title="Submissions"
        tone="red"
        subtitle={
          submissions.length === 0
            ? "No submissions yet"
            : `${submissions.length} submission${submissions.length !== 1 ? "s" : ""}${pending ? ` · ${pending} pending review` : ""}`
        }
        onClose={onClose}
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

      {submissions.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-b-[3px] px-5 pt-4" style={{ borderColor: colors.INK, background: colors.PAPER_ALT }}>
          {FILTERS.map(({ key, label }) => {
            const active = filter === key;
            const count = countFor(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={active}
                className="comic-press relative -mb-[3px] flex items-center gap-2 border-[3px] border-b-0 px-3 pb-2 pt-1.5 text-lg uppercase leading-none tracking-wide transition-transform"
                style={{
                  fontFamily: COMIC_FONT,
                  borderColor: colors.INK,
                  background: active ? colors.PAPER : colors.PAPER_RAISED,
                  color: active ? colors.INK : colors.INK_SUBTLE,
                  transform: active ? "translateY(0)" : "translateY(3px)",
                  zIndex: active ? 2 : 1,
                }}
              >
                {label}
                <span
                  className="rounded-full px-1.5 text-xs leading-4"
                  style={{ background: active ? colors.INK : colors.RULE, color: active ? colors.PAPER : colors.INK, fontFamily: "inherit" }}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {submitters.length > 1 && (
            <Select size="sm" value={submitter} onChange={(e) => setSubmitter(e.target.value)} aria-label="Submitted by" className="mb-2 ml-auto w-auto!">
              <option value="">Everyone</option>
              {submitters.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      <div className="p-5">
        {submissions.length === 0 ? (
          <EmptySubmissions hasSubmit={!!onSubmit} />
        ) : shown.length === 0 ? (
          <CaptionBox tone="paper" tilt={-0.5}>
            <p className="text-sm" style={{ color: colors.INK_BODY }}>
              No {filter === "all" ? "" : `${filter} `}submissions{submitter && ` from ${submitter}`}.
            </p>
          </CaptionBox>
        ) : (
          <ul className="space-y-5">
            {shown.map((s, i) => (
              // Each card is its own stacking context (the tilt). Stack earlier
              // cards above later ones so an overhanging stamp isn't covered
              // by the next card's top edge.
              <li key={s.id} className="relative" style={{ transform: `rotate(${i % 2 === 0 ? -0.5 : 0.5}deg)`, zIndex: shown.length - i }}>
                <SubmissionBubble submission={s} showTile />
              </li>
            ))}
          </ul>
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
          className="flex h-28 w-40 items-center justify-center border-[3px] text-2xl uppercase"
          style={{ fontFamily: COMIC_FONT, borderColor: colors.INK, background: colors.PAPER_RAISED, color: colors.INK_SUBTLE, boxShadow: `5px 5px 0 ${colors.INK}` }}
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
