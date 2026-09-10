import { Button as AriaButton, Dialog as AriaDialog, Heading, Modal as AriaModal, ModalOverlay } from "react-aria-components";
import type { TileModel } from "../../../headless/types";
import { Badge } from "../../../core/ui/Card";
import { Button } from "../../../core/ui/Button";
import { SubmissionRow } from "../../../core/submissions/SubmissionRow";
import { ClockIcon, XIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";
import { COMIC_FONT } from "../font";

const PAGE_BG = "#f2ead4";

// A 12-point jagged starburst — alternating an outer radius (48% from
// center) with an inner radius (30%) every 15° — the classic comic "POW!"
// callout shape. All percentages, so it scales to whatever box it's given.
const BURST_CLIP_PATH =
  "polygon(50% 2%, 57.76% 21.02%, 74% 8.43%, 71.21% 28.79%, 91.57% 26%, 78.98% 42.24%, 98% 50%, 78.98% 57.76%, 91.57% 74%, 71.21% 71.21%, 74% 91.57%, 57.76% 78.98%, 50% 98%, 42.24% 78.98%, 26% 91.57%, 28.79% 71.21%, 8.43% 74%, 21.02% 57.76%, 2% 50%, 21.02% 42.24%, 8.43% 26%, 28.79% 28.79%, 26% 8.43%, 42.24% 21.02%)";

/** `tile` null while `isOpen` transitions closed (kept mounted so it can animate out). */
export function TileModal({ tile, isOpen, onClose, onSubmit }: { tile: TileModel | null; isOpen: boolean; onClose: () => void; onSubmit?: () => void }) {
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
        <AriaModal className="overlay-panel w-full max-w-2xl outline-none">
          <AriaDialog className="outline-none">
            {tile && <TileDetails tile={tile} onClose={onClose} onSubmit={onSubmit} />}
          </AriaDialog>
        </AriaModal>
      </div>
    </ModalOverlay>
  );
}

function TileDetails({ tile, onClose, onSubmit }: { tile: TileModel; onClose: () => void; onSubmit?: () => void }) {
  const TaskPanel = useSlot("TaskPanel");
  const submitDisabled = tile.progress.allComplete || tile.freeze.isFrozen;
  const pageCount = Math.max(tile.tasks.length, 1);

  return (
    <div>
      {/* Title burst + close button, pulled down onto the book's top curve
          with a negative margin so it reads as floating above the book,
          without needing to absolutely-position anything against the
          burst's own content-driven (and therefore unpredictable) width. */}
      <div className="relative z-20 -mb-6 flex items-center justify-center gap-3 px-6">
        <div className="relative inline-block" style={{ filter: "drop-shadow(2px 5px 4px rgba(0,0,0,0.4))" }}>
          {/* Black rim: same clip-path, sized a few px larger on every side
              so it peeks out from behind the fill layer as an outline —
              `border` can't follow a clip-path shape, so this stands in. */}
          <div className="absolute -inset-1.5" style={{ backgroundColor: "#000", clipPath: BURST_CLIP_PATH }} />
          <div className="absolute inset-0" style={{ backgroundColor: "var(--tile-accent)", clipPath: BURST_CLIP_PATH }} />
          <div className="relative px-10 py-7 text-center">
            <Heading
              slot="title"
              className="max-w-[16rem] truncate uppercase leading-none text-black"
              style={{ fontFamily: COMIC_FONT, fontSize: "1.75rem", letterSpacing: "0.01em" }}
            >
              {tile.name}
            </Heading>
          </div>
        </div>

        <AriaButton
          aria-label="Close"
          onPress={onClose}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border-[3px] bg-white text-black transition-transform duration-100 pressed:scale-95 hover:-translate-y-0.5"
          style={{ borderColor: "var(--tile-border)", boxShadow: "3px 3px 0 var(--tile-border)" }}
        >
          <XIcon size={18} />
        </AriaButton>
      </div>

      {/* The book: curved top and bottom, mimicking a stack of raised
          pages — straight sides. border-radius with a 50% horizontal
          radius makes each edge's two corner ellipses meet exactly in the
          middle, forming one continuous curve across the whole edge; a
          small fixed (not %) vertical radius keeps the bulge modest no
          matter how tall the content ends up (variable task count). Inset
          shadows near the top/bottom edges deepen that curve into a fold;
          the outer shadow lifts the whole book off the backdrop. */}
      <div
        className="relative z-10 overflow-hidden border-[3px] pt-10 pb-8"
        style={{
          backgroundColor: PAGE_BG,
          borderColor: "var(--tile-border)",
          borderRadius: "50% / 28px",
          boxShadow:
            "0 20px 45px rgba(0,0,0,0.45), inset 0 10px 14px -12px rgba(0,0,0,0.5), inset 0 -10px 14px -12px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-8 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            {tile.imageUrl && <img src={tile.imageUrl} alt="" className="size-12 shrink-0 object-contain" />}
            <div className="flex flex-wrap items-center gap-2">
              {tile.category && (
                <Badge className="border-current" style={{ color: tile.category.color ?? undefined }}>
                  {tile.category.label}
                </Badge>
              )}
              <span className="num text-sm text-fg-muted">
                {tile.progress.totalTasks > 0 ? `${tile.progress.pointsAwarded}/` : ""}
                {tile.progress.totalPoints} pts
              </span>
              {tile.freeze.hasFreezePeriod && (
                <Badge tone="info">
                  <ClockIcon size={12} />
                  <span className="num">{tile.freeze.durationMinutes}min</span> freeze
                </Badge>
              )}
            </div>
          </div>
          {onSubmit && (
            <Button variant="primary" size="sm" onPress={onSubmit} isDisabled={submitDisabled}>
              {tile.progress.allComplete ? "Complete" : tile.freeze.isFrozen ? "Frozen" : "Submit"}
            </Button>
          )}
        </div>

        <div
          className="grid border-t-[3px]"
          style={{ borderColor: "var(--tile-border)", gridTemplateColumns: `repeat(${pageCount}, minmax(0, 1fr))` }}
        >
          {tile.tasks.map((task, i) => (
            <div
              key={task.id}
              className="relative"
              style={i < tile.tasks.length - 1 ? { borderRight: "2px solid var(--tile-border)" } : undefined}
            >
              <TaskPanel task={task} />
              {i < tile.tasks.length - 1 && (
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 w-6 translate-x-1/2"
                  style={{ background: "linear-gradient(to right, transparent, rgba(0,0,0,0.18), transparent)" }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submissions as a stack of chat bubbles floating below the book,
          each with a small tail pointing back up toward it. */}
      {tile.submissions.length > 0 && (
        <div className="relative z-0 mt-8 flex flex-col gap-4 px-2">
          {tile.submissions.map((s) => (
            <div
              key={s.id}
              className="relative ml-6 max-w-[85%] self-start rounded-2xl border-[3px] bg-white px-4 py-3"
              style={{ borderColor: "var(--tile-border)", boxShadow: "3px 3px 0 rgba(0,0,0,0.2)" }}
            >
              <div
                className="absolute -top-[11px] left-6 size-4 border-l-[3px] border-t-[3px] bg-white"
                style={{ borderColor: "var(--tile-border)", transform: "rotate(45deg)" }}
              />
              <p className="mb-1 text-xs font-medium text-fg-muted">{s.taskLabels.join(" + ")}</p>
              <SubmissionRow detail={s.detail} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
