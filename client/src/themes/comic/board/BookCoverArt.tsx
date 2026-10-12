import { useState, type CSSProperties } from "react";
import type { TileModel } from "../../../headless/types";
import { COMIC_FONT, COMIC_LOGO_FONT } from "../font";
import { getContrastTextColor, useDominantColor } from "../useDominantColor";
import { thumbUrl, fullUrl } from "../../../api/imageVariants";
import { formatCountdown } from "../../../core/ui/time";
import { iceBlue, pageColors, TECTONIC_LOGO, type ComicColors } from "./colors";
import { LETTERED } from "../../lettering";

/*
 * The face of a tile's comic book cover: extracted-from-artwork background,
 * the artwork itself, the "TECTONIC" masthead + points, and a mark for
 * which task the cover currently points to. Shared between the little book
 * on the board (TileCell) and the full-size copy that flies out into the
 * modal (TileModal), so the two are pixel-for-pixel the same design at any
 * size — everything inside is sized in container query units of the
 * cover's own width.
 *
 * Renders only the interior; the caller owns the bordered, hinged/rotating
 * cover element this fills — and the dog-eared corner, once there's a task
 * done (see ClosedBook), since that has to cut into the cover itself.
 */

/**
 * Which task the cover points to, as printed on it: "P1" while nothing's
 * done yet, then the next task's number — on a folded-down corner once the
 * first task's done, since there's a page already behind the cover by then
 * (the same "there's more here" cue a real dog-eared book gives at a
 * glance). Task N is page N+1 in the modal, right after the summary. Null
 * once every task's done: nothing left to point to.
 */
export function coverTaskMark(tile: TileModel): { label: string; dogEared: boolean } | null {
  const { completedTasks, totalTasks, allComplete } = tile.progress;
  if (totalTasks === 0 || allComplete) return null;
  // The first part still to do — that's the first page of the book now, since
  // finished parts move to the back — not "how many are done, plus one",
  // which would be wrong the moment parts finish out of order.
  const next = tile.tasks.findIndex((t) => !t.complete);
  return { label: `P${(next === -1 ? completedTasks : next) + 1}`, dogEared: completedTasks > 0 };
}

/**
 * Where a cover's colour is read from: always the thumbnail, whichever size the
 * artwork itself is drawn at. The colour is looked up per image URL, so reading it from
 * the full-size image (as the modal's copy of the book draws) would start with nothing —
 * the cover flashing its fallback grey while the big image loads — instead of the colour
 * the board cell has already found from the same thumbnail.
 */
function coverColorSource(imageUrl: string | null | undefined, failed: boolean): string | null {
  return imageUrl && !failed ? (thumbUrl(imageUrl) ?? null) : null;
}

/**
 * The cover's artwork at the given size. The thumb is just an <img>. The full
 * size (the modal's copy) is laid over the thumb the board cell has already
 * loaded, and only shown once it's in: the book flies out and opens the moment
 * the tile's clicked, and the big image may well still be on its way then — so
 * the cover shows the thumb meanwhile instead of a blank. The thumb stays the
 * one in the layout (the full one is absolutely over it, the same box), so the
 * swap doesn't move anything. A failed full image fails the cover's artwork as
 * a whole, as it always has; a failed thumb just leaves the full one on its own.
 *
 * Renders the image(s) straight into the caller's box, which has to be the
 * containing block (`relative`) for the full image to sit over the thumb;
 * `className` sizes the thumb (or a lone image), the full one just fills the box.
 */
function CoverImage({
  url,
  variant,
  alt,
  onFail,
  className,
  style,
}: {
  url: string;
  variant: "thumb" | "full";
  alt: string;
  onFail: () => void;
  className: string;
  style?: CSSProperties;
}) {
  const [fullLoaded, setFullLoaded] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  if (variant === "thumb" || thumbFailed) {
    return <img src={variant === "thumb" ? thumbUrl(url) : fullUrl(url)} alt={alt} onError={onFail} className={className} style={style} draggable={false} />;
  }
  return (
    <>
      <img
        src={thumbUrl(url)}
        alt=""
        aria-hidden="true"
        onError={() => setThumbFailed(true)}
        className={className}
        // Hidden, not removed, once the full one's in: it's what sizes the box —
        // and a transparent artwork would show it through the full one otherwise.
        style={{ ...style, visibility: fullLoaded ? "hidden" : undefined }}
        draggable={false}
      />
      <img
        src={fullUrl(url)}
        alt={alt}
        onLoad={() => setFullLoaded(true)}
        onError={onFail}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ ...style, opacity: fullLoaded ? 1 : 0 }}
        draggable={false}
      />
    </>
  );
}

