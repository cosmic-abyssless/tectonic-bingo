import { useState } from "react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Heading,
  Modal as AriaModal,
  ModalOverlay,
} from "react-aria-components";
import type { TileModel } from "../../../headless/types";
import { SubmissionBubble } from "./SubmissionBubble";
import { CheckIcon, ClockIcon, HandIcon, LockIcon, XIcon } from "../../../core/ui/icons";
import { formatCountdown, formatDuration } from "../../../core/ui/time";
import { PlayerName } from "../../../core/tectonic/PlayerName";
import { useResolvedColorScheme } from "../../../core/ui/colorScheme";
import { useSlot } from "../../context";
import { COMIC_FONT } from "../font";
import { getColors } from "./colors";
import { ComicButton } from "../ui/ComicButton";
import { CaptionBox } from "../ui/CaptionBox";
import { Stamp } from "../ui/Stamp";

const BORDER_WIDTH = 5;

// A 12-point jagged starburst — alternating an outer radius (48% from
// center) with an inner radius (30%) every 15° — the classic comic "POW!"
// callout shape. All percentages, so it scales to whatever box it's given.
const BURST_CLIP_PATH =
  "polygon(50% 2%, 57.76% 21.02%, 74% 8.43%, 71.21% 28.79%, 91.57% 26%, 78.98% 42.24%, 98% 50%, 78.98% 57.76%, 91.57% 74%, 71.21% 71.21%, 74% 91.57%, 57.76% 78.98%, 50% 98%, 42.24% 78.98%, 26% 91.57%, 28.79% 71.21%, 8.43% 74%, 21.02% 57.76%, 2% 50%, 21.02% 42.24%, 8.43% 26%, 28.79% 28.79%, 26% 8.43%, 42.24% 21.02%)";

/** `tile` null while `isOpen` transitions closed (kept mounted so it can animate out). */
export function TileModal({
  tile,
  isOpen,
  onClose,
  onSubmit,
  onToggleInterest,
}: {
  tile: TileModel | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (taskId?: string) => void;
  onToggleInterest?: (taskId: string) => void;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      className="overlay-backdrop fixed inset-0 z-50 overflow-y-auto bg-scrim/70 p-4"
    >
      {/* min-h-full + a centering flex child (rather than centering the
          scroll container itself) so tall content — the book plus its
          floating title and stacked submission bubbles — scrolls into view
          instead of having its top clipped by the centering. */}
      <div className="flex min-h-full items-center justify-center py-10">
        <AriaModal className="overlay-panel w-full max-w-3xl outline-none">
          <AriaDialog className="outline-none">
            {tile && (
              <TileDetails tile={tile} onClose={onClose} onSubmit={onSubmit} onToggleInterest={onToggleInterest} />
            )}
          </AriaDialog>
        </AriaModal>
      </div>
    </ModalOverlay>
  );
}

