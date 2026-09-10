import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Heading,
  Modal as AriaModal,
  ModalOverlay,
} from "react-aria-components";
import type { TileModel } from "../../../headless/types";
import { SubmissionBubble } from "./SubmissionBubble";
import { XIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";
import { COMIC_FONT } from "../font";

const PAGE_BG = "#f2ead4";
// Literal, not `var(--tile-border)`: react-aria-components' ModalOverlay
// portals this whole dialog out next to the end of <body>, outside the DOM
// subtree ThemeProvider sets that CSS variable on — every `var(--tile-border)`
// reference in this file was silently resolving to nothing.
const BORDER_COLOR = "#000000";
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
}: {
  tile: TileModel | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: () => void;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      className="overlay-backdrop fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4"
    >
      {/* min-h-full + a centering flex child (rather than centering the
          scroll container itself) so tall content — the book plus its
          floating title and stacked submission bubbles — scrolls into view
          instead of having its top clipped by the centering. */}
      <div className="flex min-h-full items-center justify-center py-10">
        <AriaModal className="overlay-panel w-full max-w-3xl outline-none">
          <AriaDialog className="outline-none">
            {tile && (
              <TileDetails tile={tile} onClose={onClose} onSubmit={onSubmit} />
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
}: {
  tile: TileModel;
  onClose: () => void;
  onSubmit?: () => void;
}) {
  const TaskPanel = useSlot("TaskPanel");
  const pageCount = Math.max(tile.tasks.length, 1);

  return (
    <div className="relative">
      {tile.imageUrl && (
        <img
          src={tile.imageUrl}
          alt={tile.name}
          className="border-black border-2 absolute -top-28 -left-12 size-36 shrink-0 object-contain -rotate-12"
        />
      )}
      <AriaButton
        aria-label="Close"
        onPress={onClose}
        className="cursor-pointer absolute right-0 -top-4 flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] bg-white text-black transition-transform duration-100 pressed:scale-95 hover:-translate-y-0.5 z-51"
        style={{
          borderColor: BORDER_COLOR,
          boxShadow: `3px 3px 0 ${BORDER_COLOR}`,
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
            fill={PAGE_BG}
            stroke={BORDER_COLOR}
            strokeWidth={BORDER_WIDTH}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="relative flex w-full min-h-168"
          style={{
            backgroundColor: PAGE_BG,
            clipPath: "url(#comic-book-clip)",
            boxShadow:
              "inset 0 14px 18px -14px rgba(0,0,0,0.5), inset 0 -14px 18px -14px rgba(0,0,0,0.5)",
          }}
        />
        <div
          className="absolute top-0 left-0 grid w-full min-h-168 px-8 pt-20 pb-20"
          style={{
            gridTemplateColumns: `repeat(${pageCount}, minmax(0, 1fr))`,
          }}
        >
          {tile.tasks.map((task, i) => (
            <div
              key={task.id}
              className="relative h-full"
              style={
                i < tile.tasks.length - 1
                  ? { borderRight: `${BORDER_WIDTH}px solid ${BORDER_COLOR}` }
                  : undefined
              }
            >
              <TaskPanel task={task} />
            </div>
          ))}
        </div>
      </div>
      {/* Submissions as a stack of chat bubbles floating below the book,
          each with a small tail on its left edge, near the bottom. */}
      {tile.submissions.length > 0 && (
        <div className="relative z-0 flex flex-col gap-4 px-2">
          {tile.submissions.map((s) => (
            <div
              key={s.id}
              className="relative ml-6 max-w-[92%] self-start rounded-2xl border-[3px] bg-white px-4 py-3"
              style={{
                borderColor: BORDER_COLOR,
                boxShadow: "3px 3px 0 rgba(0,0,0,0.2)",
              }}
            >
              <div
                className="absolute -left-2.5 bottom-4 size-4 border-b-[3px] border-l-[3px] bg-white"
                style={{
                  borderColor: BORDER_COLOR,
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
