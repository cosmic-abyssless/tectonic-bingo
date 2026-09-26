import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import {
  AnimatePresence,
  animate as animateValue,
  stagger,
  useAnimate,
  usePresence,
  useReducedMotion,
  type AnimationPlaybackControls,
  type AnimationSequence,
} from "motion/react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay,
} from "react-aria-components";
import type { SubmissionModel, TaskModel, TileModel } from "../../../headless/types";
import { SubmissionBubble } from "./SubmissionBubble";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ClockIcon, HandIcon, LockIcon, XIcon } from "../../../core/ui/icons";
import { PlayerName } from "../../../core/tectonic/PlayerName";
import { TaskInterestPeople } from "../../../core/ui/TaskInterestPeople";
import { formatCountdown } from "../../../core/ui/time";
import { useSlot, useThemeTokens } from "../../context";
import { COMIC_FONT, COMIC_LOGO_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useEdgeSwipe } from "./useEdgeSwipe";
import { fling, stopFling } from "./dragScroll";
import { PageColorsContext, useComic } from "../ui/useComic";
import { CaptionBox } from "../ui/CaptionBox";
import {
  BASE_DEPTH,
  baseShadow,
  BASE_STAGGER,
  BACK_STAGGER,
  BACK_STAGGER_CSS,
  BASE_STAGGER_CSS,
  bw,
  CLOSED_BOOK,
  BACK_DEPTH,
  BACK_VIEW,
  ClosedBook,
  FIRST_LEAF_STAGGER,
  FIRST_LEAF_STAGGER_CSS,
  LEAF_GAP,
  leafSelector,
  Page,
  PageEdgeTicks,
  type LeafFaces,
} from "./ClosedBook";
import { ComicBurstRays } from "../ui/ComicBurst";
import { useModalDepth } from "../ui/modalStack";
import { PageFooter } from "./PageFooter";
import { getBookPose, setBookAway } from "./bookFlight";
import { ArtViewer, ART_VIEWER, hidePin, PinnedArt, pinSequence, PIN_ART } from "./PinnedArt";
import { pageColors, tilePageColors, TECTONIC_LOGO, type ComicColors } from "./colors";

/*
 * The tile modal IS the tile's comic book, opened — and it's a whole comic:
 *
 *   page 1        the issue's summary and progress (inside the front cover)
 *   pages 2…n+1   one per task
 *   last page     the submissions
 *
 * Pages sit on leaves the way they do in a real comic: the cover's inside is
 * page 1, then each leaf carries a page on its front and one on its back, so
 * spread N shows the back of leaf N on the left and the front of leaf N+1
 * on the right.
 *
 * Turning a page is a peel (see peelGeometry / renderCurl): hovering in
 * from a page's outer edge folds its corner or edge back under the pointer,
 * showing the print on its other side; clicking (or the nav under the
 * book, or the arrow keys) carries that fold on across the page to the
 * spine, laying the page over onto the facing one. At that instant the leaf
 * itself is put into its turned position underneath — the same picture —
 * and the fold-back is taken away.
 *
 *   open   — the cell's little book (TileCell) is hidden and an identical
 *            full-size copy takes off from that exact spot, straightens up
 *            and grows as it flies to the middle of the screen; then its
 *            cover swings open. Nothing is swapped or faded in: what you're
 *            reading at the end is the very same book that left the board.
 *   close  — the reverse: any turned leaves flip back, the cover closes
 *            over them, the book shrinks back to wherever its tile now sits
 *            on the board (re-measured, in case the page scrolled) and the
 *            cell's own copy takes over on the same frame.
 *
 * Geometry: the open book is two 2:3 pages side by side (so 4:3 overall),
 * spine down the middle. The closed book — cover over the right-hand page
 * — is therefore exactly one page wide, which is what measureFlight scales
 * the tile's book up to.
 *
 * The hand-off is pixel-exact because both ends are the same drawing
 * (ClosedBook, sized off `--bw`) in the same 2D/3D structure as TileCell:
 *
 *   TileCell:  frame (2D: perspective, clip)  >  book (3D: tilt, hover)  >  ClosedBook
 *   here:      frame (2D: perspective, clip, translate + scale)  >  flyer (3D: tilt)  >  ClosedBook
 *
 * The 2D frame carries the flight's translate/scale so the perspective and
 * the crop live inside it and scale with the book — the frame's
 * perspective is set to the tile's (a fixed multiple of the tile book's
 * width) divided by the flight scale, which is the same projection once
 * scaled down, and the crop is the tile's same "bottom 27.78% of the book",
 * animated in over the last stretch of the landing.
 *
 * All the choreography is imperative — `animate()` sequences for the
 * flight, direct DOM writes for the peel — rather than declarative
 * variants: the flight's start/end point is only known at runtime, the
 * exit has to run while the tile model that opened this is already gone
 * (AnimatePresence keeps this mounted with its last props until
 * `safeToRemove`), and the leaves are plain divs the sequences pose inline
 * before first paint. react-aria's own CSS enter/exit hooks
 * (overlay-backdrop / overlay-panel) are deliberately not used here.
 */

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
    // mode="wait": switching straight from one tile to another (via the
    // search box) flies the first book home before the next takes off,
    // rather than two overlays fighting.
    <AnimatePresence mode="wait">
      {isOpen && tile && (
        // A finished tile is read-only: nothing left to submit or claim, so
        // the pages get no such callbacks and render no such buttons.
        <FlyingBook
          key={tile.id}
          tile={tile}
          onClose={onClose}
          onSubmit={tile.progress.allComplete ? undefined : onSubmit}
          onToggleInterest={tile.progress.allComplete ? undefined : onToggleInterest}
        />
      )}
    </AnimatePresence>
  );
}

// A turned leaf lies flat on the left (-180°); an unturned one flat on the
// right (0°).
const OPEN_ANGLE = -180;
// TileCell's crop: the bottom 27.78% of the book past the tile's bottom
// edge, and everything past 9.52% of the book's width beyond its sides.
const TILE_CROP_BOTTOM = 0.2778;
const TILE_CROP_SIDE = 0.0952;
// The strip along a page's outer edge that turns it — as a fraction of the
// page's width — and how far it stretches inward once you've got hold of
// the page, so it keeps following the pointer.
const EDGE_BAND = 0.12;
const EDGE_BAND_HELD = 0.45;
// How far in a hovered page can be peeled, as a fraction of its width.
const MAX_HOVER_PEEL = 0.5;
// Phones: the strips that turn pages by touch. They sit just inside the
// outer edges of the visible page — the OS keeps the outermost ~20px of the
// screen for its own back/forward swipe, and the overlay's padding already
// puts the page 16px in — and everywhere else on the page belongs to the
// page (its own scrolling, its buttons).
const SWIPE_ZONE_INSET = 4;
const SWIPE_ZONE_WIDTH = 48;
// A drag turns the page if it gets this far (as a fraction of the page's width)...
const SWIPE_COMMIT = 0.35;
// ...or if it's let go moving toward the spine at least this fast (px/ms).
const SWIPE_FLICK = 0.3;
const SWIPE_FLICK_MIN_TRAVEL = 30;
const TURN_EASE = [0.45, 0, 0.15, 1] as const;
// The interactive page turn (hover-curl → flip) — halved from an original
// 0.75 per feedback that the book felt sluggish to page through. Kept as
// its own constant, separate from the cover's own swing below: an earlier
// pass tied the cover to this same fast pace and it read as too rushed for
// the book actually opening, even though this speed was right for turning
// pages.
const TURN_DURATION = 0.375;
// The cover's opening (and, mirrored, closing) swing — paced independently
// so it can run a little gentler than TURN_DURATION above. ~0.65x the
// original 0.75s, not the full 0.5x page-turn now uses.
const COVER_SWING = 0.49;

// The open book's own max width — capped by both a flat rem size and the
// viewport's height, so it always fits on screen. Shared with ComicBurst
// below so the burst's size stays proportional to the book's ACTUAL
// rendered size on any given screen, not to raw viewport units — vmin
// alone drifts in and out of proportion with the book across viewport
// shapes, since the two are capped by unrelated formulas.
const BOOK_MAX_WIDTH = "min(56rem, calc((100vh - 10rem) * 4 / 3))";
// On a phone the root is ONE page wide (2:3), and the modal must fit the
// visible viewport without scrolling: dynamic viewport height (so iOS's toolbars
// count), minus the overlay's padding (2rem) and the nav row under the book
// (1.25rem margin + 2.5rem buttons) with a little slack.
const PHONE_BOOK_MAX_WIDTH = "calc((100dvh - 6rem) / 1.5)";

/**
 * The open book's sunbeams (see ui/ComicBurst for the rays themselves) in
 * their own `fixed` layer outside the book's scrolling container — `fixed`
 * positioning keeps an oversized descendant from ever growing the modal a
 * scrollbar (it's outside document flow entirely, unlike the curl layer's
 * own oversized bits, which needed an explicit clip for exactly that
 * reason). Pure atmosphere, faded in and out by FlyingBook's enter/exit
 * sequences (`burst`), so this layer owns the opacity.
 */
function ComicBurst({ burstRef, reduceMotion, tint }: { burstRef: Ref<HTMLDivElement>; reduceMotion: boolean; tint?: string }) {
  // Opened on top of another modal (which already has its beams): no beams of its own, only the scrim.
  const stacked = useModalDepth() > 0;
  return (
    <div ref={burstRef} className="pointer-events-none fixed inset-0 flex items-center justify-center" style={{ opacity: 0 }}>
      {!stacked && <ComicBurstRays reduceMotion={reduceMotion} color={tint} />}
    </div>
  );
}

type Point = { x: number; y: number };
type Side = "front" | "back";

/** A task and its own number (its place in the tile's task list — what its label and badge say). */
interface OrderedTask {
  task: TaskModel;
  number: number;
}

/**
 * The tasks in page order: what's still to do first, in its original order,
 * then what's done, also in its original order — so finished parts drop to
 * the back of the book (5 tasks with the first 2 done read P3, P4, P5, P1,
 * P2). Each keeps its own number; only its place in the book moves.
 */
function orderTasks(tile: TileModel): OrderedTask[] {
  return tile.tasks
    .map((task, i) => ({ task, number: i + 1 }))
    .sort((a, b) => Number(a.task.complete) - Number(b.task.complete));
}

/** Layout of the comic: how many pages, how many leaves, how far it can be read. */
function bookShape(tile: TileModel, single = false) {
  const pageCount = tile.tasks.length + 2;
  // Phone: every page is the front of its own leaf (page j on leaf j+1; the
  // backs are blank paper) and `spread` is simply the index of the page showing.
  if (single) return { pageCount, lastSpread: pageCount - 1, innerLeaves: pageCount, leafCount: pageCount + 1 };
  // The last spread with something on its left-hand page.
  const lastSpread = Math.floor((pageCount - 1) / 2);
  // Leaves under the cover: enough that the last spread has a right-hand
  // page (blank if the count's odd).
  const innerLeaves = lastSpread + 1;
  return { pageCount, lastSpread, innerLeaves, leafCount: innerLeaves + 1 };
}

/** Depth of leaf `k` when `turned` leaves (the cover included) lie on the left: the top of each stack at 0, the rest behind it. */
function leafDepth(k: number, turned: number): number {
  return k < turned ? -(turned - 1 - k) * LEAF_GAP : -(k - turned) * LEAF_GAP;
}