export function BookCoverArt({
  tile,
  colors,
  fallbackColor,
  frozen = false,
  variant = "thumb",
}: {
  tile: TileModel;
  colors: ComicColors;
  /** Cover color while the artwork's dominant color is loading, or when there's no artwork. */
  fallbackColor: string;
  frozen?: boolean;
  /** Which display variant of the artwork to load — "thumb" on the board cell, "full" in the modal. */
  variant?: "thumb" | "full";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = tile.imageUrl && !imgFailed ? tile.imageUrl : null;
  const dominantColor = useDominantColor(coverColorSource(tile.imageUrl, imgFailed));
  // The masthead row and the plain "P1" mark sit directly on the cover with
  // no fill of their own, so their color adapts to whatever the cover color
  // turns out to be, not the other way around.
  const priceTextColor = getContrastTextColor(dominantColor ?? fallbackColor);
  const { pointsAwarded, totalPoints } = tile.progress;
  const mark = coverTaskMark(tile);

  return (
    <div
      className="absolute inset-0 overflow-hidden transition-colors duration-200 [container-type:inline-size]"
      style={{ backgroundColor: dominantColor ?? fallbackColor }}
    >
      {/* The artwork is an ordinary block image inside a padded wrapper, so its
          height comes from its own aspect ratio. (It used to be an absolutely
          positioned <img> with `height: fit-content`, which WebKit ignores for
          images: the box stretched to the whole cover and the art was pushed down
          and cut off on iOS.) Percent padding is of the cover's width either way. */}
      {imageUrl ? (
        <div className="absolute inset-x-0 top-0 p-[8%] pt-[18%]">
          <div className="relative">
            <CoverImage key={imageUrl} url={imageUrl} variant={variant} alt={tile.name} onFail={() => setImgFailed(true)} className="block h-auto w-full" />
          </div>
        </div>
      ) : null}
      {frozen && <FrozenWash colors={colors} />}
      {/* Masthead + the tile's points, left-aligned in a row so the score
          reads right off the logo instead of floating in its own corner. */}
      <div className="absolute inset-x-[3cqw] top-[3.5cqw] flex items-baseline gap-[1.8cqw]">
        <span
          className="comic-logo w-fit h-fit shrink-0 truncate text-center uppercase"
          style={{
            backgroundColor: TECTONIC_LOGO.bg,
            color: TECTONIC_LOGO.fg,
            fontFamily: COMIC_LOGO_FONT,
            fontWeight: 800,
            fontSize: "9.5cqw",
            letterSpacing: "0.02em",
          }}
        >
          TECTONIC
        </span>
        {/* A sealed tile's points are held back (CONTEXT.md "Sealed Tiles"), so its cover has no price. */}
        {!tile.sealed && (
          <span className={`${LETTERED} leading-none whitespace-nowrap`} style={{ color: priceTextColor, fontFamily: COMIC_FONT, fontSize: "7cqw" }}>
            {pointsAwarded}/{totalPoints}
            <span style={{ fontSize: "0.7em", marginLeft: "0.04em" }}>¢</span>
          </span>
        )}
      </div>

      {/* Which task the cover's currently pointing to, while it's still a
          plain mark. Once dog-eared, ClosedBook draws it on the fold. */}
      {mark && !mark.dogEared && (
        <div
          className={`${LETTERED} absolute right-[4cqw] top-[4cqw] leading-none`}
          style={{ color: priceTextColor, fontFamily: COMIC_FONT, fontSize: "8.3cqw" }}
        >
          {mark.label}
        </div>
      )}

      {frozen && <Icicles colors={colors} />}
      {frozen && <FreezeTimer colors={colors} remainingMs={tile.freeze.remainingMs} />}
    </div>
  );
}

// Icicles hanging from the top edge, as [left edge, width, length] in the
// cover's width / 100 (the SVG's own units, so it scales with the cover).
const ICICLES: [number, number, number][] = [
  [-2, 13, 15], [10, 12, 27], [23, 13, 17], [36, 11, 32], [48, 13, 20], [61, 12, 29], [73, 13, 18], [86, 15, 25],
];

const frost = (colors: ComicColors, pct: number) => `color-mix(in srgb, ${iceBlue(colors)} ${pct}%, transparent)`;

/**
 * A frozen tile's cover, tinted freeze-blue: the artwork keeps its light and
 * dark but takes the blue's hue (a "color" blend), heaviest at the top, and
 * the rim is frosted. Drawn under the masthead so the lettering stays put.
 */
function FrozenWash({ colors }: { colors: ComicColors }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background: `linear-gradient(to bottom, ${frost(colors, 92)}, ${frost(colors, 72)} 45%, ${frost(colors, 46)} 80%)`,
        mixBlendMode: "color",
        boxShadow: `inset 0 0 12cqw color-mix(in srgb, ${colors.ICE} 80%, transparent)`,
      }}
    />
  );
}

