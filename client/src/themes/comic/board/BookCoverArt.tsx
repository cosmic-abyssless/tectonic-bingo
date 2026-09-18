import { useState } from "react";
import type { TileModel } from "../../../headless/types";
import { COMIC_FONT, COMIC_LOGO_FONT } from "../font";
import { getContrastTextColor, useDominantColor } from "../useDominantColor";
import { thumbUrl, fullUrl } from "../../../api/imageVariants";
import { TECTONIC_LOGO, type ComicColors } from "./colors";

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
  const imageUrl = tile.imageUrl && !imgFailed ? (variant === "thumb" ? thumbUrl(tile.imageUrl) : fullUrl(tile.imageUrl)) : null;
  const dominantColor = useDominantColor(imageUrl);
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
          <img
            src={imageUrl}
            alt={tile.name}
            onError={() => setImgFailed(true)}
            className={`block h-auto w-full ${frozen ? "opacity-30 saturate-0" : ""}`}
            draggable={false}
          />
        </div>
      ) : null}
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
        <span className="leading-none whitespace-nowrap" style={{ color: priceTextColor, fontFamily: COMIC_FONT, fontSize: "7cqw" }}>
          {pointsAwarded}/{totalPoints}
          <span style={{ fontSize: "0.7em", marginLeft: "0.04em" }}>¢</span>
        </span>
      </div>

      {/* Which task the cover's currently pointing to, while it's still a
          plain mark. Once dog-eared, ClosedBook draws it on the fold. */}
      {mark && !mark.dogEared && (
        <div
          className="absolute right-[4cqw] top-[4cqw] leading-none"
          style={{ color: priceTextColor, fontFamily: COMIC_FONT, fontSize: "8.3cqw" }}
        >
          {mark.label}
        </div>
      )}
    </div>
  );
}

/** How many names the back cover lists before "+N more". */
const BACK_COVER_NAMES = 4;

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

function PointsRow({ label, points }: { label: string; points: number }) {
  return (
    <li className="flex items-baseline justify-between gap-[2cqw]">
      <span className="truncate">{label}</span>
      <span className="num shrink-0">{points}¢</span>
    </li>
  );
}

/**
 * The back of a finished tile's comic book: the same cover color as the
 * front, a "THE END" and a credits box listing everyone who contributed.
 * Interior only, like BookCoverArt — the caller (ClosedBook) owns the
 * bordered, back-facing element it fills — and likewise sized entirely in
 * container-query units of the cover's own width, so it's the same drawing
 * on the tile and in the modal's flying copy.
 */
export function BookBackArt({
  tile,
  colors,
  fallbackColor,
  variant = "thumb",
}: {
  tile: TileModel;
  colors: ComicColors;
  fallbackColor: string;
  /** Which display variant of the artwork to load — same as the front cover's. */
  variant?: "thumb" | "full";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = tile.imageUrl && !imgFailed ? (variant === "thumb" ? thumbUrl(tile.imageUrl) : fullUrl(tile.imageUrl)) : null;
  const dominantColor = useDominantColor(imageUrl);
  const textColor = getContrastTextColor(dominantColor ?? fallbackColor);
  const names = tileContributors(tile);
  const shown = names.slice(0, BACK_COVER_NAMES);
  const more = names.length - shown.length;

  return (
    // The container is this outer box; the cqw lengths live one level down
    // (a box's own cqw resolve against its ancestor's container, not itself).
    <div className="absolute inset-0 overflow-hidden [container-type:inline-size]" style={{ backgroundColor: dominantColor ?? fallbackColor, color: textColor }}>
      <div className="absolute inset-0 flex flex-col items-center gap-[3cqw] px-[6cqw] pb-[6cqw] pt-[6cqw]">
        <span className="uppercase leading-none" style={{ fontFamily: COMIC_LOGO_FONT, fontWeight: 800, fontSize: "13cqw", letterSpacing: "0.03em" }}>
          The End
        </span>
        {/* The cover art again, smaller, with a big check stamped on its
            corner so a finished tile reads as done at a glance — and beside
            it what the tile paid out, part by part. */}
        <div className="flex w-full shrink-0 items-center gap-[5cqw] pl-[3cqw]">
          <div className="relative h-[34cqw] w-[34cqw] shrink-0">
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                onError={() => setImgFailed(true)}
                className="h-full w-full object-contain"
                style={{ filter: `drop-shadow(1.2cqw 1.2cqw 0 ${colors.LINE})` }}
                draggable={false}
              />
            )}
            <span
              className="absolute -left-[5cqw] -top-[4cqw] flex h-[14cqw] w-[14cqw] -rotate-[8deg] items-center justify-center rounded-full"
              style={{ background: colors.GREEN, border: `1cqw solid ${colors.LINE}`, boxShadow: `1.2cqw 1.2cqw 0 ${colors.LINE}`, color: colors.ON_LOUD }}
            >
              <svg viewBox="0 0 16 16" className="h-[8.5cqw] w-[8.5cqw]" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-label="Complete">
                <path d="M3 8.5l3 3 7-7" />
              </svg>
            </span>
          </div>
          <ul className="flex min-w-0 flex-1 flex-col gap-[1.4cqw] leading-none" style={{ fontFamily: COMIC_FONT, fontSize: "7.4cqw", letterSpacing: "0.02em" }}>
            {tile.tasks.map((task, i) => (
              <PointsRow key={task.id} label={task.label || `Part ${i + 1}`} points={task.pointsAwarded} />
            ))}
            {tile.progress.bonusAwarded > 0 && <PointsRow label="Bonus" points={tile.progress.bonusAwarded} />}
            <li className="mt-[1cqw] flex items-baseline justify-between gap-[2cqw] border-t-[0.9cqw] pt-[1.6cqw]" style={{ borderColor: "currentcolor", fontSize: "10cqw" }}>
              <span>Total</span>
              <span className="num shrink-0">{tile.progress.pointsAwarded}¢</span>
            </li>
          </ul>
        </div>
        <div
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-[0.9cqw] px-[4cqw] py-[3.5cqw]"
          style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, color: colors.INK, boxShadow: `1.6cqw 1.6cqw 0 ${colors.LINE}` }}
        >
          <span className="mb-[2cqw] uppercase leading-none" style={{ fontFamily: COMIC_FONT, fontSize: "6.6cqw", letterSpacing: "0.04em", color: colors.INK_SUBTLE }}>
            Completed by
          </span>
          <ul className="flex min-h-0 flex-col gap-[1.2cqw] leading-none" style={{ fontFamily: COMIC_FONT, fontSize: "8.4cqw", letterSpacing: "0.02em" }}>
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
    </div>
  );
}