/**
 * Segments moving a leaf from one depth to another around a page turn that
 * starts at `at` and lasts `turn`. A leaf coming up to the top of its stack
 * rises once the turn's done — until then it's behind the turning leaf,
 * and already in front of the base sheet. A leaf being pushed deeper
 * mustn't drop behind the base sheet while it's still in view — it dips
 * just short of the base for the duration of the turn, then settles once
 * the turning leaf has landed on it.
 */
function depthSegments(selector: string, from: number, to: number, at: number, turn: number): AnimationSequence {
  if (to === from) return [];
  if (to > from) return [[selector, { z: [from, to] }, { duration: 0.1, at: at + turn }]];
  const hold = Math.max(to, -BASE_DEPTH + 0.5);
  return [
    [selector, { z: [from, hold] }, { duration: 0.15, at }],
    [selector, { z: [hold, to] }, { duration: 0.1, at: at + turn }],
  ];
}

interface Flight {
  /** Offset from the closed book's resting spot (the right-hand page) to the tile's book, in px. */
  dx: number;
  dy: number;
  /** Tile book height / page height. */
  scale: number;
  /** Where in the frame's own box the closed book is centered, in px — the transform origin. */
  originX: number;
  originY: number;
  /** The vanishing point: the book's center, less any hover lift the tile's book has (its frame's stays put). */
  perspectiveOriginY: number;
  /** The frame's perspective (px) that reproduces the tile's, once scaled by `scale`. */
  perspective: number;
  /** The tile book's hinge angles at that moment, so the swap is seamless even mid-hover. */
  coverAngle: number;
  pageAngle: number;
  /** The whole book's resting pose: the tilt, or BACK_VIEW for a finished tile shown on its back cover. */
  flyerTurn: number;
  flyerTilt: number;
  /** A finished tile: its book is shown from behind, so the back cover is there to move with the base sheet. */
  flipped: boolean;
  /** clip-path values: the tile's crop, and none (a hair below the book so nothing's ever cut). */
  clipCropped: string;
  clipOpen: string;
}

// Where the closed book (= the right-hand page) sits when the modal is at
// rest, worked out from the never-transformed root's box alone so it stays
// right mid-animation, when the book itself is off somewhere else. With no
// tile to fly from/to (not on screen), it's a plain pop from the center.
function measureFlight(root: HTMLElement, tileId: string, flipped: boolean): Flight {
  const { rotateX: flyerTilt, rotateY: flyerTurn } = flipped ? BACK_VIEW : { rotateX: 0, rotateY: CLOSED_BOOK.tilt };
  // The pan wrapper (the book's own two-page box) rather than the root: on
  // phones it's twice the root's width and shifted, and its rect is what the
  // frame actually sits in. On desktop it IS the root's box.
  const rootRect = (root.querySelector<HTMLElement>("[data-pan]") ?? root).getBoundingClientRect();
  const pageWidth = rootRect.width / 2;
  const pageHeight = pageWidth * 1.5;
  // The closed book is the frame's right half, so the tile's side crops sit
  // just outside that half: a little past the frame's right edge, and most
  // of the way across from its left. (Only the empty left half is cut.)
  const clipCropped = `inset(-9999px ${-pageWidth * TILE_CROP_SIDE}px ${pageHeight * TILE_CROP_BOTTOM}px ${pageWidth * (1 - TILE_CROP_SIDE)}px)`;
  const clipOpen = `inset(-9999px -9999px ${-pageHeight * 0.1}px -9999px)`;
  const originX = rootRect.width * 0.75;
  const originY = pageHeight / 2;
  const pose = getBookPose(tileId, { coverAngle: CLOSED_BOOK.coverAngle, pageAngle: CLOSED_BOOK.pageAngle });
  if (!pose) {
    return {
      dx: 0,
      dy: 0,
      scale: 0.45,
      originX,
      originY,
      perspectiveOriginY: originY,
      perspective: (CLOSED_BOOK.perspective * pageWidth) / 0.45,
      coverAngle: CLOSED_BOOK.coverAngle,
      pageAngle: CLOSED_BOOK.pageAngle,
      flyerTurn,
      flyerTilt,
      flipped,
      clipCropped,
      clipOpen,
    };
  }
  const scale = pose.height / pageHeight;
  return {
    dx: pose.cx - (rootRect.left + originX),
    dy: pose.cy - (rootRect.top + originY),
    scale,
    originX,
    originY,
    // In the frame's own (unscaled) px, so the tile's lift is ÷ scale.
    perspectiveOriginY: originY - pose.lift / scale,
    // The tile projects its book with perspective = k × its frame width;
    // ours is applied inside a frame scaled by `scale`, so it's that ÷ scale.
    perspective: (CLOSED_BOOK.perspective * pose.frameWidth) / scale,
    coverAngle: pose.coverAngle,
    pageAngle: pose.pageAngle,
    flyerTurn,
    flyerTilt,
    flipped,
    clipCropped,
    clipOpen,
  };
}

// Selectors, scoped to the root by useAnimate. (The scrim sits outside that
// root, up on the overlay, so it's passed in as an element.)
const FRAME = "[data-frame]";
const FLYER = "[data-flyer]";
const COVER = leafSelector(0);
const PAGE_FRONT = leafSelector(1);
const BASE = "[data-book-base]";
// A finished tile's back cover, staggered like the base sheet it sits against.
const BACK = "[data-book-back]";
const EXTRAS = "[data-extra]";
// The next page's number showing through the cover's dog-ear (ClosedBook's
// RevealedPageMark) — only there once a task's done, and only meant to be
// seen under the closed cover, so it goes as the cover swings open.
const PAGE_MARK = "[data-page-mark]";

// Writes the closed-at-the-tile pose as plain inline styles, so the first
// painted frame already has the book over the tile before the animation's
// first tick has run. (Motion then takes the values over from its own
// keyframes — its transform order is translate → scale → rotate, matched
// here.)
function poseAtTile(frame: HTMLElement, flyer: HTMLElement, cover: HTMLElement, page: HTMLElement, base: HTMLElement, back: HTMLElement | null, f: Flight) {
  frame.style.transformOrigin = `${f.originX}px ${f.originY}px`;
  frame.style.perspectiveOrigin = `${f.originX}px ${f.perspectiveOriginY}px`;
  frame.style.perspective = `${f.perspective}px`;
  frame.style.transform = `translateX(${f.dx}px) translateY(${f.dy}px) scale(${f.scale})`;
  frame.style.clipPath = f.clipCropped;
  flyer.style.transformOrigin = `${f.originX}px ${f.originY}px`;
  flyer.style.transform = `rotateX(${f.flyerTilt}deg) rotateY(${f.flyerTurn}deg)`;
  cover.style.transform = `rotateY(${f.coverAngle}deg)`;
  page.style.transform = `${FIRST_LEAF_STAGGER_CSS} rotateY(${f.pageAngle}deg)`;
  base.style.transform = `${BASE_STAGGER_CSS} translateZ(${-BASE_DEPTH}px)`;
  if (back) back.style.transform = `${BACK_STAGGER_CSS} translateZ(${-BACK_DEPTH}px) rotateY(180deg)`;
}

// The closed book's stagger — the first leaf and the base sheet poking out
// from under the cover — and the open book's flush stack. Explicit start
// values everywhere: these are plain elements whose inline transform
// Motion can't reliably read the stagger back out of, and animating from
// a wrong guess is a visible snap.
const FLUSH = { y: "0%", scaleX: 1, scaleY: 1 };
const PAGE_TO_FLUSH = {
  y: [FIRST_LEAF_STAGGER.y, FLUSH.y],
  scaleX: [FIRST_LEAF_STAGGER.scaleX, FLUSH.scaleX],
  scaleY: [FIRST_LEAF_STAGGER.scaleY, FLUSH.scaleY],
};
const PAGE_TO_STAGGERED = FIRST_LEAF_STAGGER;
const BASE_TO_FLUSH = {
  y: [BASE_STAGGER.y, FLUSH.y],
  scaleX: [BASE_STAGGER.scaleX, FLUSH.scaleX],
  scaleY: [BASE_STAGGER.scaleY, FLUSH.scaleY],
  z: -BASE_DEPTH,
};
const BASE_TO_STAGGERED = { ...BASE_STAGGER, z: -BASE_DEPTH };
// The back cover moves with the base: staggered while closed, flush once open.
const BACK_TO_FLUSH = {
  x: [BACK_STAGGER.x, "0%"],
  y: [BACK_STAGGER.y, FLUSH.y],
  scaleX: [BACK_STAGGER.scaleX, FLUSH.scaleX],
  scaleY: [BACK_STAGGER.scaleY, FLUSH.scaleY],
  z: -BACK_DEPTH,
  rotateY: 180,
};
const BACK_TO_STAGGERED = { ...BACK_STAGGER, z: -BACK_DEPTH, rotateY: 180 };

// Paced with COVER_SWING (~0.65x the original) rather than TURN_DURATION's
// faster 0.5x — every duration and `at` here is the pre-speedup value
// ×0.65.
const FLIGHT_SPRING = { type: "spring", duration: 0.52, bounce: 0.2 } as const;

function enterSequence(backdrop: Element, burst: Element, from: Flight, hasMark: boolean, hasPin: boolean): AnimationSequence {
  return [
    // (A selector matching nothing is skipped, hence the flag.)
    ...(hasMark ? ([[PAGE_MARK, { opacity: 0 }, { duration: 0.15, ease: "easeOut", at: 0.26 }]] as AnimationSequence) : []),
    [backdrop, { opacity: 1 }, { duration: 0.29, ease: "easeOut", at: 0 }],
    // Take off: one spring for the whole trip so it arrives with a little
    // overshoot, like something landing in your hands. The frame carries
    // the move and the growth, the flyer inside straightens up — same
    // spring, so they read as one motion.
    [FRAME, { x: [from.dx, 0], y: [from.dy, 0], scale: [from.scale, 1] }, { ...FLIGHT_SPRING, at: 0 }],
    // (A finished tile's book takes off on its back cover and turns over to
    // its front on the way — FLYER's start angle carries the extra half turn.)
    [FLYER, { rotateX: [from.flyerTilt, 0], rotateY: [from.flyerTurn, 0] }, { ...FLIGHT_SPRING, at: 0 }],
    // The tile's crop lets go as the book lifts out of its slot — and the
    // closed-book stagger (the first leaf and base sheet poking a hair past
    // the cover, which is exactly what the crop was hiding) has to be gone
    // by that same moment, or the page stack pokes out past where the crop
    // used to sit, bare, for the rest of the flight. So it resolves on that
    // same fast, early beat, independently of the fan angle below.
    [FRAME, { clipPath: [from.clipCropped, from.clipOpen] }, { duration: 0.13, ease: "easeOut", at: 0 }],
    [PAGE_FRONT, PAGE_TO_FLUSH, { duration: 0.13, ease: "easeOut", at: 0 }],
    [BASE, BASE_TO_FLUSH, { duration: 0.13, ease: "easeOut", at: 0 }],
    ...(from.flipped ? ([[BACK, BACK_TO_FLUSH, { duration: 0.13, ease: "easeOut", at: 0 }]] as AnimationSequence) : []),
    // Cover swings open while the book is still settling — the two overlap
    // so it reads as one continuous gesture, not fly-then-open. The first
    // leaf's own fan angle flattens on the cover's own schedule.
    [COVER, { rotateY: [from.coverAngle, OPEN_ANGLE] }, { duration: COVER_SWING, ease: TURN_EASE, at: 0.26 }],
    [PAGE_FRONT, { rotateY: [from.pageAngle, 0] }, { duration: 0.39, ease: TURN_EASE, at: "<" }],
    // The beams wait for the cover to actually finish swinging open —
    // they're the last thing to arrive, once there's a settled book to
    // shine behind, not a hint of light before it's even open.
    [burst, { opacity: 1 }, { duration: 0.33, ease: "easeOut", at: 0.26 + COVER_SWING }],
    // Then the trimmings pop in on top.
    [EXTRAS, { opacity: [0, 1], scale: [0.4, 1] }, { type: "spring", duration: 0.39, bounce: 0.45, delay: stagger(0.04), at: 0.55 }],
    // The artwork lands on the contents page with them, and gets its tack.
    ...(hasPin ? pinSequence(0.55) : []),
  ];
}

