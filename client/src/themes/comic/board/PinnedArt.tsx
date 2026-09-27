import { Button as AriaButton, Dialog as AriaDialog, Modal as AriaModal, ModalOverlay } from "react-aria-components";
import type { AnimationSequence } from "motion/react";
import { fullUrl, thumbUrl } from "../../../api/imageVariants";
import { XIcon } from "../../../core/ui/icons";
import { ComicBackdrop } from "../ui/ComicDialog";
import { ComicIconButton } from "../ui/ComicButton";
import { bw } from "./ClosedBook";
import type { ComicColors } from "./colors";

// The Tile's artwork, stuck onto the contents page under the Parts list with
// a tack, and the full-size view it opens.

/** The picture (the element that lands) and the tack pinning it; see pinSequence. */
export const PIN_ART = "[data-pin-art]";
export const PIN_TACK = "[data-pin-tack]";
/** The full-size view's overlay, so the book's own keys can leave it alone. */
export const ART_VIEWER = "[data-art-viewer]";

/**
 * The picture landing on the page and the tack going in, for the book's enter
 * sequence: the picture drops onto the page a little crooked, the tack comes
 * down onto it, and the hit knocks the picture straight onto its pin. `at` is
 * when the picture lands. The picture's resting tilt is its wrapper's, so both
 * end at 0 here. They start hidden (see hidePin); under reduced motion none of
 * this runs and they're simply there.
 */
export function pinSequence(at: number): AnimationSequence {
  const hit = at + 0.25;
  return [
    [PIN_ART, { opacity: [0, 1] }, { duration: 0.12, ease: "easeOut", at }],
    [PIN_ART, { scale: [1.3, 1], rotate: [-12, -5] }, { type: "spring", duration: 0.33, bounce: 0.3, at }],
    [PIN_TACK, { opacity: [0, 1] }, { duration: 0.06, ease: "easeOut", at: hit }],
    [PIN_TACK, { scale: [2.4, 1], y: [-10, 0] }, { type: "spring", duration: 0.3, bounce: 0.5, at: hit }],
    // The tack's spring passes 1 about a third of the way through: that's the hit.
    [PIN_ART, { rotate: [-5, 0] }, { type: "spring", duration: 0.4, bounce: 0.5, at: hit + 0.1 }],
  ];
}

/** Hides the picture and tack for pinSequence to bring in, before the first paint. */
export function hidePin(root: Element) {
  root.querySelectorAll<HTMLElement>(`${PIN_ART}, ${PIN_TACK}`).forEach((el) => (el.style.opacity = "0"));
}

/**
 * The artwork on the page: a slightly crooked, paper-framed print with a tack
 * through its top edge. A button, since it opens the full-size view.
 */
export function PinnedArt({ imageUrl, name, colors, onOpen }: { imageUrl: string; name: string; colors: ComicColors; onOpen: (trigger: HTMLElement) => void }) {
  return (
    // The tilt lives here (CSS `rotate`), apart from the `transform` Motion
    // animates below, so the landing can't disturb it.
    <div className="relative mx-auto -rotate-3 pt-2" style={{ width: bw(0.42) }}>
      <AriaButton
        data-pin-art
        aria-label={`${name}: open the artwork full size`}
        onPress={(e) => onOpen(e.target as HTMLElement)}
        className="block w-full cursor-zoom-in border-[3px] p-1.5 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2"
        style={{
          backgroundColor: colors.PAPER_RAISED,
          borderColor: colors.LINE,
          boxShadow: `4px 4px 0 ${colors.LINE}`,
          outlineColor: colors.BLUE,
        }}
      >
        <img src={thumbUrl(imageUrl)} alt="" draggable={false} className="block aspect-square w-full object-contain" />
      </AriaButton>
      <Tack colors={colors} />
    </div>
  );
}

/** A comic pushpin seen from above: a red head with a highlight and a hard ink shadow. */
function Tack({ colors }: { colors: ComicColors }) {
  return (
    <svg
      data-pin-tack
      aria-hidden="true"
      viewBox="0 0 28 28"
      className="pointer-events-none absolute left-1/2 top-0 -ml-4 size-8"
    >
      <circle cx="16" cy="16" r="9" fill={colors.LINE} />
      <circle cx="13" cy="13" r="9" fill={colors.RED} stroke={colors.LINE} strokeWidth="2.5" />
      <circle cx="13" cy="13" r="4" fill="none" stroke={colors.LINE} strokeWidth="1.5" opacity="0.35" />
      <circle cx="10" cy="9.5" r="2.25" fill="#fff" opacity="0.9" />
    </svg>
  );
}

/**
 * The artwork full size, over the book. Escape, the backdrop and the close
 * button only close this; focus then goes back to the picture (the caller's
 * `onClose` does that — it knows which one opened it).
 */
export function ArtViewer({ imageUrl, name, isOpen, onClose, colors }: { imageUrl: string | null; name: string; isOpen: boolean; onClose: () => void; colors: ComicColors }) {
  return (
    <ModalOverlay
      data-art-viewer
      isOpen={isOpen && !!imageUrl}
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      className="comic-backdrop fixed inset-0 z-60 flex items-center justify-center p-4"
    >
      <ComicBackdrop />
      <AriaModal className="comic-panel-pop relative outline-none">
        <AriaDialog aria-label={`${name} artwork`} className="relative outline-none">
          <img
            src={fullUrl(imageUrl)}
            alt={name}
            className="block max-h-[calc(100dvh-4rem)] max-w-[calc(100vw-2rem)] border-[3px] object-contain"
            style={{ backgroundColor: colors.PAPER_RAISED, borderColor: colors.LINE, boxShadow: `6px 6px 0 ${colors.LINE}` }}
          />
          <ComicIconButton label="Close" onPress={onClose} className="absolute -right-3 -top-3 size-11">
            <XIcon size={22} />
          </ComicIconButton>
        </AriaDialog>
      </AriaModal>
    </ModalOverlay>
  );
}
