import { useDragScroll } from "./dragScroll";
import type { CSSProperties, ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import type { TileModel } from "../../../headless/types";
import { COMIC_FONT } from "../font";
import { BookBackArt, BookCoverArt, coverTaskMark } from "./BookCoverArt";
import { pageColors, type ComicColors } from "./colors";

/*
 * The comic book itself — a stack of leaves hinged along the spine, with a
 * cover on top — rendered by BOTH the tile on the board (TileCell) and the
 * copy that flies out into the modal (TileModal). It has to be the very
 * same construction in both places, at any size, so the hand-off between
 * them is pixel-for-pixel: every length in here is a fraction of the
 * book's own width, read from the `--bw` custom property the caller sets
 * on an ancestor (TileCell: 84cqw of the tile; TileModal: 50cqw of the
 * open spread). Borders, insets, the page-edge ticks and the shadow all
 * scale together, so a 65px book on a phone and a 450px book in the modal
 * are the same drawing.
 *
 * Every leaf (the cover included) is a hinge element at the spine carrying
 * two faces, each hiding its own backface, so a leaf swung 180° over the
 * spine shows its back as the left-hand page — that's how the modal reads
 * as a real book. The hinge itself carries nothing visible (no border,
 * shadow or opacity): any of those would flatten its preserve-3d and break
 * the faces' backface test.
 *
 * The board only ever shows the cover and the first leaf, cracked open a
 * touch; the modal passes the page content and any further leaves, which
 * sit exactly behind the first one (same box, a hair further from the
 * viewer) and so are invisible until turned — the tile and the flying copy
 * still match at the swap.
 *
 * This renders the layers only (a fragment): the caller owns the 3D box
 * they sit in — its aspect ratio (2:3), its own tilt, and the perspective
 * container above it — see CLOSED_BOOK.
 */

/** A length that's `fraction` of the book's width. */
export const bw = (fraction: number) => `calc(var(--bw) * ${fraction})`;

// The geometry every consumer has to agree on.
export const CLOSED_BOOK = {
  /** Resting tilt of the whole book. */
  tilt: -15,
  /** Resting hinge angles, on top of the tilt. */
  coverAngle: -15,
  pageAngle: -7.5,
  /** Perspective, as a multiple of the book's width (500px on an 80px book). */
  perspective: 6.25,
};

/** Depth (px) between stacked leaves, so the stacks depth-sort instead of z-fighting. Invisible at either perspective. */
export const LEAF_GAP = 2;
/**
 * The base sheet sits behind the top TWO leaves of the right-hand stack —
 * the top one, and the next one, which has to show through when the top
 * one's peeled back — but in front of anything shuffled deeper than that
 * (those are covered anyway). A constant, so the tile (whose stacks are one
 * leaf deep) and the modal put it at the same depth.
 */
export const BASE_DEPTH = LEAF_GAP * 1.25;

/**
 * How a finished tile's book is posed: turned over to show its back cover.
 * The extra 15° past the half turn is the resting tilt mirrored (the spine
 * is on the right now, so the left edge — where the pages fan out — is the
 * one that comes toward the viewer), and the top is tipped forward, so the
 * edges of the page block show along the left and top of the back cover.
 * Both ends of the tile↔modal flight have to agree on this, and on
 * BACK_DEPTH.
 */
export const BACK_VIEW = { rotateX: -14, rotateY: 198 };
/** The back cover's depth: behind the base sheet and every leaf the modal stacks. */
export const BACK_DEPTH = 12;

/** Selector for leaf `k` (0 = cover, 1 = first page leaf, …) within the book. */
export const leafSelector = (k: number) => `[data-leaf="${k}"]`;

/**
 * The page stack's stagger while the book's closed: the first leaf sits a
 * hair below the cover's top and pokes out a hair past its right and
 * bottom (1.25% of the book's width). Expressed as a transform about the
 * leaf's hinge (left center) — grow 1.25% wide, 2.08% tall, drop 1.04% —
 * rather than insets, so TileModal can animate it away as the cover opens
 * (and back as it closes) on the compositor, without relaying out the
 * page's content every frame. Motion's keys and the equivalent inline
 * CSS, for the two ways the leaf gets posed.
 */
export const FIRST_LEAF_STAGGER = { y: "1.04%", scaleX: 1.0125, scaleY: 1.0208 };
export const FIRST_LEAF_STAGGER_CSS = "translateY(1.04%) scaleX(1.0125) scaleY(1.0208)";
/**
 * Likewise the base sheet: a hair further out than the first leaf while
 * closed (2.5% of the book's width past the cover's right, 3.75% past its
 * bottom, 2.5% down from its top), about its top-left corner. TileModal
 * animates it flush behind the right-hand page as the book opens.
 */
export const BASE_STAGGER = { y: "1.667%", scaleX: 1.025, scaleY: 1.00833 };
export const BASE_STAGGER_CSS = "translateY(1.667%) scaleX(1.025) scaleY(1.00833)";
/**
 * The back cover's own stagger, for the turned-over book. It has to cover the
 * base sheet completely (so the base can't show round it as a second page):
 * a touch wider than the base's, and — since the turned-over book's left edge
 * is where the pages fan out — moved out toward the left (+x, in the book's
 * own mirrored frame), and sitting a little higher than the base so it lines
 * up with the page it's bound to rather than hanging below it.
 */
export const BACK_STAGGER = { x: "2.5%", y: "0.6%", scaleX: 1.025, scaleY: 1.00833 };
export const BACK_STAGGER_CSS = "translateX(2.5%) translateY(0.6%) scaleX(1.025) scaleY(1.00833)";
/**
 * The base sheet's own shadow — what grounds the CLOSED book against
 * whatever's behind it. Once the book's open it has to go, not just fade:
 * flush behind the right-hand page still leaves this peeking out past that
 * page's own edge (the shadow's offset + blur reach further than the
 * sheet's box), a stray halo around part of the book. TileModal drops it
 * (and brings it back) at the same moment it starts/finishes the stagger
 * above — while the base is still occluded under the cover either way, so
 * there's nothing to fade.
 */
export const BASE_SHADOW = `drop-shadow(${bw(0.0375)} ${bw(0.125)} ${bw(0.1)} rgba(0,0,0,0.45))`;

export interface LeafFaces {
  /** Printed on the front — the right-hand page while this leaf's unturned. */
  front?: ReactNode;
  /** Printed on the back — the left-hand page once it's turned. */
  back?: ReactNode;
}

export function ClosedBook({
  tile,
  colors,
  coverFallback,
  frozen = false,
  variants,
  pose,
  coverInside,
  leaves = [{}],
  coverImageVariant = "thumb",
}: {
  tile: TileModel;
  colors: ComicColors;
  /** Cover color before the artwork's dominant color is known, or with no artwork. */
  coverFallback: string;
  frozen?: boolean;
  /** Board: the cover and first leaf are motion elements driven by these variants (propagated from the tile). */
  variants?: { page: Variants; cover: Variants };
  /** Modal: static hinge angles for the cover and first leaf, animated imperatively via the data-book-* selectors. */
  pose?: { coverAngle: number; pageAngle: number };
  /** Printed on the inside of the cover — page 1. */
  coverInside?: ReactNode;
  /** The leaves under the cover, first (topmost) first. At least one is always drawn. */
  leaves?: LeafFaces[];
  /** Which display variant of the cover artwork to load ("thumb" on the board, "full" in the modal). */
  coverImageVariant?: "thumb" | "full";
}) {
  // The pages inside can be a different stock from the rest of the theme —
  // and the whole book, cover included, is outlined in the page ink, so the
  // cover's outline matches the pages'.
  const page = pageColors(colors);
  const ink = page.LINE;
  // Ink outlines: about 1px on a tile-sized book, 6–8px on the open spread.
  const pageBorder = `${bw(0.012)} solid ${ink}`;
  const coverBorder = `${bw(COVER_BORDER)} solid ${ink}`;
  const [first = {}, ...rest] = leaves;
  const mark = coverTaskMark(tile);
  const dogEar = mark?.dogEared ? mark : null;

  return (
    <>
      {/* Back page — flat and fully static, the bottom of the stack. Sits a
          hair past the leaves' right/bottom edges (away from the spine,
          which stays flush on both) — that stagger is what reads as a stack
          of pages rather than one page in a cover. It also casts the book's
          shadow: a filter here (a flat leaf) follows the silhouette without
          flattening any 3D parent. */}
      <div
        data-book-base
        className="absolute inset-0"
        style={{
          backgroundColor: page.PAPER_ALT,
          border: pageBorder,
          filter: BASE_SHADOW,
          transformOrigin: "left top",
          transform: `${BASE_STAGGER_CSS} translateZ(${-BASE_DEPTH}px)`,
        }}
      />

      {/* A finished tile's BACK cover: a face at the very back of the stack,
          turned to face away — so it's invisible from the front, and once
          the whole 3D box is turned over (BACK_VIEW, done by whoever owns
          the box: TileCell at rest, TileModal's flight) it's the face you
          see, with the credits on it. */}
      {tile.progress.allComplete && (
        <div
          data-book-back
          className="absolute inset-0 overflow-hidden"
          style={{
            border: coverBorder,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            // Staggered so it covers the base sheet when the book's turned
            // over, instead of the base showing round it like a second page.
            transform: `${BACK_STAGGER_CSS} translateZ(${-BACK_DEPTH}px) rotateY(180deg)`,
          }}
        >
          <BookBackArt tile={tile} colors={page} fallbackColor={coverFallback} variant={coverImageVariant} />
        </div>
      )}

      {/* Further leaves, deepest first, tucked behind the first: flush with
          the cover (their open position), so while the book's closed the
          cover hides them entirely. */}
      {rest
        .map((faces, i) => ({ faces, k: i + 2 }))
        .reverse()
        .map(({ faces, k }) => (
          <div
            key={k}
            data-leaf={k}
            className="absolute inset-0"
            style={{
              transformOrigin: "left center",
              transformStyle: "preserve-3d",
              transform: `translateZ(${-(k - 1) * LEAF_GAP}px)`,
            }}
          >
            <PageFace colors={page} border={pageBorder} side="front">
              {faces.front}
            </PageFace>
            <PageFace colors={page} border={pageBorder} side="back">
              {faces.back}
            </PageFace>
          </div>
        ))}

      {/* First leaf — fanned open a little behind the cover and staggered
          a hair out from under it while the book's closed (the board's
          variants / the modal's pose both carry FIRST_LEAF_STAGGER), flat
          and flush once it's open. */}
      <Layer
        variants={variants?.page}
        data={{ "data-book-page": "", "data-leaf": "1" }}
        className="absolute inset-0"
        style={{
          transformOrigin: "left center",
          transformStyle: "preserve-3d",
          transform: pose ? `${FIRST_LEAF_STAGGER_CSS} rotateY(${pose.pageAngle}deg)` : undefined,
        }}
      >
        <PageFace colors={page} border={pageBorder} side="front">
          {first.front}
          {dogEar && <RevealedPageMark colors={page} label={dogEar.label} />}
        </PageFace>
        <PageFace colors={page} border={pageBorder} side="back">
          {first.back}
        </PageFace>
      </Layer>

      {/* Cover — the artwork in front, page 1 on the inside. Once a task's
          done its top-right corner is dog-eared: the corner is genuinely cut
          out of this face (clip-path, border and all), so what shows through
          the gap is the first leaf sitting behind it in 3D — a real page on
          its own plane, not paint on the cover's — and the folded-over flap
          is drawn back on top of the face. */}
      <Layer
        variants={variants?.cover}
        data={{ "data-book-cover": "", "data-leaf": "0" }}
        className="absolute inset-0"
        style={{
          transformOrigin: "left center",
          transformStyle: "preserve-3d",
          transform: pose ? `rotateY(${pose.coverAngle}deg)` : undefined,
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            border: coverBorder,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            clipPath: dogEar ? DOG_EAR_CLIP : undefined,
            transform: "translateZ(1px)",
          }}
        >
          <BookCoverArt tile={tile} colors={colors} fallbackColor={coverFallback} frozen={frozen} variant={coverImageVariant} />
          {dogEar && <CoverDogEar colors={page} pageFill={page.PAPER} />}
        </div>
        {/* The inside of the cover is page 1: page weight of outline, and
            none at the spine — the right-hand page draws that line. */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            border: pageBorder,
            borderRightWidth: 0,
            backgroundColor: page.PAPER,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg) translateZ(1px)",
            boxShadow: LIFTED_PAGE_SHADOW,
          }}
        >
          {coverInside}
        </div>
      </Layer>
    </>
  );
}