const RETURN_EASE = [0.55, 0.05, 0.6, 0.55] as const;

interface LeafPose {
  angle: number;
  z: number;
}

function exitSequence(
  backdrop: Element,
  burst: Element,
  to: Flight,
  poses: Map<number, LeafPose>,
  spread: number,
  hasMark: boolean,
): AnimationSequence {
  // Paced to match enterSequence — every duration and `at` below is the
  // pre-speedup value ×0.65, the same scale COVER_SWING uses, so closing
  // reads as the opening gesture in reverse rather than a different speed.
  const seq: AnimationSequence = [
    [EXTRAS, { opacity: 0, scale: 0.5 }, { duration: 0.12, ease: "easeIn", at: 0 }],
    // The beams go the instant closing starts, not lingering into it —
    // gone before there's much of anything left open to shine behind.
    [burst, { opacity: 0 }, { duration: 0.2, ease: "easeIn", at: 0 }],
  ];
  // Any leaves the reader turned flip back first, last-turned first, so the
  // cover has a closed stack to shut over. The first leaf comes to rest at
  // whatever fan angle the cell's copy is holding right now.
  for (let k = spread; k >= 1; k--) {
    const pose = poses.get(k) ?? { angle: 0, z: 0 };
    const at = (spread - k) * 0.045;
    seq.push([leafSelector(k), { rotateY: k === 1 ? to.pageAngle : 0 }, { duration: 0.29, ease: TURN_EASE, at }]);
    seq.push(...depthSegments(leafSelector(k), pose.z, leafDepth(k, 1), at, 0.29));
  }
  const lead = spread >= 1 ? 0.2 + (spread - 1) * 0.045 : 0;
  if (spread === 0) {
    seq.push([PAGE_FRONT, { rotateY: to.pageAngle }, { duration: 0.26, ease: "easeIn", at: 0.1 }]);
  }
  const coverPose = poses.get(0) ?? { angle: OPEN_ANGLE, z: 0 };
  seq.push(
    // Cover closes over the pages.
    [COVER, { rotateY: to.coverAngle }, { duration: 0.36, ease: [0.55, 0, 0.3, 1], at: 0.03 + lead }],
    // The revealed page number comes back as the cover settles over it.
    ...(hasMark ? ([[PAGE_MARK, { opacity: 1 }, { duration: 0.15, ease: "easeIn", at: 0.24 + lead }]] as AnimationSequence) : []),
    ...depthSegments(COVER, coverPose.z, 0, 0.03 + lead, 0.36),
    // Then it shrinks back down to its tile, sliding into the tile's slot
    // (the crop) over the last stretch. No fade-out: it lands fully visible
    // and the cell's own copy takes over on the same frame it's unmounted
    // (see `finish` in FlyingBook).
    [FRAME, { x: to.dx, y: to.dy, scale: to.scale }, { duration: 0.33, ease: RETURN_EASE, at: 0.26 + lead }],
    [FLYER, { rotateX: to.flyerTilt, rotateY: to.flyerTurn }, { duration: 0.33, ease: RETURN_EASE, at: 0.26 + lead }],
    // The stagger snaps back in sync with the crop, not before it — earlier
    // and the page stack would poke out past where the crop's about to sit,
    // bare, for a beat.
    [PAGE_FRONT, PAGE_TO_STAGGERED, { duration: 0.1, ease: "easeIn", at: 0.49 + lead }],
    [BASE, BASE_TO_STAGGERED, { duration: 0.1, ease: "easeIn", at: 0.49 + lead }],
    ...(to.flipped ? ([[BACK, BACK_TO_STAGGERED, { duration: 0.1, ease: "easeIn", at: 0.49 + lead }]] as AnimationSequence) : []),
    [FRAME, { clipPath: to.clipCropped }, { duration: 0.1, ease: "easeIn", at: 0.49 + lead }],
    [backdrop, { opacity: 0 }, { duration: 0.26, ease: "easeIn", at: 0.29 + lead }],
  );
  return seq;
}

// prefers-reduced-motion: no flight, no page turn — the book just appears
// open, with a plain crossfade.
function reducedEnterSequence(backdrop: Element, burst: Element): AnimationSequence {
  return [
    [backdrop, { opacity: 1 }, { duration: 0.15, at: 0 }],
    [burst, { opacity: 1 }, { duration: 0.15, at: 0 }],
    [`${FRAME}, ${EXTRAS}`, { opacity: [0, 1] }, { duration: 0.15, at: 0 }],
  ];
}
function reducedExitSequence(backdrop: Element, burst: Element): AnimationSequence {
  return [
    [backdrop, { opacity: 0 }, { duration: 0.12, at: 0 }],
    [burst, { opacity: 0 }, { duration: 0.12, at: 0 }],
    [`${FRAME}, ${EXTRAS}`, { opacity: 0 }, { duration: 0.12, at: 0 }],
  ];
}

// ---- The peel ---------------------------------------------------------

