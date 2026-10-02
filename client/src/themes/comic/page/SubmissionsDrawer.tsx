import { useState } from "react";
import type { SubmissionStatus } from "@bingo/shared";
import type { SubmissionModel } from "../../../headless/types";
import { MultiSelect } from "../../../core/ui/MultiSelect";
import { Tab, TabList, TabPanel, Tabs } from "../../../core/ui/Tabs";
import { ComicDialog, ComicDialogHeader } from "../ui/ComicDialog";
import { ComicButton } from "../ui/ComicButton";
import { CaptionBox } from "../ui/CaptionBox";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";
import { SubmissionBubble } from "../board/SubmissionBubble";
import { COMIC_FONT } from "../font";
import { useLoadMore } from "../../../core/ui/paging";

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
  // None picked = everyone. Names come from the submissions themselves, so the list only ever offers people who
  // actually submitted something.
  const [picked, setPicked] = useState<string[]>([]);
  const submitters = [...new Set(submissions.flatMap((s) => (s.submittedBy ? [s.submittedBy] : [])))].sort();
  const submitterOptions = submitters.map((name) => ({ key: name, label: name, count: submissions.filter((s) => s.submittedBy === name).length }));
  const bySubmitter = picked.length > 0 ? submissions.filter((s) => s.submittedBy != null && picked.includes(s.submittedBy)) : submissions;
  const shown = filter === "all" ? bySubmitter : bySubmitter.filter((s) => s.status === filter);
  const countFor = (key: Filter) => (key === "all" ? bySubmitter.length : bySubmitter.filter((s) => s.status === key).length);
  const pending = submissions.filter((s) => s.status === "pending").length;
  // Drawn a page at a time, like the Mod panel's Submissions; back to the first page on a new filter or a fresh open.
  const drawn = useLoadMore(shown, `${isOpen}:${filter}:${picked.join(",")}`);

  // Pinned under the header (ComicDialogHeader's `below`), so the filters stay put while the list scrolls. Index tabs:
  // the picked one is the list's own paper and overlaps the rule, so it reads as the open tab; the rest sit on the
  // unbroken rule, a shade darker.
  const tabs = submissions.length > 0 && (
    <div className="flex flex-wrap items-end gap-2 border-b-[3px] px-5 pt-3" style={{ borderColor: colors.LINE, background: colors.PAPER_ALT }}>
      <TabList bare aria-label="Show" className="flex flex-wrap items-end gap-2">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          const count = countFor(key);
          return (
            <Tab
              key={key}
              id={key}
              className={`comic-press relative flex items-center gap-2 border-[3px] border-b-0 px-3 text-lg uppercase leading-none tracking-wide outline-none focus-visible:ring-2 ${active ? "-mb-[3px] pb-2.5 pt-2" : "pb-1.5 pt-1.5"}`}
              style={{
                fontFamily: COMIC_FONT,
                borderColor: colors.LINE,
                background: active ? colors.PAPER : `color-mix(in srgb, ${colors.PAPER_ALT} 90%, ${colors.INK})`,
                color: active ? colors.INK : colors.INK_SUBTLE,
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
            </Tab>
          );
        })}
      </TabList>
      {submitters.length > 1 && (
        <div className="mb-2 ml-auto">
          <MultiSelect label="Player" options={submitterOptions} selected={picked} onChange={setPicked} />
        </div>
      )}
    </div>
  );

  return (
    <ComicDialog isOpen={isOpen} onClose={onClose} size="lg" fixedHeight>
      <Tabs selectedKey={filter} onSelectionChange={(key) => setFilter(key as Filter)}>
        <ComicDialogHeader
          title="Submissions"
          tone="red"
          subtitle={
            submissions.length === 0
              ? "No submissions yet"
              : `${submissions.length} submission${submissions.length !== 1 ? "s" : ""}${pending ? ` · ${pending} pending review` : ""}`
          }
          onClose={onClose}
          below={tabs}
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

        {submissions.length === 0 ? (
          <div className="isolate p-5">
            <EmptySubmissions hasSubmit={!!onSubmit} />
          </div>
        ) : (
          <TabPanel id={filter} className="isolate p-5">
            {shown.length === 0 ? (
              <CaptionBox tone="paper" tilt={-0.5}>
                <p className="text-sm" style={{ color: colors.INK_BODY }}>
                  No {filter === "all" ? "" : `${filter} `}submissions{picked.length === 1 ? ` from ${picked[0]}` : picked.length > 1 && ` from those Players`}.
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
          </TabPanel>
        )}
      </Tabs>
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
