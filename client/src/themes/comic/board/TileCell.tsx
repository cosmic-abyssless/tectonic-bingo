import { memo, type CSSProperties } from "react";
import { motion, type Variants } from "motion/react";
import { useFocusRing } from "react-aria";
import type { TileModel } from "../../../headless/types";
import { formatCountdown } from "../../../core/ui/time";
import { ClockIcon, HandIcon, LockIcon } from "../../../core/ui/icons";
import { useThemeTokens } from "../../context";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";
import { sfxAt } from "../fx/SfxLayer";
import { bw, CLOSED_BOOK, ClosedBook, FIRST_LEAF_STAGGER, FLIP_ANGLE } from "./ClosedBook";
import { registerBook, useIsBookAway } from "./bookFlight";

/*
 * A little comic book sitting on the tile, cracked open just enough to show
 * it has pages — the shared ClosedBook drawing (pages + hinged cover) in a
 * 3D box that's tilted 3/4-on to the viewer. Hovering opens it further,
 * inviting the click that sends it flying out into the tile modal (see
 * TileModal, which renders the same ClosedBook at full size).
 *
 * All of the book's motion is Motion variants driven from the <button>:
 * whileHover / whileTap on the button propagate "hover" / "press" down to
 * the book, page and cover, and `animate` does the same for keyboard focus
 * and the search dropdown's highlight — one spring for everything, so the
 * three layers always move together, and an interrupted hover (mouse in,
 * straight back out) settles physically instead of snapping.
 */

// Snappy but with a little overshoot — a comic book should feel springy.
const BOOK_SPRING = { type: "spring", stiffness: 420, damping: 24, mass: 0.7 } as const;
const PRESS_SPRING = { type: "spring", stiffness: 700, damping: 32 } as const;

// The whole book: a static 3/4-view tilt at rest, grows and lifts a touch
// on hover, squashes back down slightly while pressed.
// A finished tile's book is turned over on its back cover (FLIP_ANGLE on top
// of the tilt), which mirrors the 3/4 view — so it leans the other way.
const makeBookVariants = (turn: number): Variants => ({
  rest: { rotateY: turn, scale: 1, y: "0%", transition: BOOK_SPRING },
  hover: { rotateY: turn, scale: 1.06, y: "-5%", transition: BOOK_SPRING },
  press: { rotateY: turn, scale: 0.98, y: "-3%", transition: PRESS_SPRING },
});
const bookVariants = makeBookVariants(CLOSED_BOOK.tilt);
const flippedBookVariants = makeBookVariants(CLOSED_BOOK.tilt + FLIP_ANGLE);
// Front page: always the angle halfway between the flat back page (0) and
// the cover, so the stack reads as evenly fanned the whole time; and
// always staggered a hair out from under the cover, so it reads as a
// stack at all.
const pageVariants: Variants = {
  rest: { rotateY: CLOSED_BOOK.pageAngle, ...FIRST_LEAF_STAGGER, transition: BOOK_SPRING },
  hover: { rotateY: -13, ...FIRST_LEAF_STAGGER, transition: BOOK_SPRING },
  press: { rotateY: -10, ...FIRST_LEAF_STAGGER, transition: PRESS_SPRING },
};
// Cover: hinged along the spine, opens further on hover.
const coverVariants: Variants = {
  rest: { rotateY: CLOSED_BOOK.coverAngle, transition: BOOK_SPRING },
  hover: { rotateY: -26, transition: BOOK_SPRING },
  press: { rotateY: -20, transition: PRESS_SPRING },
};
const hingeVariants = { page: pageVariants, cover: coverVariants };