function TileDetails({
  tile,
  onClose,
  onSubmit,
  onToggleInterest,
}: {
  tile: TileModel;
  onClose: () => void;
  onSubmit?: (taskId?: string) => void;
  onToggleInterest?: (taskId: string) => void;
}) {
  const TaskPanel = useSlot("TaskPanel");
  const colors = getColors(useResolvedColorScheme());
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const currentTask = tile.tasks[activeTaskIndex] ?? tile.tasks[0];
  const hasMultipleTasks = tile.tasks.length > 1;

  return (
    <div className="relative">
      {tile.imageUrl && (
        <img
          src={tile.imageUrl}
          alt={tile.name}
          className="border-2 absolute -top-28 -left-12 size-36 shrink-0 object-contain -rotate-12 z-10"
          style={{ borderColor: colors.INK }}
        />
      )}
      <AriaButton
        aria-label="Close"
        onPress={onClose}
        className="cursor-pointer absolute right-0 -top-4 flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] transition-transform duration-100 pressed:scale-95 hover:-translate-y-0.5 z-51"
        style={{
          backgroundColor: colors.PAPER_RAISED,
          color: colors.INK,
          borderColor: colors.INK,
          boxShadow: `3px 3px 0 ${colors.INK}`,
        }}
      >
        <XIcon size={24} />
      </AriaButton>
      {/* The book: the scalloped top/bottom wave. The visible shape (fill +
          border) is drawn as a real SVG path with `stroke` — the only
          reliable way to get a border that follows a curve like this.
          The HTML content below is clipped to a slightly SMALLER copy of
          the same path (`comic-book-clip`, inset ~2% on every point) so
          there's a guaranteed visible band of the SVG's own fill+stroke
          around it — clipping the content to the *exact* same coordinates
          left the border's visibility riding on the two independently
          scaled coordinate systems (objectBoundingBox vs viewBox) lining
          up to the pixel, which wasn't happening. */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <clipPath id="comic-book-clip" clipPathUnits="objectBoundingBox">
            <path d="M 0.07,0.86 Q 0.27,0.81 0.5,0.86 Q 0.73,0.81 0.93,0.86 L 0.93,0.14 Q 0.73,0.09 0.5,0.14 Q 0.27,0.09 0.07,0.14 Z" />
          </clipPath>
        </defs>
      </svg>
      <div className="relative w-full">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <path
            d="M 5,88 Q 25,83 50,88 Q 75,83 95,88 L 95,12 Q 75,7 50,12 Q 25,7 5,12 Z"
            fill={colors.PAPER}
            stroke={colors.INK}
            strokeWidth={BORDER_WIDTH}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="relative flex w-full min-h-168"
          style={{
            backgroundColor: colors.PAPER,
            clipPath: "url(#comic-book-clip)",
            boxShadow:
              "inset 0 14px 18px -14px rgba(0,0,0,0.5), inset 0 -14px 18px -14px rgba(0,0,0,0.5)",
          }}
        />
        <div className="absolute top-0 left-0 flex flex-col w-full min-h-168 px-8 sm:px-14 pt-20 pb-20">
          {/* Header banner: Issue title and navigation */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 pb-3" style={{ borderColor: `${colors.INK}33` }}>
            <div className="min-w-0">
              <span className="block text-xs uppercase tracking-wider font-bold" style={{ color: colors.INK_SUBTLE, fontFamily: COMIC_FONT }}>
                Comic Issue
              </span>
              <Heading className="truncate text-2xl sm:text-3xl uppercase tracking-wide font-extrabold" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
                {tile.name}
              </Heading>
            </div>

            {/* Part counter / page selector tabs if multiple parts exist */}
            {hasMultipleTasks && (
              <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Issue parts">
                <span className="mr-1 text-xs uppercase font-bold" style={{ fontFamily: COMIC_FONT, color: colors.INK_SUBTLE }}>
                  Parts:
                </span>
                {tile.tasks.map((task, i) => {
                  const isActive = i === activeTaskIndex;
                  const isDone = task.complete;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTaskIndex(i)}
                      className="cursor-pointer flex size-8 items-center justify-center rounded-sm border-2 text-sm font-black transition-all duration-100 hover:scale-105"
                      style={{
                        fontFamily: COMIC_FONT,
                        borderColor: colors.INK,
                        backgroundColor: isActive ? colors.YELLOW : isDone ? colors.OK : colors.PAPER_RAISED,
                        color: isDone && !isActive ? "#fffaf0" : colors.INK,
                        boxShadow: isActive ? `2px 2px 0 ${colors.INK}` : undefined,
                        transform: isActive ? "rotate(-3deg)" : undefined,
                      }}
                      title={`Part ${i + 1}: ${task.label}`}
                    >
                      {isDone ? <CheckIcon size={14} /> : i + 1}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Part story page presentation */}
          {currentTask && (
            <div className="relative flex-1">
              {/* Part number badge on top-right */}
              {hasMultipleTasks && (
                <div
                  className="absolute right-0 -top-1 z-10 flex size-9 items-center justify-center border-2 text-lg font-black"
                  style={{
                    fontFamily: COMIC_FONT,
                    borderColor: colors.INK,
                    background: colors.YELLOW,
                    color: colors.INK,
                    boxShadow: `2px 2px 0 ${colors.INK}`,
                    transform: "rotate(4deg)",
                  }}
                  aria-hidden
                >
                  {activeTaskIndex + 1}
                </div>
              )}

              {/* Part action bar (Submit button + interest crew for this part) */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 pb-3" style={{ borderColor: `${colors.INK}22` }}>
                <div className="flex flex-wrap items-center gap-3">
                  {onSubmit && (
                    <ComicButton
                      variant="primary"
                      isDisabled={currentTask.complete || currentTask.locked || tile.freeze.isFrozen}
                      onPress={() => {
                        onSubmit(currentTask.id);
                      }}
                    >
                      Submit Proof
                    </ComicButton>
                  )}

                  {currentTask.complete && (
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.OK }}>
                      ✓ Completed
                    </span>
                  )}
                  {currentTask.locked && (
                    <span className="text-xs" style={{ color: colors.INK_SUBTLE }}>
                      {currentTask.lockedReason ?? "Locked by previous requirement"}
                    </span>
                  )}
                  {tile.freeze.isFrozen && (
                    <span className="text-xs font-bold" style={{ color: colors.FROZEN }}>
                      On ice: thaws in {formatCountdown(tile.freeze.remainingMs)}
                    </span>
                  )}
                </div>

                {/* Part counter text */}
                <span className="text-xs uppercase font-bold" style={{ color: colors.INK_SUBTLE, fontFamily: COMIC_FONT }}>
                  Part {activeTaskIndex + 1} of {tile.tasks.length}
                </span>
              </div>

              {/* Rich Task details (checklist, description, tags, notes, stamp) */}
              <TaskPanel task={currentTask} />
            </div>
          )}
        </div>
      </div>
      {/* Who's on this tile: a speech bubble with a shout-out button. */}
      {(onToggleInterest || tile.interest.people.length > 0) && (
        <div
          className="relative z-0 mx-2 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border-[3px] px-4 py-3"
          style={{ backgroundColor: colors.PAPER_RAISED, borderColor: colors.INK, color: colors.INK, boxShadow: "3px 3px 0 rgba(0,0,0,0.2)", fontFamily: COMIC_FONT }}
        >
          {onToggleInterest && currentTask && (
            <AriaButton
              onPress={() => {
                onToggleInterest(currentTask.id);
              }}
              aria-pressed={currentTask.interest.mine}
              className="cursor-pointer flex items-center gap-1.5 rounded-full border-[3px] px-3 py-1 text-sm font-bold uppercase transition-transform duration-100 pressed:scale-95 hover:-translate-y-0.5"
              style={{
                borderColor: colors.INK,
                boxShadow: `2px 2px 0 ${colors.INK}`,
                backgroundColor: currentTask.interest.mine ? "#facc15" : colors.PAPER_RAISED,
                color: colors.INK,
              }}
            >
              <HandIcon size={16} fill={currentTask.interest.mine ? "currentColor" : "none"} />
              {currentTask.interest.mine ? "I'm on this part!" : "I'll do this part!"}
            </AriaButton>
          )}
          <span className="text-sm">
            {currentTask && currentTask.interest.people.length > 0 ? (
              <>
                <span className="font-bold uppercase">On Part {activeTaskIndex + 1}: </span>
                {currentTask.interest.people.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <PlayerName userId={p.id}>{p.displayName}</PlayerName>
                  </span>
                ))}
              </>
            ) : (
              "Nobody has called this part yet."
            )}
          </span>
        </div>
      )}
      {/* Submissions as a stack of chat bubbles floating below the book,
          each with a small tail on its left edge, near the bottom. */}
      {tile.submissions.length > 0 && (
        <div className="relative z-0 flex flex-col gap-4 px-2">
          {tile.submissions.map((s) => (
            <div
              key={s.id}
              className="relative ml-6 max-w-[92%] self-start rounded-2xl border-[3px] px-4 py-3"
              style={{
                backgroundColor: colors.PAPER_RAISED,
                borderColor: colors.INK,
                boxShadow: "3px 3px 0 rgba(0,0,0,0.2)",
              }}
            >
              <div
                className="absolute -left-2.5 bottom-4 size-4 border-b-[3px] border-l-[3px]"
                style={{
                  backgroundColor: colors.PAPER_RAISED,
                  borderColor: colors.INK,
                  transform: "rotate(45deg)",
                }}
              />
              <SubmissionBubble submission={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
