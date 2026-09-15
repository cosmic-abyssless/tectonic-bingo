import { memo, useState, type CSSProperties } from "react";
import type { TileModel } from "../../../headless/types";
import { formatCountdown } from "../../../core/ui/time";
import { TASK_STATUS_DOT } from "../../../core/ui/StatusBadge";
import { CheckIcon, ClockIcon, LockIcon } from "../../../core/ui/icons";
import { useResolvedColorScheme } from "../../../core/ui/colorScheme";
import { COMIC_FONT, COMIC_LOGO_FONT } from "../font";
import { getContrastTextColor, useDominantColor } from "../useDominantColor";
import { getColors } from "./colors";

/*
 * A little comic book sitting on the tile, cracked open just enough to show
 * it has pages — a static "pages" layer sitting behind a "cover" layer (the
 * artwork + title lettering) that's hinged along its spine (the left edge)
 * and folded open in 3D (perspective + rotateY) so it lifts toward the
 * viewer rather than just rotating flat. Hovering opens it further, inviting
 * the click that reveals the full thing in the tile modal.
 */
export const TileCell = memo(function TileCell({
  tile,
  onOpen,
  isSearchHighlighted,
}: {
  tile: TileModel;
  onOpen: (tileId: string) => void;
  isSearchHighlighted?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const scheme = useResolvedColorScheme();
  const colors = getColors(scheme);
  const dominantColor = useDominantColor(
    tile.imageUrl && !imgFailed ? tile.imageUrl : null,
  );
  // Falls back to the tile's own bg token (not colors.ts's PAPER, which is
  // the tile *modal*'s book-page purple) so a no-image tile's cover reads as
  // the same charcoal/cream as the rest of the board, not a separate hue.
  const coverColor = dominantColor ?? "var(--tile-bg)";
  // The two page-stack slivers (unlike the cover above) keep colors.ts's
  // purple/plum PAPER family — a little of the modal's "moonlit" book
  // identity peeking out from behind the charcoal cover, rather than
  // blending into it.
  const tickColor = scheme === "dark" ? "rgba(233,213,255,0.35)" : "rgba(0,0,0,0.22)";
  // The price badge sits directly on the cover with no fill of its own, so
  // its own color (border + text) has to adapt to whatever that cover
  // color turns out to be, not the other way around.
  const priceTextColor = getContrastTextColor(dominantColor);

  const style = (
    tile.accentColor ? { "--tile-accent": tile.accentColor } : {}
  ) as CSSProperties;
  // Focus (keyboard or otherwise — same "you're interacting with this right
  // now" idea as the search bubble's blue outline) takes priority over the
  // frozen/complete indicator colors; the shadow "lifts" further too, same
  // as the search bubble does on its own focus.
  const borderColor = isFocused
    ? "var(--color-accent)"
    : tile.freeze.isFrozen
      ? "var(--tile-frozen)"
      : tile.progress.allComplete
        ? "var(--tile-complete)"
        : "var(--tile-border)";
  const liftPx = isFocused ? 5 : 3;

  return (
    <button
      onClick={() => onOpen(tile.id)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      title={tile.name}
      data-search-highlighted={isSearchHighlighted ? "" : undefined}
      style={{
        ...style,
        borderColor,
        boxShadow: `${liftPx}px ${liftPx}px 0 ${borderColor}`,
      }}
      className={`group relative aspect-square w-full cursor-pointer rounded-xl border-[3px] bg-[var(--tile-bg)] outline-none transition-[border-color,box-shadow] duration-150 [container-type:inline-size] ${
        tile.dimmed ? "pointer-events-none opacity-20 saturate-0" : ""
      }`}
    >
      {/* The book — sized bigger than the tile and anchored near the top, so
          its bottom third would naturally land past the tile's own bottom
          edge. clip-path here (not overflow-hidden on the button) crops
          exactly that: top/left/right get no clip at all (huge negative
          inset, so the book can freely poke up over the tile above it),
          bottom clips at the tile's edge. This has to live on THIS div —
          the one perspective is set on, not yet 3D-rotated itself — rather
          than up on the button: clip-path travels with an element's own
          transform, so applying it to something that's already rotated
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
          Retune this if top-[9%], inset-x-[8%], or the aspect ratio change.
          drop-shadow (not box-shadow) so the shadow is cast by the book's
          actual rendered silhouette after the 3D tilt, instead of rotating
          along with it like a box-shadow would. */}
      <div
        className="absolute inset-x-[8%] top-[9%]"
        style={{
          perspective: 500,
          filter: "drop-shadow(3px 10px 8px rgba(0,0,0,0.45))",
          clipPath: "inset(-9999px -9999px 27.78% -9999px)",
        }}
      >
        {/* Static 3/4-view tilt for the whole book, so it reads as sitting at
            an angle rather than facing the viewer flat-on. preserve-3d makes
            the pages/cover children's own transforms compose within this
            tilted frame instead of flattening against it. On hover, focus,
            or when this is the tile the search dropdown currently has
            highlighted (data-search-highlighted, set by the caller), the
            book also grows slightly and lifts up a touch, on top of (and in
            the same transform as) that base tilt. The cover's own
            fold-open angle animates separately, on its own element. */}
        <div
          className="relative aspect-[2/3] w-full transition-transform duration-200 [transform:rotateY(-15deg)] group-hover:[transform:rotateY(-15deg)_scale(1.05)_translateY(-4%)] group-focus:[transform:rotateY(-15deg)_scale(1.05)_translateY(-4%)] group-data-[search-highlighted]:[transform:rotateY(-15deg)_scale(1.05)_translateY(-4%)]"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Back page — flat and fully static, the bottom of the stack. A
              single flat sheet peeking out reads as a binder's lone insert,
              so this sits a couple pixels past the front page's right/bottom
              edges (away from the spine, which stays flush left/top on
              both) — that stagger is what reads as a stack of pages rather
              than one page in a cover. */}
          <div
            className="absolute overflow-hidden rounded-[3px] border-2"
            style={{
              inset: "2px -2px -3px 0",
              backgroundColor: colors.PAPER_ALT,
              borderColor: "var(--tile-border)",
            }}
          />
          {/* Front page — inset exactly halfway between the back page above
              and the cover's own flush inset-0, so the stack reads as evenly
              spaced. Its rotation is kept at that same midpoint too, at rest
              AND on hover: back page holds 0deg (flat, its own transform),
              cover holds -15deg at rest / -23deg on hover, so this page sits
              at -7.5deg at rest / -11.5deg on hover — literally the angle
              halfway between the other two the whole time, rather than
              starting flush with the cover and only diverging once you
              hover. Same hinge (transform-origin) as the cover so it opens
              with it on hover/focus/search-highlight. */}
          <div
            className="absolute overflow-hidden rounded-[3px] border-2 transition-transform duration-200 [transform:rotateY(-7.5deg)] group-hover:[transform:rotateY(-11.5deg)] group-focus:[transform:rotateY(-11.5deg)] group-data-[search-highlighted]:[transform:rotateY(-11.5deg)]"
            style={{
              inset: "1px -1px -1.5px 0",
              backgroundColor: colors.PAPER,
              borderColor: "var(--tile-border)",
              transformOrigin: "left center",
            }}
          >
            <div
              className="absolute inset-y-1 right-0 w-2.5"
              style={{
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, ${tickColor} 3px, ${tickColor} 4px)`,
              }}
            />
          </div>

          {/* Cover — the artwork + title, hinged along the spine (left edge)
              and folded open in 3D (relative to the book's own tilted frame
              above) so it lifts toward the viewer rather than just rotating
              flat; opens a bit further on hover, focus, or search-highlight
              — same treatment for all three. Background color is extracted
              from the artwork itself (falls back to the theme's accent
              while that's loading, or when there's no image). */}
          <div
            className="absolute inset-0 overflow-hidden rounded-[3px] border-[3px] transition-[transform,background-color] duration-200 [transform:rotateY(-15deg)] group-hover:[transform:rotateY(-23deg)] group-focus:[transform:rotateY(-23deg)] group-data-[search-highlighted]:[transform:rotateY(-23deg)]"
            style={{
              borderColor: "var(--tile-border)",
              backgroundColor: coverColor,
              transformOrigin: "left center",
            }}
          >
            {tile.imageUrl && !imgFailed ? (
              <img
                src={tile.imageUrl}
                alt={tile.name}
                onError={() => setImgFailed(true)}
                className={`absolute inset-0 h-fit w-full object-contain p-[8%] pt-[18%] ${tile.freeze.isFrozen ? "opacity-30 saturate-0" : ""}`}
                style={{ objectPosition: "50% 35%" }}
              />
            ) : null}
            <span
              className="absolute inset-x-1 top-1.5 w-fit h-fit truncate px-[0.35em] py-[0.15em] text-center uppercase leading-none"
              style={{
                backgroundColor: "#d2412d",
                color: "#fff",
                fontFamily: COMIC_LOGO_FONT,
                fontWeight: 800,
                fontSize: "8cqw",
                letterSpacing: "0.02em",
              }}
            >
              TECTONIC
            </span>

            {/* Price badge — tucked right into the top-right corner, like a
                vintage comic's own cover price mark. No outline/fill of its
                own — just text stamped on the artwork — so its color has to
                adapt to the extracted cover color's contrast. */}
            <div
              className="absolute right-2 top-2 z-10 leading-none"
              style={{
                color: priceTextColor,
                fontFamily: COMIC_FONT,
                fontSize: "7cqw",
              }}
            >
              {tile.progress.totalPoints}
              <span style={{ fontSize: "0.7em", marginLeft: "0.04em" }}>¢</span>
            </div>
          </div>
        </div>
      </div>

      {tile.progress.allComplete && !tile.freeze.isFrozen && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--tile-complete)]/40">
          <CheckIcon
            className="size-1/2 text-[var(--tile-complete)] drop-shadow"
            strokeWidth={2.5}
          />
        </div>
      )}

      {tile.freeze.isFrozen && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-background/70 text-[var(--tile-frozen)]">
          <LockIcon />
          <span className="num font-mono text-[11px] font-semibold leading-none">
            {formatCountdown(tile.freeze.remainingMs)}
          </span>
        </div>
      )}

      {tile.freeze.hasFreezePeriod && !tile.freeze.isFrozen && (
        <span className="absolute left-1 top-1 z-10 text-[var(--tile-frozen)] drop-shadow">
          <ClockIcon size={14} />
        </span>
      )}

      {tile.progress.totalTasks > 0 && (
        <span className="num absolute bottom-1 left-1 z-20 rounded-sm bg-background/80 px-1 py-0.5 text-[9px] font-semibold leading-none text-on-surface-muted">
          {tile.progress.pointsAwarded}/{tile.progress.totalPoints}
        </span>
      )}

      {tile.progress.totalTasks > 1 && (
        <div className="absolute bottom-1 right-1 z-20 flex gap-0.5">
          {tile.taskStatuses.map((task) => {
            if (task.status === "not_started") return null;
            return (
              <span
                key={task.id}
                title={`${task.label}: ${task.status.replace(/_/g, " ")}`}
                className={`inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold leading-none text-background ${TASK_STATUS_DOT[task.status]}`}
              >
                {task.index + 1}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
});
