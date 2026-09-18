import { useState } from "react";
import type { TileModel } from "../../../headless/types";
import { COMIC_FONT, COMIC_LOGO_FONT } from "../font";
import { getContrastTextColor, useDominantColor } from "../useDominantColor";
import type { ComicColors } from "./colors";

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
  return { label: `P${completedTasks + 1}`, dogEared: completedTasks > 0 };
}

export function BookCoverArt({
  tile,
  colors,
  fallbackColor,
  frozen = false,
}: {
  tile: TileModel;
  colors: ComicColors;
  /** Cover color while the artwork's dominant color is loading, or when there's no artwork. */
  fallbackColor: string;
  frozen?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = tile.imageUrl && !imgFailed ? tile.imageUrl : null;
  const dominantColor = useDominantColor(imageUrl);
  // The masthead row and the plain "P1" mark sit directly on the cover with
  // no fill of their own, so their color adapts to whatever the cover color
  // turns out to be, not the other way around.
  const priceTextColor = getContrastTextColor(dominantColor);
  const { pointsAwarded, totalPoints } = tile.progress;
  const mark = coverTaskMark(tile);

  return (
    <div
      className="absolute inset-0 overflow-hidden transition-colors duration-200 [container-type:inline-size]"
      style={{ backgroundColor: dominantColor ?? fallbackColor }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={tile.name}
          onError={() => setImgFailed(true)}
          className={`absolute inset-0 h-fit w-full object-contain p-[8%] pt-[18%] ${frozen ? "opacity-30 saturate-0" : ""}`}
          style={{ objectPosition: "50% 35%" }}
          draggable={false}
        />
      ) : null}
      {/* Masthead + the tile's points, left-aligned in a row so the score
          reads right off the logo instead of floating in its own corner. */}
      <div className="absolute inset-x-[3cqw] top-[3.5cqw] flex items-baseline gap-[1.8cqw]">
        <span
          className="w-fit h-fit shrink-0 truncate px-[0.35em] py-[0.15em] text-center uppercase leading-none"
          style={{
            backgroundColor: "#d2412d",
            color: "#fff",
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