/** Sutherland–Hodgman against one half-plane: the part of `poly` where `signedDistance` ≤ 0. */
function clipPolygon(poly: Point[], signedDistance: (p: Point) => number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = signedDistance(a);
    const db = signedDistance(b);
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const toClipPolygon = (poly: Point[]) => `polygon(${poly.map((p) => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(", ")})`;

/**
 * Where a page is folded, and how. Worked out on one canonical page: width
 * W, height H, spine at x = 0, outer edge at x = W. `depth` is how far in
 * from the outer edge the page's edge has been brought (0 = flat; W×2 has
 * the fold at the spine, the page fully turned over); `v` is where along
 * the edge it's held, from -1 (top corner) through 0 (middle) to 1 (bottom
 * corner).
 *
 * The fold line passes midway between the edge and where the edge has been
 * brought to, at height `v`, so under a pointer the page's edge lands
 * right on it. Its angle runs from vertical at the middle of the edge (a
 * rectangular strip peels back) to 45° at a corner (a corner triangle),
 * tilting toward whichever corner's nearer.
 *
 * `kept` is the part of the page left in place, for the face's clip-path. Its
 * outer sides run `bleed` past the page's own edges: a clip-path clips the
 * element's box-shadow too, so a clip at the page's edge would cut off a
 * left-hand page's lifted shadow the moment a peel began (and it would come
 * back when the peel ended). Only the fold side and the spine cut.
 */
function peelGeometry(W: number, H: number, depth: number, v: number, bleed = 0) {
  const y = (H / 2) * (1 + Math.max(-1, Math.min(1, v)));
  const toward = v >= 0 ? 1 : -1;
  const theta = Math.min(1, Math.abs(v)) * (Math.PI / 4);
  // Unit normal pointing out toward the peeled part.
  const n = { x: Math.cos(theta), y: toward * Math.sin(theta) };
  const fold = { x: W - depth / 2, y };
  const dist = (p: Point) => (p.x - fold.x) * n.x + (p.y - fold.y) * n.y;
  const page: Point[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  // Not past the spine (x = 0), though: a left-hand page's shadow reaching
  // over the facing page would come and go as the stacks' depths shuffle.
  const withBleed: Point[] = [
    { x: 0, y: -bleed },
    { x: W + bleed, y: -bleed },
    { x: W + bleed, y: H + bleed },
    { x: 0, y: H + bleed },
  ];
  const kept = clipPolygon(withBleed, dist);
  const peeled = clipPolygon(page, (p) => -dist(p));
  const reflect = (p: Point) => {
    const d = dist(p);
    return { x: p.x - 2 * d * n.x, y: p.y - 2 * d * n.y };
  };
  return { kept, folded: peeled.map(reflect), fold, n, reflect };
}

// How far past a peeling face's edges its clip-path reaches, as a fraction of the page's width: enough to keep the
// whole of a lifted page's shadow (ClosedBook's LIFTED_PAGE_SHADOW: offset + blur, 0.06 of a page).
const PEEL_CLIP_BLEED = 0.1;
// A page face's clip-path when it isn't peeling: the same reach past its edges as a peel's, and cut at the spine
// (see the frame's comment). inset() runs top, right, bottom, left; a front face's spine is its left, a back face's
// its right.
const REST_BLEED = `-${PEEL_CLIP_BLEED * 100}%`;
const REST_FRONT_CLIP = `inset(${REST_BLEED} ${REST_BLEED} ${REST_BLEED} 0)`;
const REST_BACK_CLIP = `inset(${REST_BLEED} 0 ${REST_BLEED} ${REST_BLEED})`;

interface PageSwipe {
  begin: (leaf: number, side: Side) => boolean;
  move: (leaf: number, side: Side, travel: number, clientY: number) => void;
  end: (leaf: number, side: Side, travel: number, velocity: number, cancelled: boolean) => void;
  scroll: (dy: number) => void;
  scrollEnd: (velocity: number) => void;
}

interface CurlState {
  leaf: number;
  side: Side;
  depth: number;
  v: number;
  /** Opacity of the shadow the fold-back casts (default CURL_SHADOW); fades out over a turn. */
  shadow?: number;
  /** Opacity of the ink line along the crease (default 1); fades out at the end of a forward turn. */
  crease?: number;
}

const CURL_SHADOW = 0.4;

/** The book-level elements the peel draws into. */
interface CurlDom {
  frame: HTMLElement;
  layer: HTMLElement;
  sheet: HTMLElement;
  clip: HTMLElement;
  copy: HTMLElement;
  shade: HTMLElement;
  outline: SVGSVGElement;
  /** The fold-back's own edges, and the crease, drawn separately so the crease can fade on its own. */
  outlineEdges: SVGPathElement;
  outlineCrease: SVGPathElement;
}

function findCurlDom(root: HTMLElement): CurlDom | null {
  const frame = root.querySelector<HTMLElement>(FRAME);
  const layer = root.querySelector<HTMLElement>("[data-curl-layer]");
  const sheet = root.querySelector<HTMLElement>("[data-curl-sheet]");
  const clip = root.querySelector<HTMLElement>("[data-curl-clip]");
  const copy = root.querySelector<HTMLElement>("[data-curl-copy]");
  const shade = root.querySelector<HTMLElement>("[data-curl-shade]");
  const outline = root.querySelector<SVGSVGElement>("[data-curl-outline]");
  const outlineEdges = outline?.querySelector<SVGPathElement>("[data-curl-edges]") ?? null;
  const outlineCrease = outline?.querySelector<SVGPathElement>("[data-curl-crease]") ?? null;
  if (!frame || !layer || !sheet || !clip || !copy || !shade || !outline || !outlineEdges || !outlineCrease) return null;
  return { frame, layer, sheet, clip, copy, shade, outline, outlineEdges, outlineCrease };
}

const faceOf = (root: HTMLElement, leaf: number, side: Side) =>
  root.querySelector<HTMLElement>(`${leafSelector(leaf)} > [data-face="${side}"]`);

/**
 * Draws the page of `state` peeled back, or (null) everything flat.
 *
 * Two things happen. The page's face gets a clip-path that cuts the peeled
 * part away, so whatever's under it (the next leaf) shows through. And the
 * book-level curl layer draws the fold-back: the cut region reflected
 * across the fold, filled with a copy of the page's OTHER side (rendered
 * pre-mirrored by TileDetails, so that after the fold's reflection it reads
 * the right way round — as the print on the back of a real peeled corner
 * does), shaded from crease to tip, outlined in ink at the page's border
 * weight, and casting a shadow. That layer spans both pages, so a turn can
 * carry the fold-back right across the spine onto the facing page.
 *
 * Coordinates: peelGeometry works on a canonical page (spine left, outer
 * edge right). A right-hand page is that page shifted right by one page
 * width; a left-hand page is it mirrored about the spine. A face's own
 * coordinates run outer-edge-right for a front face and outer-edge-left
 * for a back face (see PageFace), which is the same mapping.
 */
function renderCurl(root: HTMLElement, dom: CurlDom, ink: string, state: CurlState | null, prevFace: HTMLElement | null, bounds: HTMLElement | null) {
  if (prevFace) prevFace.style.clipPath = "";
  if (!state || state.depth < 0.5) {
    dom.layer.style.display = "none";
    return;
  }
  const face = faceOf(root, state.leaf, state.side);
  if (!face) {
    dom.layer.style.display = "none";
    return;
  }
  const W = dom.frame.clientWidth / 2;
  const H = dom.frame.clientHeight;
  const { kept, folded, fold, n } = peelGeometry(W, H, state.depth, state.v, W * PEEL_CLIP_BLEED);
  const right = state.side === "front";
  // Canonical → the frame's coordinates (and, one and the same, the face's).
  const px = (x: number) => (right ? W + x : W - x);
  const toFrame = (poly: Point[]) => poly.map((p) => ({ x: px(p.x), y: p.y }));
  const toFace = (poly: Point[]) => poly.map((p) => ({ x: right ? p.x : W - p.x, y: p.y }));

  face.style.clipPath = toClipPolygon(toFace(kept));

  const foldedFrame = toFrame(folded);
  dom.layer.style.display = "block";
  fitCurlLayer(dom, bounds);
  const shadow = state.shadow ?? CURL_SHADOW;
  dom.sheet.style.filter =
    shadow > 0.005
      ? `drop-shadow(${((right ? 1 : -1) * W * 0.006).toFixed(1)}px ${(W * 0.012).toFixed(1)}px ${(W * 0.03).toFixed(1)}px rgba(0,0,0,${shadow.toFixed(3)}))`
      : "none";
  dom.clip.style.clipPath = toClipPolygon(foldedFrame);

  // The copy sits over the page's own box, pre-mirrored across the box's
  // center line; reflecting that across the fold puts the other side's
  // print where the fold-back is, reading correctly. As one affine matrix
  // in the copy's own coordinates (origin its top-left corner).
  const nf = { x: right ? n.x : -n.x, y: n.y };
  const foldF = { x: px(fold.x), y: fold.y };
  const boxLeft = right ? W : 0;
  // Reflection across the fold line: p' = F + R (p - F), R = I - 2nnᵀ
  // (flips the component along the normal, keeps the one along the line).
  const r11 = 1 - 2 * nf.x * nf.x;
  const r12 = -2 * nf.x * nf.y;
  const r22 = 1 - 2 * nf.y * nf.y;
  // Compose with the pre-mirror m(p) = (W - x, y) in box coordinates, then
  // express everything in box coordinates (frame x − boxLeft).
  const fx = foldF.x - boxLeft;
  const fy = foldF.y;
  // p_box → mirrored → frame-relative-to-box reflected:
  //   q = (W - x, y);  p' = F + R (q - F)
  const a = -r11;
  const b = -r12;
  const c = r12;
  const d = r22;
  const e = fx + r11 * (W - fx) + r12 * (0 - fy);
  const f = fy + r12 * (W - fx) + r22 * (0 - fy);
  dom.copy.style.transform = `matrix(${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(5)}, ${d.toFixed(5)}, ${e.toFixed(2)}, ${f.toFixed(2)})`;

  // Shade from the crease to the tip, across the frame: CSS gradient
  // angles run clockwise from "up", and the fold-back lies on the inner
  // side of the fold (-n).
  const dir = { x: -nf.x, y: -nf.y };
  const angle = (Math.atan2(dir.x, -dir.y) * 180) / Math.PI;
  const rad = (angle * Math.PI) / 180;
  const frameW = W * 2;
  const lineLength = Math.abs(frameW * Math.sin(rad)) + Math.abs(H * Math.cos(rad));
  const creaseAt = (foldF.x - frameW / 2) * dir.x + (foldF.y - H / 2) * dir.y + lineLength / 2;
  // The crease shading fades with the cast shadow: a fold-back the size
  // of a whole page with a dark crease band sweeping across it reads as a
  // shadow moving over the print, not paper laying down.
  const t = shadow / CURL_SHADOW;
  const reach = Math.min(state.depth, W) * 0.9;
  dom.shade.style.backgroundImage =
    t > 0.01
      ? `linear-gradient(${angle.toFixed(1)}deg, rgba(0,0,0,${(0.28 * t).toFixed(3)}) ${creaseAt.toFixed(1)}px, rgba(0,0,0,${(0.05 * t).toFixed(3)}) ${(creaseAt + reach * 0.35).toFixed(1)}px, rgba(255,255,255,${(0.18 * t).toFixed(3)}) ${(creaseAt + reach).toFixed(1)}px)`
      : "none";

  // Ink outline at the page's own border weight. The outline sits inside the
  // clipped sheet and is stroked twice as wide, so only its inner half shows:
  // it lies exactly where the page's own CSS border does, and a turn lands
  // with no shift. The crease — the edge on the fold line — is its own path.
  dom.outline.setAttribute("viewBox", `0 0 ${frameW} ${H}`);
  const onFold = (p: Point) => Math.abs((p.x - foldF.x) * nf.x + (p.y - foldF.y) * nf.y) < 0.5;
  let edges = "";
  let crease = "";
  foldedFrame.forEach((a, i) => {
    const b = foldedFrame[(i + 1) % foldedFrame.length]!;
    const seg = `M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}`;
    if (onFold(a) && onFold(b)) crease += seg;
    else edges += seg;
  });
  const strokeWidth = `${face.clientLeft * 2}`;
  for (const path of [dom.outlineEdges, dom.outlineCrease]) {
    path.setAttribute("stroke", ink);
    path.setAttribute("stroke-width", strokeWidth);
  }
  dom.outlineEdges.setAttribute("d", edges);
  dom.outlineCrease.setAttribute("d", crease);
  dom.outlineCrease.setAttribute("stroke-opacity", `${state.crease ?? 1}`);
}

/**
 * Sizes the curl layer to what's visible of the scrolling overlay (`bounds`;
 * its client box, so never over a scrollbar), and keeps the sheet inside it on
 * the book's box. The fold-back may be drawn anywhere on screen, and never past
 * it, which would give the overlay a scrollbar. Only while the book's open,
 * when the frame isn't scaled, so its px are the viewport's.
 */
function fitCurlLayer(dom: CurlDom, bounds: HTMLElement | null) {
  const r = dom.frame.getBoundingClientRect();
  const b = bounds?.getBoundingClientRect();
  // The client box: inside the borders, and short of any scrollbar.
  const minX = b ? b.left + bounds!.clientLeft : 0;
  const minY = b ? b.top + bounds!.clientTop : 0;
  const maxX = b ? minX + bounds!.clientWidth : document.documentElement.clientWidth;
  const maxY = b ? minY + bounds!.clientHeight : document.documentElement.clientHeight;
  // Rounded in, so a fraction of a px never tips it over.
  const top = Math.max(0, Math.floor(r.top - minY));
  const right = Math.max(0, Math.floor(maxX - r.right));
  const bottom = Math.max(0, Math.floor(maxY - r.bottom));
  const left = Math.max(0, Math.floor(r.left - minX));
  dom.layer.style.inset = `${-top}px ${-right}px ${-bottom}px ${-left}px`;
  dom.sheet.style.inset = `${top}px ${right}px ${bottom}px ${left}px`;
}

function FlyingBook({
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
  const [isPresent, safeToRemove] = usePresence();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const overlayRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { colors } = useComic();
  const page = tilePageColors(colors, tile.freeze.isFrozen);
  const tileId = tile.id;

  // Phone view (≤640px): one page at a time. The book is unchanged — the
  // same two-page-wide frame, so the tile↔modal flight and every geometry stay
  // exactly as on desktop — but the closed book sits on its right half and the
  // cover folds a full 180° onto the off-screen left half, revealing the first
  // page (the summary) on the right. Every page is the front of its own leaf
  // (see bookShape), and turning a page lifts that leaf onto the left half.
  const [single, setSingle] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setSingle(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const { lastSpread, leafCount } = bookShape(tile, single);

  // Which spread is open (desktop: 0 = page 1 | page 2; phone: the page
  // showing). `spreadRef` mirrors it synchronously so pointer handlers that
  // race a re-render see the truth.
  const [spread, setSpread] = useState(0);
  const spreadRef = useRef(0);
  // Where each leaf currently is (angle, depth) — the "from" for depth
  // keyframes and what the exit flips back from.
  const poses = useRef<Map<number, LeafPose>>(new Map());
  // Which page the curl layer is showing the other side of, if any.
  const [curlCopy, setCurlCopy] = useState<{ leaf: number; side: Side } | null>(null);

  const flipTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(lastSpread, next));
      if (clamped === spreadRef.current) return;
      spreadRef.current = clamped;
      setSpread(clamped);
    },
    [lastSpread],
  );

  // One step of paging: a spread on desktop, a page on a phone.
  const step = useCallback((dir: 1 | -1) => flipTo(spreadRef.current + dir), [flipTo]);

  // Take off. useLayoutEffect so the measuring + first keyframe land before
  // the browser paints the freshly mounted overlay at rest.
  useLayoutEffect(() => {
    const root = scope.current;
    const frame = root?.querySelector<HTMLElement>(FRAME);
    const flyer = root?.querySelector<HTMLElement>(FLYER);
    const cover = root?.querySelector<HTMLElement>(COVER);
    const page = root?.querySelector<HTMLElement>(PAGE_FRONT);
    const base = root?.querySelector<HTMLElement>(BASE);
    const backdrop = backdropRef.current;
    const burst = burstRef.current;
    // Where every leaf ends up once the book's open: cover turned, the rest
    // stacked on the right.
    for (let k = 0; k < leafCount; k++) poses.current.set(k, { angle: k === 0 ? OPEN_ANGLE : 0, z: leafDepth(k, 1) });
    if (!root || !frame || !flyer || !cover || !page || !base || !backdrop || !burst) {
      setBookAway(tileId);
      return;
    }
    const mark = root.querySelector<HTMLElement>(PAGE_MARK);
    if (reduceMotion) {
      // The book simply appears open, in place.
      cover.style.transform = `rotateY(${OPEN_ANGLE}deg)`;
      page.style.transform = "rotateY(0deg)";
      base.style.transform = `translateZ(${-BASE_DEPTH}px)`;
      base.style.filter = "none";
      const back = root.querySelector<HTMLElement>(BACK);
      if (back) back.style.transform = `translateZ(${-BACK_DEPTH}px) rotateY(180deg)`;
      if (mark) mark.style.opacity = "0";
      setBookAway(tileId);
      animate(reducedEnterSequence(backdrop, burst));
      return;
    }
    // Measure the cell's book BEFORE hiding it, pose our copy over it
    // (inline, so it's there on the first paint), and only then hide the
    // original — both changes land in this same layout pass, so the swap
    // is invisible.
    const flight = measureFlight(root, tileId, tile.progress.allComplete);
    poseAtTile(frame, flyer, cover, page, base, root.querySelector<HTMLElement>(BACK), flight);
    const hasPin = !!root.querySelector(PIN_ART);
    if (hasPin) hidePin(root);
    // The base sheet's shadow only belongs to the closed book (see
    // BASE_SHADOW) — drop it right here, at the swap, while it's still
    // occluded under the cover either way.
    base.style.filter = "none";
    frame.style.opacity = "1";
    setBookAway(tileId);
    // Once open, the book lies flat, so the perspective does nothing but
    // project the leaves' small depth offsets a hair bigger or smaller: a page
    // turn shuffles those depths, which would shift whole pages by a pixel as
    // it starts and lands. The fly-home sets it again before it moves.
    animate(enterSequence(backdrop, burst, flight, !!mark, hasPin)).then(() => {
      frame.style.perspective = "none";
      // clipOpen stops a little below the book (it has to animate from the
      // tile's crop); open, nothing's cut, so a fold-back swung past the
      // book's bottom isn't either. The fly-home puts clipOpen back.
      frame.style.clipPath = "none";
    });
    // Runs once, on mount: the flight is from wherever the tile was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The peel in progress, if any: which face, how far, and the animation
  // easing it (shut, or on over the spine) if one's running.
  const curling = useRef<{ state: CurlState; face: HTMLElement; anim: AnimationPlaybackControls | null } | null>(null);
  const turning = useRef(false);

  const draw = useCallback(
    (state: CurlState | null) => {
      const root = scope.current;
      if (!root) return;
      const dom = findCurlDom(root);
      if (!dom) return;
      const prev = curling.current;
      const prevFace = prev && (!state || prev.state.leaf !== state.leaf || prev.state.side !== state.side) ? prev.face : null;
      renderCurl(root, dom, page.LINE, state, prevFace, overlayRef.current);
      if (!state) {
        if (prev) prev.face.style.clipPath = "";
        curling.current = null;
        return;
      }
      const face = faceOf(root, state.leaf, state.side);
      if (!face) return;
      curling.current = { state, face, anim: prev && prev.face === face ? prev.anim : null };
    },
    [page.LINE, scope],
  );

  // The hover curl: `at` is the pointer in viewport coordinates, or null to
  // let the page settle flat again, which eases the crease back out to the
  // edge rather than snapping. Direct DOM writes per move, so it tracks the
  // pointer exactly. Hands off while a turn is in progress.
  const curl = useCallback(
    (leaf: number, side: Side, at: Point | null) => {
      const root = scope.current;
      const frame = root?.querySelector<HTMLElement>(FRAME);
      if (!root || !frame || turning.current) return;
      const current = curling.current;
      if (at) {
        current?.anim?.stop();
        const rect = frame.getBoundingClientRect();
        const W = rect.width / 2;
        const H = rect.height;
        const spineX = rect.left + W;
        const fromSpine = side === "front" ? at.x - spineX : spineX - at.x;
        const depth = Math.min(W * MAX_HOVER_PEEL, Math.max(0, W - fromSpine));
        const v = (at.y - rect.top - H / 2) / (H / 2);
        if (!current || current.state.leaf !== leaf || current.state.side !== side) setCurlCopy({ leaf, side });
        draw({ leaf, side, depth, v });
        return;
      }
      if (!current) return;
      const { state } = current;
      const anim = animateValue(state.depth, 0, {
        duration: 0.22,
        ease: "easeOut",
        onUpdate: (depth) => draw({ ...state, depth }),
        onComplete: () => {
          draw(null);
          setCurlCopy(null);
        },
      });
      current.anim = anim;
    },
    [draw, scope],
  );

  // The touch peel (phones), driven by the edge zones. The fold follows the
  // finger's travel from where it landed: a front face's page peels in from its
  // outer edge (depth = travel), while a back face — the previous page, lying
  // on the half of the book that's off-screen — has to be dragged a whole page
  // width before any of it shows (depth = W + travel). A release past the
  // threshold turns the page (the [spread] effect carries on from wherever the
  // finger left the fold); anything less eases the fold back out.
  const frameSize = useCallback(() => {
    const frame = scope.current?.querySelector<HTMLElement>(FRAME);
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    return { rect, W: rect.width / 2, H: rect.height };
  }, [scope]);

  const swipe = useMemo(
    () => ({
      begin: (leaf: number, side: Side) => {
        if (turning.current) return false;
        curling.current?.anim?.stop();
        setCurlCopy({ leaf, side });
        return true;
      },
      move: (leaf: number, side: Side, travel: number, clientY: number) => {
        const size = frameSize();
        if (!size) return;
        const { rect, W, H } = size;
        const depth = side === "back" ? W + Math.min(travel, W) : Math.min(travel, 2 * W);
        const v = Math.max(-1, Math.min(1, (clientY - rect.top - H / 2) / (H / 2)));
        draw({ leaf, side, depth, v });
      },
      end: (leaf: number, side: Side, travel: number, velocity: number, cancelled: boolean) => {
        const size = frameSize();
        const W = size?.W ?? 0;
        const commit = !cancelled && (travel >= W * SWIPE_COMMIT || (velocity >= SWIPE_FLICK && travel >= SWIPE_FLICK_MIN_TRAVEL));
        if (commit) {
          flipTo(spreadRef.current + (side === "front" ? 1 : -1));
          return;
        }
        const current = curling.current;
        if (!current) {
          setCurlCopy(null);
          return;
        }
        const { state } = current;
        current.anim?.stop();
        current.anim = animateValue(state.depth, side === "back" ? W : 0, {
          duration: 0.22,
          ease: "easeOut",
          onUpdate: (depth) => draw({ ...state, depth }),
          onComplete: () => {
            draw(null);
            setCurlCopy(null);
          },
        });
      },
      // A vertical drag that started in a zone scrolls the page beneath it.
      scroll: (dy: number) => {
        const scroller = scope.current?.querySelector<HTMLElement>(`${leafSelector(spreadRef.current + 1)} > [data-face="front"] .overflow-y-auto`);
        if (!scroller) return;
        stopFling(scroller);
        scroller.scrollBy({ top: dy });
      },
      scrollEnd: (velocity: number) => {
        const scroller = scope.current?.querySelector<HTMLElement>(`${leafSelector(spreadRef.current + 1)} > [data-face="front"] .overflow-y-auto`);
        if (scroller) fling(scroller, velocity);
      },
    }),
    [draw, flipTo, frameSize, scope],
  );

  // Turn the pages. The leaf crossing the spine does so as a peel: from
  // wherever the reader has it curled (or from the middle of its edge),
  // the fold sweeps across the page to the spine, the fold-back growing
  // over the facing page, and at the end the leaf is put into its turned
  // position underneath — the same picture — and the fold-back taken away.
  // Meanwhile the other leaves shuffle a hair in depth so the two stacks
  // keep sorting.
  const prevSpread = useRef(0);
  useEffect(() => {
    const previous = prevSpread.current;
    if (spread === previous) return;
    const forward = spread > previous;
    prevSpread.current = spread;
    const turned = spread + 1;
    const root = scope.current;
    // The leaf that crosses is the one on top of the stack it's leaving:
    // forward, the right-hand page's leaf; back, the left-hand page's. A jump
    // of more than one page (a contents row) carries the leaves in between
    // over with it — they're hidden under the crossing leaf, so they just
    // change sides.
    const leaf = forward ? previous + 1 : previous;
    const skipped = (k: number) => (forward ? k > previous + 1 && k <= spread : k > spread && k < previous);
    // After a jump forward, the page that ends up on top of the right-hand stack
    // is what the crossing leaf's peel should uncover.
    const uncovered = forward && spread > previous + 1 ? turned : -1;
    const side: Side = forward ? "front" : "back";
    const turn = reduceMotion ? 0 : TURN_DURATION;

    const setLeaf = (k: number, angle: number, z: number) => {
      const el = root?.querySelector<HTMLElement>(leafSelector(k));
      // Inline first so the very next paint has it there, then tell Motion
      // so its own values agree.
      if (el) el.style.transform = `translateZ(${z}px) rotateY(${angle}deg)`;
      animate(leafSelector(k), { rotateY: angle, z }, { duration: 0 });
    };

    const seq: AnimationSequence = [];
    for (let k = 0; k < leafCount; k++) {
      const pose = poses.current.get(k) ?? { angle: 0, z: 0 };
      const z = leafDepth(k, turned);
      if (skipped(k)) setLeaf(k, forward ? OPEN_ANGLE : 0, z);
      else if (k === uncovered) {
        setLeaf(k, 0, -LEAF_GAP / 2);
        seq.push([leafSelector(k), { z: [-LEAF_GAP / 2, z] }, { duration: 0.1, at: turn }]);
      } else if (k !== leaf) seq.push(...depthSegments(leafSelector(k), pose.z, z, 0, turn));
      poses.current.set(k, { angle: k < turned ? OPEN_ANGLE : 0, z });
    }
    if (seq.length) animate(seq);

    const target = forward ? OPEN_ANGLE : 0;
    const land = () => setLeaf(leaf, target, leafDepth(leaf, turned));
    if (reduceMotion || !root) {
      land();
      draw(null);
      setCurlCopy(null);
      return;
    }
    turning.current = true;
    const current = curling.current;
    const from =
      current && current.state.leaf === leaf && current.state.side === side ? current.state : { leaf, side, depth: 0, v: 0 };
    current?.anim?.stop();
    setCurlCopy({ leaf, side });
    const W = (root.querySelector<HTMLElement>(FRAME)?.clientWidth ?? 0) / 2;
    const anim = animateValue(0, 1, {
      duration: turn,
      ease: TURN_EASE,
      // The fold sweeps to the spine and straightens up; the shadow it casts
      // fades away as the page lays itself down.
      onUpdate: (p) =>
        draw({
          leaf,
          side,
          depth: from.depth + (2 * W - from.depth) * p,
          v: from.v * (1 - p),
          // Gone by a third of the way across.
          shadow: CURL_SHADOW * Math.max(0, 1 - p * 3),
          // Landing on the left, the crease ends up at the spine, where the
          // left-hand page has no border (the right-hand page's own border
          // draws that line): fade it out over the last stretch rather than
          // have it double that line and then vanish.
          crease: side === "front" ? Math.min(1, Math.max(0, (1 - p) / 0.2)) : 1,
        }),
      onComplete: () => {
        land();
        // Let the landed leaf paint before the fold-back goes, so there's
        // never a frame with neither.
        requestAnimationFrame(() => {
          draw(null);
          setCurlCopy(null);
          turning.current = false;
        });
      },
    });
    curling.current = { state: from, face: faceOf(root, leaf, side)!, anim };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread]);

  // Fly home. AnimatePresence has already dropped us from its children
  // (isPresent false) but keeps us mounted until safeToRemove.
  useEffect(() => {
    if (isPresent) return;
    const root = scope.current;
    const frame = root?.querySelector<HTMLElement>(FRAME);
    const base = root?.querySelector<HTMLElement>(BASE);
    const backdrop = backdropRef.current;
    const burst = burstRef.current;
    // Let the board take clicks straight away — the overlay's just scenery now.
    if (overlayRef.current) overlayRef.current.style.pointerEvents = "none";
    curling.current?.anim?.stop();
    draw(null);
    // Both updates are batched into one React commit: the cell's copy
    // reappears on exactly the frame this one is unmounted, no fade
    // either side.
    const finish = () => {
      setBookAway(null);
      safeToRemove();
    };
    if (!root || !frame || !base || !backdrop || !burst) {
      finish();
      return;
    }
    // Bring the base sheet's shadow back before it's closed again — it's
    // occluded under the cover regardless of exactly when in the close it
    // returns.
    base.style.filter = baseShadow(colors, tile.progress.allComplete);
    if (reduceMotion) {
      animate(reducedExitSequence(backdrop, burst)).then(finish, finish);
      return;
    }
    // Re-measured: the board may have scrolled, or the tile changed size,
    // since the book took off. The perspective can be swapped for the
    // landing's right now, unseen: the open book is flat (no tilt, every
    // leaf lying flat), so it projects the same at any depth.
    const flight = measureFlight(root, tileId, tile.progress.allComplete);
    frame.style.clipPath = flight.clipOpen;
    frame.style.perspective = `${flight.perspective}px`;
    frame.style.perspectiveOrigin = `${flight.originX}px ${flight.perspectiveOriginY}px`;
    animate(exitSequence(backdrop, burst, flight, poses.current, spreadRef.current, !!root.querySelector(PAGE_MARK))).then(finish, finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  // Arrow keys turn the pages. On the document rather than the dialog, so
  // they work wherever focus has ended up inside the modal — but not while
  // typing in a field.
  useEffect(() => {
    if (!isPresent) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      // Nor behind the artwork's full-size view.
      if (target?.closest(ART_VIEWER)) return;
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isPresent, step]);

  return (
    <ModalOverlay
      ref={overlayRef}
      isOpen
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      // On a phone the book is drawn twice the screen's width (see `single`);
      // the half that's off-screen must not scroll, and neither may the overlay
      // itself: the book is sized to fit (PHONE_BOOK_MAX_WIDTH), and only a page's
      // own content scrolls, so nothing competes with the page-turn gestures.
      className={`fixed inset-0 z-50 p-4 ${single ? "overflow-hidden" : "overflow-y-auto"}`}
    >
      {/* The scrim is its own layer (not the overlay's background) so it
          can fade on its own clock while the book's in flight above it. */}
      <div ref={backdropRef} className="pointer-events-none fixed inset-0 bg-scrim/70" style={{ opacity: 0 }} />
      <ComicBurst burstRef={burstRef} reduceMotion={!!reduceMotion} tint={tile.progress.allComplete ? colors.OK : undefined} />
      {/* min-h-full + a centering flex child (rather than centering the
          scroll container itself) so tall content — the book plus its
          floating title and the nav — scrolls into view instead of having
          its top clipped by the centering. */}
      <div className={`flex min-h-full items-center justify-center ${single ? "" : "py-10"}`}>
        {/* Width is what sizes the book (it's 4:3), so it's capped by the
            viewport's height too — an open comic should fit on screen. */}
        <AriaModal className="w-full outline-none" style={{ maxWidth: single ? PHONE_BOOK_MAX_WIDTH : BOOK_MAX_WIDTH }}>
          <AriaDialog aria-label={tile.name} className="outline-none">
            <TileDetails
              ref={scope}
              tile={tile}
              colors={colors}
              spread={spread}
              lastSpread={lastSpread}
              curlCopy={curlCopy}
              single={single}
              onFlipTo={flipTo}
              onStep={step}
              onCurl={curl}
              swipe={swipe}
              onClose={onClose}
              onSubmit={onSubmit}
              onToggleInterest={onToggleInterest}
            />
          </AriaDialog>
        </AriaModal>
      </div>
    </ModalOverlay>
  );
}

function TileDetails({
  ref,
  tile,
  colors,
  spread,
  lastSpread,
  curlCopy,
  single,
  onFlipTo,
  onStep,
  onCurl,
  swipe,
  onClose,
  onSubmit,
  onToggleInterest,
}: {
  ref: Ref<HTMLDivElement>;
  tile: TileModel;
  colors: ComicColors;
  spread: number;
  lastSpread: number;
  curlCopy: { leaf: number; side: Side } | null;
  /** Phone view: one page at a time (the book's right half; see bookShape). */
  single: boolean;
  onFlipTo: (spread: number) => void;
  /** One step of paging: a spread on desktop, a page on a phone. */
  onStep: (dir: 1 | -1) => void;
  onCurl: (leaf: number, side: Side, at: Point | null) => void;
  /** Phone touch peel (see FlyingBook.swipe). */
  swipe: PageSwipe;
  onClose: () => void;
  onSubmit?: (taskId?: string) => void;
  onToggleInterest?: (taskId: string) => void;
}) {
  const TaskPanel = useSlot("TaskPanel");
  const tokens = useThemeTokens();
  const { pageCount, innerLeaves } = bookShape(tile, single);
  const ordered = orderTasks(tile);
  // What's printed on the pages is drawn in the page stock, not the surrounding theme.
  const page = tilePageColors(colors, tile.freeze.isFrozen);

  // The artwork's full-size view, and the picture that opened it, for focus
  // to go back to.
  const [artOpen, setArtOpen] = useState(false);
  const artTrigger = useRef<HTMLElement | null>(null);

  // The pages, in reading order.
  const pages: ReactNode[] = [
    <SummaryPage
      key="summary"
      tile={tile}
      ordered={ordered}
      colors={page}
      onGoToTask={(position) => {
        // Phone: the task at `position` is page index position + 1, and the spread IS the page
        // index. Desktop: it is page position + 2 (1-based), and odd pages are left-hand.
        onFlipTo(single ? position + 1 : Math.floor((position + 1) / 2));
      }}
      onOpenArt={(trigger) => {
        artTrigger.current = trigger;
        setArtOpen(true);
      }}
      onSubmit={onSubmit}
      onToggleInterest={onToggleInterest ? () => onToggleInterest(ordered[0]?.task.id ?? "") : undefined}
    />,
    ...ordered.map(({ task, number }) => (
      <TaskPage
        key={task.id}
        tile={tile}
        task={task}
        number={number}
        colors={page}
        TaskPanel={TaskPanel}
        onSubmit={onSubmit}
        onToggleInterest={onToggleInterest}
      />
    )),
    <SubmissionsPage key="submissions" submissions={tile.submissions} colors={page} />,
  ];

  // Page i (0-based) as it appears on a face: numbered and scrollable.
  // Fronts are right-hand pages, backs left-hand ones. The copy drawn on a
  // fold-back keeps its gutter shadow: that only comes into the fold-back
  // as the fold reaches the spine, which is where the real page's is, so a
  // turn lands without the shadow popping in.
  // What a page is, printed at its spine-side foot: contents, part k of m,
  // or the submissions. Blank if beyond pageCount.
  const roleOf = (i: number) => {
    if (i < 0 || i >= pageCount) return "";
    if (i === 0) return "Contents";
    if (i === pageCount - 1) return "Submissions";
    return ordered[i - 1] ? `Part ${ordered[i - 1].number} of ${tile.tasks.length}` : "";
  };
  const face = (i: number, side: Side): ReactNode => (
    <PageColorsContext.Provider value={page}>
      <BookPage colors={page} side={side === "front" ? "right" : "left"} no={i + 1} role={roleOf(i)} dragScroll={single}>
        {pages[i]}
      </BookPage>
    </PageColorsContext.Provider>
  );
  // Leaf k (1-based) carries page 2k on its front and 2k+1 on its back —
  // pages[2k-1] and pages[2k] here. On a phone every page is on the front of its
  // own leaf (leaf k = pages[k-1]) and the backs are blank paper.
  const leaves: LeafFaces[] = Array.from({ length: innerLeaves }, (_, idx) => {
    const k = idx + 1;
    if (single) return { front: face(k - 1, "front"), back: undefined };
    return {
      front: 2 * k - 1 < pageCount ? face(2 * k - 1, "front") : undefined,
      back: 2 * k < pageCount ? face(2 * k, "back") : undefined,
    };
  });

  // What the curl layer shows on the fold-back: the OTHER side of the page
  // being peeled — a front face's leaf's back (page 2k+1), or a back
  // face's front (page 2k) — ticks included, so they're there the moment
  // any peel shows, not just once the turn lands on the real leaf face.
  const copySide: Side | null = curlCopy ? (curlCopy.side === "front" ? "back" : "front") : null;
  const copyContent: ReactNode = (() => {
    if (!curlCopy || !copySide) return null;
    const k = curlCopy.leaf;
    if (single) {
      // The other side of a leaf's front is blank paper; the other side of its (blank) back is the page.
      return k >= 1 && k <= pageCount && curlCopy.side === "back" ? face(k - 1, "front") : null;
    }
    const i = curlCopy.side === "front" ? 2 * k : 2 * k - 1;
    if (k < 1 || i >= pageCount) return null;
    return face(i, copySide);
  })();

  return (
    // The root is the size reference: `--bw` (the closed book's width, which
    // every length in ClosedBook is a fraction of) is half of it — one page
    // of the two-page spread.
    // On a phone (`single`) the root is ONE page wide, so `--bw` is all of it,
    // and the pan wrapper below is two pages wide, shifted to the half in view.
    <div
      ref={ref}
      className="relative [container-type:inline-size]"
      style={{ ["--bw" as string]: single ? "100cqw" : "50cqw" }}
    >
      <div
        data-pan
        style={
          single
            ? { width: "200%", translate: "-50% 0" }
            : undefined
        }
      >
      {/* The 2D frame — the flight's translate/scale, the perspective and
          the tile's crop all live here, mirroring TileCell's frame. Starts
          invisible; FlyingBook's layout effect poses it over the tile and
          reveals it before first paint.
          Every page face carries a clip-path while it isn't peeling
          (REST_FRONT_CLIP / REST_BACK_CLIP). Chrome composites a 3D face with a
          clip-path differently, so without one the first moment of a peel,
          when renderCurl gives the face its real clip, visibly changes the
          shadows and the page edges. And it stops a left-hand page's lifted
          shadow at the spine: otherwise it reaches over the facing page or
          not depending on which stack Chrome draws on top, which flips as a
          turn shuffles the leaves' depths. The inside of the cover is a
          left-hand page too. */}
      <div
        data-frame
        className="relative w-full aspect-[4/3] [&_[data-face=front]]:[clip-path:var(--rest-front-clip)] [&_[data-face=back]]:[clip-path:var(--rest-back-clip)] [&_[data-cover-inside]]:[clip-path:var(--rest-back-clip)]"
        style={{ opacity: 0, willChange: "transform", ["--rest-front-clip" as string]: REST_FRONT_CLIP, ["--rest-back-clip" as string]: REST_BACK_CLIP }}
      >
        {/* The book's 3D box — two 2:3 pages side by side, spine at the
            center — carrying the tilt. preserve-3d so the hinge rotations
            inside compose with it. */}
        <div data-flyer className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          {/* The closed book sits over the right-hand page. */}
          <div className="absolute inset-y-0 right-0 w-1/2" style={{ transformStyle: "preserve-3d" }}>
            <ClosedBook
              tile={tile}
              colors={colors}
              coverFallback={tokens.tile.bg}
              frozen={tile.freeze.isFrozen}
              pose={{ coverAngle: CLOSED_BOOK.coverAngle, pageAngle: CLOSED_BOOK.pageAngle }}
              coverInside={single ? undefined : face(0, "back")}
              leaves={leaves}
              coverImageVariant="full"
            />
          </div>
        </div>

        {/* The fold-back of a peeling page, drawn by renderCurl: the clipped
            sheet (a pre-mirrored copy of the page's other side, ticks along
            its own edge included, shaded), its ink outline, and a shadow.
            Spans both pages so a turn can carry it across the spine. The
            outer box clips: the reflected copy can reach well outside the
            book (a turn from a corner swings it past the top or bottom),
            and a transformed box that pokes out of the scrolling overlay
            would grow it a scrollbar. So renderCurl sizes it to the
            viewport (see fitCurlLayer): nothing on screen is cut, and
            nothing reaches past the overlay. The sheet inside is exactly
            the book's box, so its coordinates are the frame's. */}
        <div
          data-curl-layer
          className="pointer-events-none absolute overflow-hidden"
          style={{ display: "none" }}
        >
          <div data-curl-sheet className="absolute">
            <div data-curl-clip className="absolute inset-0">
              <div
                data-curl-copy
                className="absolute top-0 h-full w-1/2 overflow-hidden"
                style={{
                  left: curlCopy?.side === "back" ? 0 : "50%",
                  backgroundColor: page.PAPER,
                  // The same box as the real face: a back face (a left-hand
                  // page) has no border at the spine, so its copy mustn't
                  // either, or its content lands a border's width narrower.
                  // Longhands, always all set: React mishandles a shorthand
                  // beside a longhand that comes and goes between renders.
                  borderStyle: "solid",
                  borderColor: "transparent",
                  borderWidth: copySide === "back" ? `${bw(0.012)} 0 ${bw(0.012)} ${bw(0.012)}` : bw(0.012),
                  transformOrigin: "0 0",
                }}
              >
                {copyContent}
                {copySide && <PageEdgeTicks colors={page} side={copySide} />}
              </div>
              <div data-curl-shade className="absolute inset-0" />
              {/* overflow-visible: a fold-back can swing past the book's top or
                  bottom edge, and its outline has to go with it. */}
              <svg data-curl-outline className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
                <path data-curl-edges fill="none" strokeLinecap="square" />
                <path data-curl-crease fill="none" strokeLinecap="square" />
              </svg>
            </div>
          </div>
        </div>

        {/* The page-turning strips, in the flat frame rather than on the
            leaves, so the page can change shape under the pointer without
            the strip ever moving out from under it. The right-hand page is
            the next leaf's front; the left-hand one is this spread's leaf,
            turned, so its back. */}
        {!single && spread < lastSpread && (
          <EdgeBand side="right" leaf={spread + 1} face="front" onCurl={(at) => onCurl(spread + 1, "front", at)} onFlip={() => onFlipTo(spread + 1)} />
        )}
        {!single && spread >= 1 && (
          <EdgeBand side="left" leaf={spread} face="back" onCurl={(at) => onCurl(spread, "back", at)} onFlip={() => onFlipTo(spread - 1)} />
        )}
        {/* Phones: the visible page is the frame's right half. Its outer edge
            turns it forward; its spine-side edge (the screen's left) brings
            the previous page back. */}
        {single && spread < lastSpread && <SwipeZone side="right" leaf={spread + 1} face="front" swipe={swipe} />}
        {single && spread >= 1 && <SwipeZone side="left" leaf={spread} face="back" swipe={swipe} />}
      </div>
      </div>

      {/* The trimmings: the close button and the page nav under the book. */}
      <AriaButton
        data-extra
        aria-label="Close"
        onPress={onClose}
        className="cursor-pointer absolute -right-4 -top-4 flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] pressed:scale-95 hover:-translate-y-0.5 z-51"
        style={{
          backgroundColor: page.PAPER_RAISED,
          color: page.INK,
          borderColor: page.LINE,
          boxShadow: `3px 3px 0 ${page.LINE}`,
          opacity: 0,
        }}
      >
        <XIcon size={24} />
      </AriaButton>
      <div data-extra className="mt-5 flex items-center justify-center gap-4" style={{ opacity: 0, color: page.INK, fontFamily: COMIC_FONT }}>
        <NavButton label="Previous page" onPress={() => onStep(-1)} disabled={spread <= 0} colors={page}>
          <ArrowLeftIcon size={20} />
        </NavButton>
        {/* A yellow tab, like a bookmark: which spread of how many — or, on
            a phone, which page. */}
        <span
          className="min-w-32 -rotate-1 border-[3px] px-3 py-1 text-center text-base uppercase leading-none tabular-nums"
          style={{ background: page.YELLOW, borderColor: page.LINE, color: page.ON_YELLOW, boxShadow: `2px 2px 0 ${page.LINE}` }}
        >
          {single ? `Page ${spread + 1} / ${pageCount}` : `Spread ${spread + 1} / ${lastSpread + 1}`}
        </span>
        <NavButton label="Next page" onPress={() => onStep(1)} disabled={spread >= lastSpread} colors={page}>
          <ArrowRightIcon size={20} />
        </NavButton>
      </div>
      <ArtViewer
        imageUrl={tile.imageUrl}
        name={tile.name}
        isOpen={artOpen}
        colors={page}
        onClose={() => {
          setArtOpen(false);
          artTrigger.current?.focus({ preventScroll: true });
        }}
      />
    </div>
  );
}

function NavButton({
  label,
  onPress,
  disabled,
  colors,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  colors: ComicColors;
  children: ReactNode;
}) {
  return (
    <AriaButton
      aria-label={label}
      onPress={onPress}
      isDisabled={disabled}
      className="flex size-10 cursor-pointer items-center justify-center rounded-full border-[3px] transition-transform duration-100 pressed:scale-95 hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-35 disabled:hover:translate-y-0"
      style={{ backgroundColor: colors.PAPER_RAISED, color: colors.INK, borderColor: colors.LINE, boxShadow: `2px 2px 0 ${colors.LINE}` }}
    >
      {children}
    </AriaButton>
  );
}

// A page on a face: the scrollable content, and a footer strip under it —
// PAGE n on the outer edge, what the page is at the spine.
function BookPage({
  colors,
  side,
  no,
  role,
  dragScroll = false,
  children,
}: {
  colors: ComicColors;
  side: "left" | "right";
  no: number;
  role: string;
  dragScroll?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <Page colors={colors} side={side} dragScroll={dragScroll}>
        <div style={{ paddingBottom: bw(0.12) }}>{children}</div>
      </Page>
      <PageFooter colors={colors} side={side} no={no} role={role} />
    </>
  );
}

/**
 * The strip along one page's outer edge that turns it. Hovering in from the
 * edge peels the page back under the pointer; while it's held the strip
 * widens so the peel keeps following further in, and a click anywhere on
 * it turns the page. Pointer-only — keyboard users have the nav and the
 * arrow keys.
 *
 * The strip sits over the page's own scroller, so it eats wheel events — and
 * once held it covers the outer 45% of the page. It hands them back: a wheel
 * over the strip scrolls the page it belongs to (`leaf`/`face`), as long as
 * that page can actually move in that direction.
 */
function EdgeBand({
  side,
  leaf,
  face,
  onCurl,
  onFlip,
}: {
  side: "left" | "right";
  leaf: number;
  face: Side;
  onCurl: (at: Point | null) => void;
  onFlip: () => void;
}) {
  const [held, setHeld] = useState(false);
  const bandRef = useRef<HTMLDivElement>(null);
  const isMouse = (e: React.PointerEvent) => e.pointerType === "mouse";

  // A native, non-passive listener: React's onWheel is passive, and this has
  // to preventDefault when it scrolls the page (or the modal behind would
  // scroll too).
  useEffect(() => {
    const band = bandRef.current;
    if (!band) return;
    const onWheel = (e: WheelEvent) => {
      const scroller = band.parentElement?.querySelector<HTMLElement>(`${leafSelector(leaf)} > [data-face="${face}"] .overflow-y-auto`);
      if (!scroller) return;
      const atTop = scroller.scrollTop <= 0;
      const atBottom = scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1;
      if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) return;
      e.preventDefault();
      scroller.scrollBy({ top: e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY });
    };
    band.addEventListener("wheel", onWheel, { passive: false });
    return () => band.removeEventListener("wheel", onWheel);
  }, [leaf, face]);

  return (
    <div
      ref={bandRef}
      aria-hidden="true"
      className="absolute inset-y-0 cursor-pointer"
      style={{ [side]: 0, width: `${(held ? EDGE_BAND_HELD : EDGE_BAND) * 50}%` }}
      onPointerEnter={(e) => {
        if (!isMouse(e)) return;
        setHeld(true);
        onCurl({ x: e.clientX, y: e.clientY });
      }}
      onPointerMove={(e) => isMouse(e) && onCurl({ x: e.clientX, y: e.clientY })}
      onPointerLeave={(e) => {
        if (!isMouse(e)) return;
        setHeld(false);
        onCurl(null);
      }}
      onClick={() => {
        setHeld(false);
        onFlip();
      }}
    />
  );
}

/**
 * A strip along one edge of the visible page on a phone, taking the drags
 * that turn it (see useEdgeSwipe). It covers part of the page, so vertical
 * drags are handed to the page's scroller and taps to whatever's beneath.
 */
function SwipeZone({ side, leaf, face, swipe }: { side: "left" | "right"; leaf: number; face: Side; swipe: PageSwipe }) {
  const handlers = useEdgeSwipe({
    dir: side === "right" ? -1 : 1,
    onBegin: () => swipe.begin(leaf, face),
    onProgress: (travel, y) => swipe.move(leaf, face, travel, y),
    onEnd: ({ travel, velocity, cancelled }) => swipe.end(leaf, face, travel, velocity, cancelled),
    onScroll: swipe.scroll,
    onScrollEnd: swipe.scrollEnd,
    onTap: ({ x, y }, zone) => {
      const under = document.elementsFromPoint(x, y).find((el) => !zone.contains(el));
      under?.closest<HTMLElement>("button, a, [role='button'], label, input, select, textarea, summary")?.click();
    },
  });
  // The zone covers part of the page, so a mouse wheel over it scrolls the page too.
  // Touches in it are ours, so the browser's own handling of them is cancelled (a
  // native listener: React's onTouchMove is passive) — else a drag here would also
  // scroll the document behind the modal.
  const zoneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      swipe.scroll(e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    zone.addEventListener("wheel", onWheel, { passive: false });
    zone.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      zone.removeEventListener("wheel", onWheel);
      zone.removeEventListener("touchmove", onTouchMove);
    };
  }, [swipe]);
  return (
    <div
      ref={zoneRef}
      aria-hidden="true"
      data-swipe-zone={side}
      className="absolute inset-y-0"
      style={{
        width: SWIPE_ZONE_WIDTH,
        touchAction: "none",
        ...(side === "right" ? { right: SWIPE_ZONE_INSET } : { left: `calc(50% + ${SWIPE_ZONE_INSET}px)` }),
      }}
      {...handlers}
    />
  );
}

// Page 1: the issue's masthead, title and progress, with the "I'll do
// this!" shout-out and, when the viewer can, a way to submit.
function SummaryPage({
  tile,
  ordered,
  colors,
  onGoToTask,
  onOpenArt,
  onSubmit,
  onToggleInterest,
}: {
  tile: TileModel;
  /** The tasks in page order (see orderTasks). */
  ordered: OrderedTask[];
  colors: ComicColors;
  /** Takes the task's position in page order, not its own number. */
  onGoToTask?: (position: number) => void;
  /** Opens the artwork full size; gets the picture that was pressed. */
  onOpenArt: (trigger: HTMLElement) => void;
  onSubmit?: () => void;
  onToggleInterest?: () => void;
}) {
  const { progress, freeze } = tile;
  const pointsPct = progress.totalPoints > 0 ? Math.round((progress.pointsAwarded / progress.totalPoints) * 100) : 0;
  const submitLabel = progress.allComplete ? "Complete" : freeze.isFrozen ? "Frozen" : "Submit proof";

  return (
    <div className="flex flex-col gap-5 p-6" style={{ color: colors.INK }}>
      {/* Masthead header */}
      <div className="flex flex-col items-start gap-2">
        <span
          className="comic-logo uppercase"
          style={{ backgroundColor: TECTONIC_LOGO.bg, color: TECTONIC_LOGO.fg, fontFamily: COMIC_LOGO_FONT, fontWeight: 800, fontSize: "1rem", letterSpacing: "0.02em" }}
        >
          Tectonic
        </span>
        <h2 className="text-3xl leading-none" style={{ fontFamily: COMIC_FONT }}>
          {tile.name}
        </h2>
        {tile.category && (
          <span className="text-sm uppercase tracking-wide" style={{ fontFamily: COMIC_FONT, color: tile.category.color ?? colors.INK_SUBTLE }}>
            {tile.category.label}
          </span>
        )}
      </div>

      {/* Comic progress caption boxes */}
      <div className="grid grid-cols-2 gap-3">
        <CaptionBox tone="yellow" title="Points">
          <span className="num text-2xl" style={{ fontFamily: COMIC_FONT, color: progress.pointsAwarded >= progress.totalPoints && progress.totalPoints > 0 ? colors.OK : colors.INK }}>
            {progress.pointsAwarded}
          </span>
          <span className="num text-base" style={{ color: colors.INK_SUBTLE }}>
            {" "}/ {progress.totalPoints}
          </span>
        </CaptionBox>
        <CaptionBox tone="paper" title="Parts">
          <span className="num text-2xl" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
            {progress.completedTasks}
          </span>
          <span className="num text-base" style={{ color: colors.INK_SUBTLE }}>
            {" "}/ {progress.totalTasks} done
          </span>
        </CaptionBox>
        {/* unlocksAt is null before the bingo starts; once the freeze is over
            (started, not frozen) there's nothing left to say, so no box. */}
        {freeze.hasFreezePeriod && (freeze.isFrozen || freeze.unlocksAt === null) && (
          <CaptionBox tone="cyan" title={freeze.isFrozen ? "Frozen" : "Freeze period"} className="col-span-2">
            <span className="flex items-center gap-2 text-sm" style={{ color: colors.INK }}>
              <ClockIcon size={14} />
              {freeze.isFrozen
                ? `Unlocks in ${formatCountdown(freeze.remainingMs)}`
                : `Locked for ${freeze.durationMinutes} minutes after the start of the bingo`}
            </span>
          </CaptionBox>
        )}
      </div>

      {/* Parts (table of contents) */}
      {ordered.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xl uppercase leading-none" style={{ fontFamily: COMIC_FONT }}>
            Parts
          </h3>
          <ol className="flex flex-col gap-2">
            {ordered.map(({ task, number }, i) => {
              const tone = task.complete
                ? colors.OK
                : task.status === "pending_approval"
                  ? colors.WARN
                  : task.status === "in_progress"
                    ? colors.BLUE
                    : colors.INK_SUBTLE;
              const claimed = task.interest.people;
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onGoToTask?.(i)}
                    className="comic-press flex w-full items-center gap-3 border-[3px] px-3 py-2 text-left outline-none transition-transform duration-100 hover:-translate-y-0.5"
                    style={{
                      borderColor: colors.LINE,
                      background: colors.PAPER_RAISED,
                      boxShadow: `2px 2px 0 ${colors.LINE}`,
                      color: colors.INK,
                    }}
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center border-2 text-sm"
                      style={{
                        fontFamily: COMIC_FONT,
                        borderColor: colors.LINE,
                        background: tone,
                        color: colors.ON_LOUD,
                      }}
                    >
                      {task.complete ? <CheckIcon size={14} /> : task.locked ? <LockIcon size={12} /> : number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base leading-tight" style={{ fontFamily: COMIC_FONT }}>
                        {task.label}
                      </span>
                      <span className="block truncate text-xs" style={{ color: claimed.length > 0 ? colors.INK_BODY : tone }}>
                        {claimed.length > 0 ? (
                          <>
                            <HandIcon size={10} className="mr-1 inline-block align-[-1px]" fill={task.interest.mine ? "currentColor" : "none"} />
                            {claimed.map((p) => p.displayName).join(", ")}
                          </>
                        ) : task.complete ? (
                          "Completed"
                        ) : task.status === "pending_approval" ? (
                          "Awaiting judges"
                        ) : task.status === "in_progress" ? (
                          "In progress"
                        ) : task.locked ? (
                          "Locked"
                        ) : (
                          "Not started"
                        )}
                      </span>
                    </span>
                    <span className="num shrink-0 text-sm" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
                      {task.points} pts
                    </span>
                    <span className="shrink-0 text-xs uppercase" style={{ fontFamily: COMIC_FONT, color: colors.INK_SUBTLE }}>
                      p.{i + 2}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* The Tile's artwork, pinned under the contents. */}
      {tile.imageUrl && <PinnedArt imageUrl={tile.imageUrl} name={tile.name} colors={colors} onOpen={onOpenArt} />}

      {onSubmit && (
        <ComicButton
          variant="primary"
          onPress={() => onSubmit()}
        >
          Submit
        </ComicButton>
      )}
    </div>
  );
}

function TaskPage({
  tile,
  task,
  number,
  colors,
  TaskPanel,
  onSubmit,
  onToggleInterest,
}: {
  tile: TileModel;
  task: TaskModel;
  /** The task's own number (its place in the tile's task list), whatever page it's on. */
  number: number;
  colors: ComicColors;
  TaskPanel: React.ComponentType<{ task: TaskModel }>;
  onSubmit?: (taskId?: string) => void;
  onToggleInterest?: (taskId: string) => void;
}) {
  const { interest } = task;
  const canClaim = !!onToggleInterest && interest.canToggle;
  const showCrew = canClaim || interest.people.length > 0;
  const submitDisabled = task.complete || task.locked || tile.freeze.isFrozen;
  const submitReason = task.complete
    ? "Already approved."
    : task.locked
      ? (task.lockedReason ?? "Locked.")
      : tile.freeze.isFrozen
        ? "Frozen until the freeze period ends."
        : null;

  return (
    <div className="relative flex min-h-full flex-col p-6" style={{ color: colors.INK }}>
      {/* Tilted Part Number Badge */}
      <div
        className="absolute right-5 top-5 flex size-10 items-center justify-center border-[3px] text-2xl"
        style={{
          fontFamily: COMIC_FONT,
          borderColor: colors.LINE,
          background: colors.YELLOW,
          color: colors.ON_YELLOW,
          boxShadow: `3px 3px 0 ${colors.LINE}`,
          transform: "rotate(6deg)",
        }}
        aria-hidden
      >
        {number}
      </div>

      {/* Part Action Bar */}
      {!tile.progress.allComplete && (onSubmit || showCrew) && (
        <div className="mb-4 border-b-[3px] pb-3 pr-12" style={{ borderColor: colors.LINE }}>
          <div className="flex flex-wrap items-center gap-3">
            {onSubmit && (
              <ComicButton
                variant="primary"
                isDisabled={submitDisabled}
                onPress={() => onSubmit(task.id)}
              >
                Submit
              </ComicButton>
            )}

            {showCrew && (
              <div className="flex min-w-0 items-center gap-2">
                {canClaim && (
                  <ComicButton
                    variant={interest.mine ? "yellow" : "secondary"}
                    aria-pressed={interest.mine}
                    onPress={() => onToggleInterest!(task.id)}
                  >
                    <HandIcon size={16} fill={interest.mine ? "currentColor" : "none"} />
                    {interest.mine ? "I'm on it" : "I'll do this"}
                  </ComicButton>
                )}
                <TaskInterestPeople interest={interest} variant="comic" />
              </div>
            )}
          </div>

          {submitReason && (
            <div className="mt-1.5 text-xs leading-tight" style={{ color: colors.INK_SUBTLE }}>
              {submitReason}
            </div>
          )}
        </div>
      )}

      {/* Main Task Requirements & Checklist */}
      <div className="flex-1">
        <TaskPanel task={task} />
      </div>

      {/* (The approved / pending / locked stamp is the one TaskPanel draws
          beside the part's title — not repeated down here.) */}
      <div className="mt-4 pt-2 border-t-[2px] border-dashed" style={{ borderColor: `${colors.LINE}44` }}>
        <span className="text-xs uppercase tracking-wider" style={{ fontFamily: COMIC_FONT, color: colors.INK_SUBTLE }}>
          Part {number} of {tile.tasks.length}
        </span>
      </div>
    </div>
  );
}

// The last page: every submission for this tile, newest first, each in its
// own speech bubble.
function SubmissionsPage({ submissions, colors }: { submissions: SubmissionModel[]; colors: ComicColors }) {
  return (
    <div className="flex flex-col gap-4 p-6" style={{ color: colors.INK }}>
      <div className="flex items-center justify-between">
        <h3 className="text-2xl uppercase leading-none" style={{ fontFamily: COMIC_FONT }}>
          Submissions
        </h3>
        <span
          className="rounded-full border-[2px] px-2 py-0.5 text-xs uppercase"
          style={{
            borderColor: colors.LINE,
            background: colors.YELLOW,
            color: colors.ON_YELLOW,
            fontFamily: COMIC_FONT,
          }}
        >
          {submissions.length} {submissions.length === 1 ? "entry" : "entries"}
        </span>
      </div>
      {submissions.length === 0 ? (
        <CaptionBox tone="paper" tilt={-1} className="mx-auto mt-6 max-w-xs text-center">
          <p className="text-sm" style={{ color: colors.INK_BODY }}>
            No submissions yet. Submit the first one.
          </p>
        </CaptionBox>
      ) : (
        submissions.map((s) => <SubmissionBubble key={s.id} submission={s} />)
      )}
    </div>
  );
}