// Only ever seen on a face that's been turned to the left — a lifted-page
// shadow for the left-hand page. Hidden along with the face otherwise.
const LIFTED_PAGE_SHADOW = `${bw(0.01)} ${bw(0.02)} ${bw(0.04)} rgba(0,0,0,0.35)`;

// The dog-ear: the cover's top-right corner folded down along a 45° crease.
// The flap is a DOG_EAR-wide square's worth of corner, sitting inside the
// cover's border (absolute positioning is off the padding box); the cut in
// the cover face is measured off its border box, so the crease line is
// carried out to that box's edges — 2 border widths further along each —
// for the two to be collinear.
const COVER_BORDER = 0.018;
const DOG_EAR = 0.24;
const DOG_EAR_CUT = bw(DOG_EAR + 2 * COVER_BORDER);
const DOG_EAR_CLIP = `polygon(0 0, calc(100% - ${DOG_EAR_CUT}) 0, 100% ${DOG_EAR_CUT}, 100% 100%, 0 100%)`;

/**
 * The folded-over corner itself: the triangle on the near side of the
 * crease (the cut-away corner reflected across it), drooping in toward the
 * spine. It's the cover's underside — the inside of the cover is page 1,
 * so it's paper, not artwork — outlined at the cover's own border weight
 * and casting a soft shadow onto the cover it lies on. The corner it came
 * from is empty (see the cover's clip-path), so the leaf behind shows
 * there — with the next page's number printed on it (RevealedPageMark).
 */