/**
 * Icicles hanging from the top edge, over everything on the cover (the
 * lettering shows through them): translucent ice with a shaded facet and a
 * glint, outlined down their two sides only — no line along the top.
 */
function Icicles({ colors }: { colors: ComicColors }) {
  const ink = pageColors(colors).LINE;
  const drop = ([x, w, len]: [number, number, number]) => `M${x} 0Q${x + w * 0.15} ${len * 0.55} ${x + w / 2} ${len}Q${x + w * 0.85} ${len * 0.55} ${x + w} 0`;
  // The right-hand half of each icicle, shaded.
  const facet = ([x, w, len]: [number, number, number]) => `M${x + w / 2} 0H${x + w}Q${x + w * 0.85} ${len * 0.55} ${x + w / 2} ${len}Z`;
  const glint = ([x, w, len]: [number, number, number]) => `M${x + w * 0.27} 3Q${x + w * 0.3} ${len * 0.32} ${x + w * 0.38} ${len * 0.52}`;
  return (
    <svg viewBox="0 0 100 40" className="pointer-events-none absolute inset-x-0 top-0 block w-full overflow-visible" aria-hidden="true">
      <g strokeLinejoin="round" strokeLinecap="round">
        {ICICLES.map((ic) => (
          <g key={ic[0]}>
            <path d={`${drop(ic)}Z`} fill={colors.ICE} fillOpacity={0.4} />
            <path d={facet(ic)} fill={colors.ICE_DEEP} fillOpacity={0.32} />
            <path d={drop(ic)} fill="none" stroke={ink} strokeOpacity={0.75} strokeWidth={0.9} />
            <path d={glint(ic)} fill="none" stroke={colors.ICE_SHINE} strokeOpacity={0.9} strokeWidth={1.1} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** When the freeze ends, on a tag across the cover — the countdown that used to sit over the whole tile. */
function FreezeTimer({ colors, remainingMs }: { colors: ComicColors; remainingMs: number }) {
  const ink = pageColors(colors).LINE;
  return (
    <div
      className={`${LETTERED} pointer-events-none absolute left-1/2 flex items-center gap-[2.4cqw] whitespace-nowrap leading-none`}
      style={{
        top: "64cqw",
        transform: "translate(-50%, -50%) rotate(-3deg)",
        padding: "3cqw 5.5cqw",
        background: colors.ICE,
        color: colors.ON_ICE,
        border: `1.3cqw solid ${ink}`,
        boxShadow: `2cqw 2cqw 0 ${ink}`,
        fontFamily: COMIC_FONT,
        fontSize: "17cqw",
      }}
    >
      <svg viewBox="0 0 24 24" className="h-[15cqw] w-[15cqw] shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9 4l3 2.5L15 4M9 20l3-2.5 3 2.5" />
      </svg>
      <span className="num">{formatCountdown(remainingMs)}</span>
    </div>
  );
}

/** How many names the back cover lists before "+N more". */
const BACK_COVER_NAMES = 6;

/**
 * Who got a finished tile over the line: the distinct people behind its
 * approved submissions, in the order they first contributed.
 */
export function tileContributors(tile: TileModel): string[] {
  const names: string[] = [];
  // Submissions come newest first; the credits read oldest first.
  for (const s of [...tile.submissions].reverse()) {
    if (s.status !== "approved" || !s.submittedBy) continue;
    if (!names.includes(s.submittedBy)) names.push(s.submittedBy);
  }
  return names;
}

/** A comic starburst's outline in a 100×100 box: `spikes` points out to `outer`, notched in to `inner`. */
function burstPoints(spikes: number, outer: number, inner: number) {
  return Array.from({ length: spikes * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}
const BURST = burstPoints(14, 50, 39);

/** Display lettering's ink outline and hard drop, in em so it scales with the type. */
function inkOutline(ink: string) {
  const w = "0.05em";
  return [`-${w} -${w} 0 ${ink}`, `${w} -${w} 0 ${ink}`, `-${w} ${w} 0 ${ink}`, `${w} ${w} 0 ${ink}`, `0.09em 0.09em 0 ${ink}`].join(", ");
}

/**
 * The back of a finished tile's comic book, there to say "done" from across the board: the whole cover goes green
 * behind speed lines, the cover art sits in a yellow starburst bursting in from the top-left corner, COMPLETE! is
 * lettered at an angle beside it, and a credits box lists everyone who got it over the line. Every finished tile pays
 * the same, so it shows no points. Interior only, like BookCoverArt: the caller (ClosedBook) owns the bordered,
 * back-facing element it fills. Likewise sized entirely in container-query units of the cover's own width, so it's
 * the same drawing on the tile and in the modal's flying copy. On the board the cell crops the book about two thirds
 * of the way down, so the lettering and the first names sit above that.
 */
export function BookBackArt({
  tile,
  colors,
  variant = "thumb",
}: {
  tile: TileModel;
  colors: ComicColors;
  /** Which display variant of the artwork to load — same as the front cover's. */
  variant?: "thumb" | "full";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = tile.imageUrl && !imgFailed ? tile.imageUrl : null;
  const names = tileContributors(tile);
  const shown = names.slice(0, BACK_COVER_NAMES);
  const more = names.length - shown.length;

  return (
    // The container is this outer box; the cqw lengths live one level down
    // (a box's own cqw resolve against its ancestor's container, not itself).
    <div className="absolute inset-0 overflow-hidden [container-type:inline-size]" style={{ backgroundColor: colors.GREEN }}>
      {/* Speed lines, radiating from the burst. */}
      <div
        className="absolute inset-0"
        style={{ background: `repeating-conic-gradient(from 0deg at 22cqw 22cqw, color-mix(in srgb, ${colors.ON_LOUD} 22%, transparent) 0deg 7deg, transparent 7deg 16deg)` }}
      />
      {/* The burst, its centre near the corner so about two thirds of it is on the cover, with the art in it. */}
      <div className="absolute -left-[12cqw] -top-[12cqw] h-[66cqw] w-[66cqw]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <polygon points={BURST} fill={colors.SHADOW} transform="translate(2.4 2.4)" />
          <polygon points={BURST} fill={colors.YELLOW} stroke={colors.SHADOW} strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
        {imageUrl && (
          <div className="absolute left-[33%] top-[33%] h-[46%] w-[46%]">
            <CoverImage key={imageUrl} url={imageUrl} variant={variant} alt="" onFail={() => setImgFailed(true)} className="h-full w-full object-contain" />
          </div>
        )}
      </div>
      <span
        className={`${LETTERED} absolute right-[4cqw] top-[21cqw] origin-center -rotate-[20deg] whitespace-nowrap uppercase leading-none`}
        style={{ fontFamily: COMIC_FONT, fontSize: "15cqw", color: colors.ON_LOUD, textShadow: inkOutline(colors.SHADOW) }}
      >
        Complete!
      </span>
      <div
        className="absolute inset-x-[6cqw] top-[55cqw] border-[0.9cqw] px-[4cqw] py-[2.6cqw]"
        style={{ borderColor: colors.SHADOW, background: colors.PAPER_RAISED, color: colors.INK, boxShadow: `1.4cqw 1.4cqw 0 ${colors.SHADOW}` }}
      >
        <span className={`${LETTERED} mb-[1.6cqw] block uppercase leading-none`} style={{ fontFamily: COMIC_FONT, fontSize: "5.6cqw", letterSpacing: "0.05em", color: colors.INK_SUBTLE }}>
          Completed by
        </span>
        <ul className={`${LETTERED} flex flex-col gap-[1cqw] leading-none`} style={{ fontFamily: COMIC_FONT, fontSize: "7.6cqw", letterSpacing: "0.02em" }}>
          {shown.map((name) => (
            <li key={name} className="truncate">
              {name}
            </li>
          ))}
          {more > 0 && (
            <li className="truncate" style={{ color: colors.INK_SUBTLE }}>
              +{more} more
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
