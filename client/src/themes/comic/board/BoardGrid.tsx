import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BoardSize } from "@bingo/shared";
import type { BoardModel, TileModel } from "../../../headless/types";
import { useSlot } from "../../context";
import { LineCompletionWash } from "./LineCompletionWash";
import { TileSearchSlot, useTileDimmed } from "../../../headless/TileSearchProvider";
import { BOOST_MS, buildStopsByTileId } from "./linePulse";
import { useMyBoardSize } from "../../../core/settings/boardSize";

// Smallest a tile is allowed to get when the board shrinks to fit the
// screen's height — below this the books stop being legible, so a short
// window scrolls instead.
const MIN_TILE_PX = 104;
// The grid's own floor (its columns' minmax): Custom never goes narrower.
const GRID_MIN_TILE_PX = 65;
// Air kept under the board (the page's own bottom padding).
const BOTTOM_AIR_PX = 24;
// The page's side padding from `sm` up, kept beside a Maximized or Custom
// board too; under `sm` the board runs edge to edge.
const SIDE_AIR_PX = 24;
const SM_PX = 640;

/**
 * The board's size, as the style of its wrapper, for the viewer's Board size
 * (shared userSettings.ts). Tiles are square and sized off the board's
 * width, so every mode sets a width.
 *
 * Fit screen: the widest the board may be so that all of its rows fit
 * between where the grid starts and the bottom of the window, so height is
 * capped by capping width. Measured (not a magic offset) because what sits
 * above the grid — the header, the search row, a wrapped banner — changes
 * with screen size. Inside the page's own column, like everything else.
 *
 * Maximize and Custom leave that column: Maximize is as big as the
 * window's larger side (its width, or the width at which the rows fill its
 * height), Custom a percentage of its width. Either is centered while it
 * fits, and otherwise starts at the window's left and scrolls the page
 * sideways (the left of a centered board would be out of reach).
 */
function useBoardWidth(gridRef: React.RefObject<HTMLDivElement | null>, rows: number, cols: number, size: BoardSize): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const wrapper = grid?.parentElement;
    const column = wrapper?.parentElement;
    if (!grid || !wrapper || !column) return;
    // A new style object only when something changed: each one re-renders the whole grid.
    const apply = (next: CSSProperties) => setStyle((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    const measure = () => {
      const gridStyle = getComputedStyle(grid);
      const gap = parseFloat(gridStyle.rowGap) || 0;
      // With row labels the first track is theirs; it's `auto`, so read it.
      const tracks = gridStyle.gridTemplateColumns.split(" ").map(parseFloat);
      const labelW = tracks.length > cols ? (tracks[0] ?? 0) + gap : 0;
      const top = grid.getBoundingClientRect().top + window.scrollY;
      // clientWidth/Height leave out the window's own scrollbars.
      const root = document.documentElement;
      const availH = root.clientHeight - top - BOTTOM_AIR_PX;
      const widthFor = (tile: number) => cols * tile + (cols - 1) * gap + labelW;
      // Rounded DOWN, minus a couple of pixels of slack per tile: rounding
      // up (or fractional zoom levels) makes the grid a pixel or two too
      // tall, and that sliver is enough to summon a scrollbar — which then
      // narrows the window and re-triggers the whole thing. The minimum
      // tile is applied after, so the slack never eats into it.
      const heightFit = Math.floor(widthFor((availH - (rows - 1) * gap) / rows)) - 2 * cols;
      if (size.mode === "fit") {
        apply({ maxWidth: Math.max(Math.ceil(widthFor(MIN_TILE_PX)), heightFit) });
        return;
      }
      const side = root.clientWidth < SM_PX ? 0 : SIDE_AIR_PX;
      const availW = root.clientWidth - 2 * side;
      const wanted = size.mode === "maximize" ? Math.max(availW, heightFit) : Math.floor((availW * size.widthPercent) / 100);
      const width = Math.max(Math.ceil(widthFor(GRID_MIN_TILE_PX)), wanted);
      // Where the column's content starts on the page, and where the board should.
      const columnLeft = column.getBoundingClientRect().left + window.scrollX + parseFloat(getComputedStyle(column).paddingLeft);
      const left = side + Math.max(0, (availW - width) / 2);
      apply({ width, maxWidth: "none", marginLeft: left - columnLeft, marginRight: 0 });
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
  }, [gridRef, rows, cols, size.mode, size.widthPercent]);
  return style;
}

