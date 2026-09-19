import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTime } from "motion/react";
import type { BoardModel } from "../../../headless/types";
import { useSlot } from "../../context";
import { LineCompletionWash } from "./LineCompletionWash";
import { BOOST_MS, buildStopsByTileId } from "./linePulse";

// Smallest a tile is allowed to get when the board shrinks to fit the
// screen's height — below this the books stop being legible, so a short
// window scrolls instead.
const MIN_TILE_PX = 104;
// Air kept under the board (the page's own bottom padding).
const BOTTOM_AIR_PX = 24;

/**
 * The widest the board may be so that all of its rows fit between where the
 * grid starts and the bottom of the window: tiles are square and sized off
 * the board's width, so height is capped by capping width. Measured (not a
 * magic offset) because what sits above the grid — the header, the search
 * row, a wrapped banner — changes with screen size. Null until measured.
 */
function useFitWidth(gridRef: React.RefObject<HTMLDivElement | null>, rows: number, cols: number, minTile = MIN_TILE_PX) {
  const [maxWidth, setMaxWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const style = getComputedStyle(grid);
      const gap = parseFloat(style.rowGap) || 0;
      // With row labels the first track is theirs; it's `auto`, so read it.
      const tracks = style.gridTemplateColumns.split(" ").map(parseFloat);
      const labelW = tracks.length > cols ? (tracks[0] ?? 0) + gap : 0;
      const top = grid.getBoundingClientRect().top + window.scrollY;
      const avail = window.innerHeight - top - BOTTOM_AIR_PX;
      const widthFor = (tile: number) => cols * tile + (cols - 1) * gap + labelW;
      // Rounded DOWN, minus a couple of pixels of slack per tile: rounding
      // up (or fractional zoom levels) makes the grid a pixel or two too
      // tall, and that sliver is enough to summon a scrollbar — which then
      // narrows the window and re-triggers the whole thing. The minimum
      // tile is applied after, so the slack never eats into it.
      const fit = Math.floor(widthFor((avail - (rows - 1) * gap) / rows)) - 2 * cols;
      setMaxWidth(Math.max(Math.ceil(widthFor(minTile)), fit));
    };
    measure();
    window.addEventListener("resize", measure);
    // Fonts and images settling can move the grid's top.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [gridRef, rows, cols, minTile]);
  return maxWidth;
}

export function BoardGrid({
  board,
  onOpenTile,
  highlightedTileId,
}: {
  board: BoardModel;
  onOpenTile: (tileId: string) => void;
  highlightedTileId?: string | null;
}) {
  const RowLabel = useSlot("RowLabel");
  const TileCell = useSlot("TileCell");
  const EmptyCell = useSlot("EmptyCell");
  const PreStartBanner = useSlot("PreStartBanner");
  const gridRef = useRef<HTMLDivElement>(null);
  const fitWidth = useFitWidth(gridRef, board.rows, board.cols);
  const time = useTime();
  const linePulseKey = board.lines.map((line) => `${line.id}:${Number(line.complete)}:${line.tileIds.join(",")}`).join("|");
  const stopsByTileId = useMemo(() => {
    const posById = new Map(board.tiles.map((tile) => [tile.id, { row: tile.row, col: tile.col }]));
    return buildStopsByTileId(board.lines, posById);
  }, [linePulseKey]);
  const seenCompleteRef = useRef<Set<string> | null>(null);
  const boostedUntilRef = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const seen = seenCompleteRef.current;
    const completeIds = new Set(board.lines.filter((line) => line.complete).map((line) => line.id));
    if (seen === null) {
      seenCompleteRef.current = completeIds;
      return;
    }
    for (const id of completeIds) {
      if (!seen.has(id)) {
        seen.add(id);
        boostedUntilRef.current.set(id, Date.now() + BOOST_MS);
      }
    }
    for (const id of [...seen]) {
      if (!completeIds.has(id)) {
        seen.delete(id);
        boostedUntilRef.current.delete(id);
      }
    }
  }, [linePulseKey]);

  return (
    // On a phone the board runs edge to edge (cancelling the page's own
    // side padding) with no gaps between tiles, so the books get every pixel
    // there is. From `sm` up it's centered and no wider than fits the window
    // (see useFitWidth), so the whole board is on screen without scrolling.
    <div className="relative w-full max-sm:-mx-3 max-sm:w-auto sm:mx-auto" style={{ maxWidth: fitWidth ?? undefined }}>
      {/* Fades the page's halftone dots out toward the board's own center —
          a circle behind the grid, painted in the page's own background
          color and masked out toward the edges. `closest-side` sizes the
          circle off the grid's own (smaller) half-dimension, so 100% lands
          right at the board's own edge (mid-side) rather than off in the
          box's far corner — the clear zone below reaches out that whole
          radius, with just the four corners (outside the circle) left
          showing dots. Confined to the grid's own box (no inset) so
          nothing spills into the header/search area above. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundColor: "var(--color-background)",
          maskImage: "radial-gradient(circle closest-side, black 0%, black 55%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(circle closest-side, black 0%, black 55%, transparent 100%)",
        }}
      />
      {board.preStart.isPreStart && board.preStart.startsAt !== null && (
        <div className="relative z-10">
          <PreStartBanner startsAt={board.preStart.startsAt} />
        </div>
      )}

      {/* No overflow-x-auto here — the comic book's hover/focus lift on the
          top row needs room to spill upward, and that combination forces
          overflow-y to auto too (clipping it) with no way to opt out. Let
          the whole page scroll horizontally on narrow screens instead. */}
      <div
        ref={gridRef}
        className="relative z-10 grid w-full gap-2 max-sm:gap-0"
        style={{ gridTemplateColumns: `${board.showRowLabels ? "auto " : ""}repeat(${board.cols}, minmax(65px, 1fr))` }}
      >
        {Array.from({ length: board.rows }, (_, row) => {
          const rowCategory = board.rowCategories[row] ?? null;
          return (
            <div key={`row-${row}`} className="contents">
              {board.showRowLabels && <RowLabel category={rowCategory} />}
              {Array.from({ length: board.cols }, (_, col) => {
                const tile = board.grid[row]?.[col];
                if (!tile) return <EmptyCell key={`empty-${row}-${col}`} row={row} col={col} />;
                const stops = stopsByTileId.get(tile.id);
                return (
                  <div key={tile.id} className="relative aspect-square w-full">
                    {stops && !tile.dimmed && <LineCompletionWash time={time} stops={stops} boostedUntilRef={boostedUntilRef} />}
                    <TileCell tile={tile} onOpen={onOpenTile} isSearchHighlighted={tile.id === highlightedTileId} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