function CoverDogEar({ colors, pageFill }: { colors: ComicColors; pageFill: string }) {
  return (
    <div
      className="pointer-events-none absolute right-0 top-0"
      style={{ width: bw(DOG_EAR), height: bw(DOG_EAR), filter: `drop-shadow(${bw(-0.005)} ${bw(0.005)} ${bw(0.006)} rgba(0,0,0,0.45))` }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
        <polygon
          points="0,0 0,100 100,100"
          fill={pageFill}
          stroke={colors.LINE}
          strokeWidth={(COVER_BORDER / DOG_EAR) * 100}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * The next page's number, printed in the top-right corner of the first
 * leaf's front — exactly where the cover's dog-ear leaves it uncovered, so
 * it reads as revealed from under the fold. Centred on the uncovered
 * triangle's centroid (a third of the cut in from the corner, less the
 * leaf's own border, since it's positioned off the padding box). Only
 * meaningful while the cover's closed over it: TileModal fades it out as
 * the cover swings open (`data-page-mark`), or page 2 would wear it.
 */
function RevealedPageMark({ colors, label }: { colors: ComicColors; label: string }) {
  const inset = bw((DOG_EAR + 2 * COVER_BORDER) / 3 - 0.012);
  return (
    <span
      data-page-mark
      className="pointer-events-none absolute leading-none"
      style={{
        top: inset,
        right: inset,
        // A touch left of the triangle's centroid: the leaf sits a hair
        // right of the cover (its closed-book stagger), so dead-centre on
        // the leaf lands right of centre in the gap.
        transform: `translate(50%, -50%) translateX(${bw(-0.012)})`,
        color: colors.INK_BODY,
        fontFamily: COMIC_FONT,
        // Same size as the plain "P1" mark on the cover (8.3cqw of it).
        fontSize: bw(0.083),
      }}
    >
      {label}
    </span>
  );
}

// One side of a leaf: paper, ink outline, the content, and the page-edge
// ticks along its outer edge. The back face is pre-flipped 180° so it faces
// the other way — and once its leaf has turned 180° too, it renders
// un-mirrored, hinge on its right: so a back face's OUTER edge is its own
// left, a front face's its own right. Everything edge-related here and in
// TileModal (ticks, scrollbar side, the curl) keys off that.
//
// At the spine the two pages of a spread meet edge to edge, so only the
// right-hand one (a front face) draws the line there; a back face's spine
// side (its own right) goes without, or it'd be doubled.
//
// `data-face` lets TileModal find a face to peel: it cuts the peeled part
// away with the face's clip-path so the leaf beneath shows through, and
// draws the fold-back in its own book-level layer.
function PageFace({
  colors,
  border,
  side,
  children,
}: {
  colors: ComicColors;
  border: string;
  side: "front" | "back";
  children?: ReactNode;
}) {
  return (
    <div
      data-face={side}
      className="absolute inset-0 overflow-hidden"
      style={{
        border,
        backgroundColor: colors.PAPER,
        // react-aria's modal scroll lock (iOS only) sets `overscroll-behavior:
        // contain` on every element; on this clipping box it stops a touch
        // scroll ever reaching the page's own scroller inside it.
        overscrollBehavior: "auto",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        ...(side === "back" ? { borderRightWidth: 0, transform: "rotateY(180deg) translateZ(1px)", boxShadow: LIFTED_PAGE_SHADOW } : { transform: "translateZ(1px)" }),
      }}
    >
      {children}
      <PageEdgeTicks colors={colors} side={side} />
    </div>
  );
}

/**
 * The page-edge tick marks, the "there's more pages under here" cue — fine
 * enough that at full size they still read as a page edge rather than a
 * row of dashes. Exported so TileModal's fold-back copy (the other side of
 * a peeling page) can draw the same ticks: otherwise they'd only appear
 * once a turn completes and the real leaf face takes over, popping in
 * instead of being there the whole time you're peeling.
 */
export function PageEdgeTicks({ colors, side }: { colors: ComicColors; side: "front" | "back" }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        [side === "back" ? "left" : "right"]: 0,
        top: bw(0.05),
        bottom: bw(0.05),
        width: bw(0.03),
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${bw(0.013)}, ${colors.RULE} ${bw(0.013)}, ${colors.RULE} ${bw(0.02)})`,
      }}
    />
  );
}

// A hinge layer: a motion element when the board is driving it with
// variants, otherwise a plain div the modal animates imperatively — never a
// motion element with an inline `transform`, which would fight motion's
// own transform handling.
function Layer({
  variants,
  data,
  className,
  style,
  children,
}: {
  variants?: Variants;
  data: Record<string, string>;
  className: string;
  style: CSSProperties;
  children?: ReactNode;
}) {
  if (variants) {
    return (
      <motion.div variants={variants} className={className} style={style} {...data}>
        {children}
      </motion.div>
    );
  }
  return (
    <div className={className} style={style} {...data}>
      {children}
    </div>
  );
}

/**
 * A page's readable area: scrolls if its content runs longer than the
 * page, with a soft gutter shadow along the spine edge so the two pages
 * read as bound together. Keeps clear of the tick strip on the outer edge.
 * The scrollbar sits on the spine side, so the outer edge is left free for
 * turning the page: a left-hand page (a back face, spine on its own right)
 * gets it there naturally; a right-hand page uses the rtl-container /
 * ltr-content trick to put it on the left.
 */
export function Page({
  colors,
  side,
  gutter = true,
  dragScroll = false,
  children,
}: {
  colors: ComicColors;
  side: "left" | "right";
  /** Off for a copy of the page drawn on a fold-back, where a gutter shadow would float mid-sheet. */
  gutter?: boolean;
  /** Scroll by touch drag in script rather than natively (phones: see dragScroll.ts). */
  dragScroll?: boolean;
  children: ReactNode;
}) {
  const scroll = useDragScroll(dragScroll);
  const gutterShadow =
    side === "left"
      ? `inset ${bw(-0.04)} 0 ${bw(0.04)} ${bw(-0.03)} rgba(0,0,0,0.35)`
      : `inset ${bw(0.04)} 0 ${bw(0.04)} ${bw(-0.03)} rgba(0,0,0,0.35)`;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ boxShadow: gutter ? gutterShadow : undefined, color: colors.INK_BODY }}>
      <div
        ref={scroll.ref}
        className="pointer-events-auto h-full overflow-y-auto"
        style={{ direction: side === "right" ? "rtl" : "ltr", overscrollBehavior: "contain", touchAction: dragScroll ? "none" : undefined }}
        {...scroll.handlers}
      >
        <div style={{ direction: "ltr", [side === "right" ? "paddingRight" : "paddingLeft"]: bw(0.035) }}>{children}</div>
      </div>
    </div>
  );
}