// Memoised: the page above re-renders as a Tile opens and closes, and the grid has nothing new to draw then (#470).
export const BoardGrid = memo(function BoardGrid({
  board,
  onOpenTile,
  highlightedTileId,
  tileOverlay,
}: {
  board: BoardModel;
  onOpenTile: (tileId: string) => void;
  highlightedTileId?: string | null;
  tileOverlay?: (tile: TileModel) => ReactNode;
}) {
  const RowLabel = useSlot("RowLabel");
  const TileCell = useSlot("TileCell");
  const EmptyCell = useSlot("EmptyCell");
  const PreStartBanner = useSlot("PreStartBanner");
  const gridRef = useRef<HTMLDivElement>(null);
  const boardSize = useMyBoardSize();
  const sizeStyle = useBoardWidth(gridRef, board.rows, board.cols, boardSize);
  const linePulseKey = board.lines.map((line) => `${line.id}:${Number(line.complete)}:${line.tileIds.join(",")}`).join("|");
  const stopsByTileId = useMemo(() => {
    const posById = new Map(board.tiles.map((tile) => [tile.id, { row: tile.row, col: tile.col }]));
    return buildStopsByTileId(board.lines, posById);
  }, [linePulseKey]);
  const seenCompleteRef = useRef<Set<string> | null>(null);
  // Lines that completed while the board was open, pulsing brighter for
  // BOOST_MS (comic-line-pulse-boost), each with the timer that ends it.
  const [boostedLineIds, setBoostedLineIds] = useState<ReadonlySet<string>>(() => new Set());
  const boostTimersRef = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const seen = seenCompleteRef.current;
    const completeIds = new Set(board.lines.filter((line) => line.complete).map((line) => line.id));
    if (seen === null) {
      seenCompleteRef.current = completeIds;
      return;
    }
    const timers = boostTimersRef.current;
    const endBoost = (id: string) => {
      window.clearTimeout(timers.get(id));
      timers.delete(id);
      setBoostedLineIds((boosted) => {
        if (!boosted.has(id)) return boosted;
        const next = new Set(boosted);
        next.delete(id);
        return next;
      });
    };
    for (const id of completeIds) {
      if (!seen.has(id)) {
        seen.add(id);
        window.clearTimeout(timers.get(id));
        timers.set(id, window.setTimeout(() => endBoost(id), BOOST_MS));
        setBoostedLineIds((boosted) => new Set(boosted).add(id));
      }
    }
    for (const id of [...seen]) {
      if (!completeIds.has(id)) {
        seen.delete(id);
        endBoost(id);
      }
    }
  }, [linePulseKey]);
  useEffect(() => {
    const timers = boostTimersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return (
    // On a phone the board runs edge to edge (cancelling the page's own
    // side padding) with no gaps between tiles, so the books get every pixel
    // there is. From `sm` up it's centered and, at Fit screen, no wider than
    // fits the window, so the whole board is on screen without scrolling;
    // the other Board sizes set their own width (see useBoardWidth).
    <div data-tutorial="board" className="relative w-full max-sm:-mx-3 max-sm:w-auto sm:mx-auto" style={sizeStyle}>
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
                  <TileSearchSlot key={tile.id} tileId={tile.id} className="relative aspect-square w-full" dimmedClassName="pointer-events-none opacity-20 saturate-0">
                    {stops && <UndimmedWash tileId={tile.id} stops={stops} boostedLineIds={boostedLineIds} />}
                    <TileCell tile={tile} onOpen={onOpenTile} isSearchHighlighted={tile.id === highlightedTileId} />
                    {tileOverlay?.(tile)}
                  </TileSearchSlot>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});

/** A line's completion wash over a Tile, but not one the board's search dims (it reads that on its own, TileSearchProvider). */
function UndimmedWash({ tileId, ...wash }: { tileId: string } & Parameters<typeof LineCompletionWash>[0]) {
  return useTileDimmed(tileId) ? null : <LineCompletionWash {...wash} />;
}