export const TileCell = memo(function TileCell({
  tile,
  onOpen,
  isSearchHighlighted,
}: {
  tile: TileModel;
  onOpen: (tileId: string) => void;
  isSearchHighlighted?: boolean;
}) {
  // Focus-visible, not plain focus: react-aria tracks the interaction
  // modality app-wide, so this is true after Tabbing to the tile (or when
  // focus is restored to it after closing its modal with Escape), but not
  // after clicking it, or after closing its modal with the pointer — a
  // tile you've just clicked away from shouldn't sit there lit up.
  const { isFocusVisible, focusProps } = useFocusRing();
  const { colors } = useComic();
  const tokens = useThemeTokens();
  // While this tile's book is off in the modal, the cell's own copy hides —
  // the modal's copy took off from exactly this spot, and lands back here.
  const isAway = useIsBookAway(tile.id);

  const style = (
    tile.accentColor ? { "--tile-accent": tile.accentColor } : {}
  ) as CSSProperties;
  // The tile is a faint slot the book sits in, not a card: an ink tint
  // that's densest at the bottom edge (where the book's cropped, so it
  // reads as tucked into a pocket) and fades to nothing toward the top,
  // with no outline of its own — the book carries the weight and the tint
  // just marks the bingo cell's bounds. Keyboard focus (same "you're
  // interacting with this right now" idea as the search bubble's blue
  // outline) gets an accent outline and the comic offset shadow; frozen and
  // complete tiles get a hairline in their color.
  const stateColor = isFocusVisible
    ? "var(--color-accent)"
    : tile.freeze.isFrozen
      ? "var(--tile-frozen)"
      : tile.progress.allComplete
        ? "var(--tile-complete)"
        : null;
  // Outlines are inset box-shadows, not a border: a transparent border
  // around a gradient background leaves an anti-aliasing hairline along its
  // inner edge in Chrome, and a real border would shift the layout.
  const outline = stateColor
    ? isFocusVisible
      ? `inset 0 0 0 1.5px ${stateColor}, 4px 4px 0 ${stateColor}`
      : `inset 0 0 0 1.5px ${stateColor}`
    : "none";
  const isLifted = isFocusVisible || !!isSearchHighlighted;

  return (
    <motion.button
      // Just the two focus handlers, not a spread of focusProps: its wider
      // DOMAttributes type clashes with motion's own onAnimationStart.
      onFocus={focusProps.onFocus}
      onBlur={focusProps.onBlur}
      onClick={(e) => {
        // A comic sound-effect burst where you clicked — or, for a
        // keyboard-triggered click (no pointer position), on the tile itself.
        sfxAt(e.detail === 0 ? e.currentTarget : e);
        onOpen(tile.id);
      }}
      title={tile.name}
      initial="rest"
      animate={isLifted ? "hover" : "rest"}
      whileHover="hover"
      whileTap="press"
      style={{
        ...style,
        backgroundImage:
          "linear-gradient(to top, color-mix(in srgb, var(--tile-border) 16%, transparent), color-mix(in srgb, var(--tile-border) 5%, transparent) 55%, transparent)",
        boxShadow: outline,
      }}
      className={`group relative aspect-square w-full cursor-pointer rounded-lg border-0 outline-none transition-[box-shadow] duration-150 [container-type:inline-size] ${
        tile.dimmed ? "pointer-events-none opacity-20 saturate-0" : ""
      }`}
    >
      {/* The book's frame — a 2D box, sized bigger than the tile and anchored
          near the top, so the book's bottom third would naturally land past
          the tile's own bottom edge. clip-path here (not overflow-hidden on
          the button) crops it to the tile: the bottom at the tile's edge,
          left/right at the tile's edges too (the book's soft shadow reaches
          further right than the 8% margin), and no clip at all on top (huge
          negative inset, so the book can freely poke up over the tile above
          it). This has to live on THIS div — the perspective container, not
          yet 3D-rotated itself —
          rather than up on the button: clip-path travels with an element's
          own transform, so applying it to something that's already rotated
          would tilt the crop line with it, and applying it several levels
          up on an ancestor of the rotated/preserve-3d subtree wasn't
          reliably honored.
          Bottom offset is derived, not eyeballed: this div's own height
          equals the book's natural height (aspect-[2/3] on a w-full box
          that's `inset-x-[8%]` of the tile, i.e. 84% of tile width/height
          → 1.5 × 84% = 126% of tile height). Starting `top-[9%]` down, its
          bottom would land at 9% + 126% = 135%, i.e. 35% of tile height
          past the tile's own bottom edge. As a fraction of THIS div's own
          height (its clip-path's percentage basis): 35 / 126 ≈ 27.78%.
          Sides likewise: the tile's edge is 8% of tile width past this div
          on each side, i.e. 8 / 84 ≈ 9.52% of its own width. Retune these
          if top-[9%], inset-x-[8%], or the aspect ratio change — and
          TileModal's matching bottom crop with it.
          `--bw` is the book's width, which every length inside ClosedBook
          is a fraction of; the perspective is a fixed multiple of it too,
          so the tilt projects identically at any tile size (and TileModal
          reproduces it for the flight). Visibility (the "book is away in
          the modal" state) lives here too, on a plain div: putting an
          `animate` object on an intermediate motion element would stop the
          button's variant labels propagating down to the book/page/cover.
          It flips with no transition on purpose — the modal's copy takes
          over / hands back on the very same frame. */}
      <div
        ref={(el) => registerBook(tile.id, el)}
        className="absolute inset-x-[8%] top-[9%] aspect-[2/3]"
        style={{
          ["--bw" as string]: "84cqw",
          perspective: bw(CLOSED_BOOK.perspective),
          clipPath: "inset(-9999px -9.52% 27.78% -9.52%)",
          opacity: isAway ? 0 : 1,
        }}
      >
        {/* The book's 3D box: preserve-3d makes the pages/cover children's
            own hinge rotations compose within this tilted frame instead of
            flattening against it. */}
        <motion.div
          data-book
          variants={tile.progress.allComplete ? flippedBookVariants : bookVariants}
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Cover falls back to the tile's own bg token (not colors.ts's
              PAPER, which is the modal's book-page purple) so a no-image
              tile's cover reads as the same charcoal/cream as the rest of
              the board, not a separate hue. Passed as the resolved hex
              rather than var(--tile-bg) so the modal's copy (portaled out
              of the theme's CSS-variable scope) can use the same value. */}
          <ClosedBook
            tile={tile}
            colors={colors}
            coverFallback={tokens.tile.bg}
            frozen={tile.freeze.isFrozen}
            variants={hingeVariants}
          />
        </motion.div>
      </div>

      {/* (A finished tile used to get a big check laid over it; now its book
          is turned over on the back cover, credits and all — the green
          hairline outline still marks it.) */}

      {tile.freeze.isFrozen && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-background/70 text-[var(--tile-frozen)]">
          <LockIcon />
          <span className="num font-mono text-[11px] font-semibold leading-none">
            {formatCountdown(tile.freeze.remainingMs)}
          </span>
        </div>
      )}

      {/* A freeze that's coming (the bingo hasn't started, so unlocksAt is
          still null) gets the clock; while it's running the overlay above
          covers it, and once it's over there's nothing left to flag. */}
      {tile.freeze.hasFreezePeriod && tile.freeze.unlocksAt === null && (
        <span className="absolute left-1 top-1 z-10 text-[var(--tile-frozen)] drop-shadow">
          <ClockIcon size={14} />
        </span>
      )}

      {tile.interest.people.length > 0 && !tile.progress.allComplete && (
        <span
          title={`On this tile: ${tile.interest.people.map((p) => p.displayName).join(", ")}`}
          className="absolute right-1 top-1 z-20 inline-flex items-center gap-0.5 rounded-full border-2 px-1 py-0.5 text-[9px] font-bold leading-none"
          style={{
            background: tile.interest.mine ? colors.YELLOW : colors.PAPER_RAISED,
            color: tile.interest.mine ? colors.ON_YELLOW : colors.INK,
            borderColor: colors.LINE,
            fontFamily: COMIC_FONT,
          }}
        >
          <HandIcon size={10} fill={tile.interest.mine ? "currentColor" : "none"} />
          {tile.interest.people.length > 1 && <span className="num">{tile.interest.people.length}</span>}
        </span>
      )}
    </motion.button>
  );
});
