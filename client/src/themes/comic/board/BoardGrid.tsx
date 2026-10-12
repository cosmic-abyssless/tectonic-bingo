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
// Air kept under a board that fits its column (the page's own bottom padding).
const BOTTOM_AIR_PX = 24;
// Under `sm` the Board page's board runs edge to edge; from there up it keeps
// its scroll box's side padding.
const SM_PX = 640;
// The Board page's scroll box is never shorter than this, however much sits
// above it: past that the page scrolls too.
const MIN_SCROLLER_PX = 240;

interface BoardLayout {
  /** The Board page's scroll box (fillsPage only), and the clip box in it. */
  scroller?: CSSProperties;
  clip?: CSSProperties;
  board?: CSSProperties;
  /** The row labels' track and the gap after it, 0 without them: the grid's rows are sized off what's left. */
  labelWidth: number;
}

/**
 * The board's size, as styles for its wrapper and (the Board page's) scroll
 * box. Tiles are square and sized off the board's width, so every size is a
 * width. Measured (not a magic offset) because what sits above the grid —
 * the header, the search row, a wrapped banner — changes with screen size.
 *
 * Without fillsPage (Rewind, the Draft board's preview) the board fits its
 * column: the widest it may be so that all of its rows fit between where
 * the grid starts and the bottom of the window, so height is capped by
 * capping width; the page scrolls past that.
 *
 * With it (the Board page) the board is in a scroll box of its own, from
 * where it starts to the bottom of the window and the window's full width,
 * so only the board scrolls (both ways, touch included) and everything above
 * it stays put. Inside, the viewer's Board size (shared userSettings.ts):
 * Fit screen fits the box (and the page's column, as before); Maximize is as
 * big as the box's larger side, Custom a percentage of its width. Either is
 * centered while it fits, and otherwise starts at the box's left.
 */
function useBoardLayout(
  gridRef: React.RefObject<HTMLDivElement | null>,
  scrollerRef: React.RefObject<HTMLDivElement | null>,
  rows: number,
  cols: number,
  size: BoardSize | null,
): BoardLayout {
  const [layout, setLayout] = useState<BoardLayout>({ labelWidth: 0 });
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const scroller = scrollerRef.current;
    const main = scroller?.parentElement;
    if (!grid) return;
    // A new layout only when something changed: each one re-renders the whole
    // grid. A change is measured again on the next frame, until it settles:
    // the box taking the board's height off the page takes the page's
    // scrollbar away, widening the window, and nothing observable says so.
    let applied = "";
    let frame = 0;
    const apply = (next: BoardLayout) => {
      const json = JSON.stringify(next);
      if (json === applied) return;
      applied = json;
      setLayout((prev) => (JSON.stringify(prev) === json ? prev : next));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const measure = () => {
      // Pinch-zoomed in: kept as it was. Safari gives the zoomed-in part of the page as the window's size (and says
      // it resized), which squeezed the board's box to its minimum until zoomed back out.
      if ((window.visualViewport?.scale ?? 1) > 1.01) return;
      const gridStyle = getComputedStyle(grid);
      const gap = parseFloat(gridStyle.rowGap) || 0;
      // With row labels the first track is theirs; it's `auto`, so read it.
      const tracks = gridStyle.gridTemplateColumns.split(" ").map(parseFloat);
      const labelW = tracks.length > cols ? (tracks[0] ?? 0) + gap : 0;
      const widthFor = (tile: number) => cols * tile + (cols - 1) * gap + labelW;
      // Rounded DOWN, minus a couple of pixels of slack per tile: rounding
      // up (or fractional zoom levels) makes the grid a pixel or two too
      // tall, and that sliver is enough to summon a scrollbar — which then
      // narrows the space and re-triggers the whole thing. The minimum tile
      // is applied after, so the slack never eats into it.
      const fitHeight = (availH: number) => Math.floor(widthFor((availH - (rows - 1) * gap) / rows)) - 2 * cols;
      const minFit = Math.ceil(widthFor(MIN_TILE_PX));
      // clientWidth/Height leave out the window's own scrollbars.
      const root = document.documentElement;

      if (!size || !scroller || !main) {
        const top = grid.getBoundingClientRect().top + window.scrollY;
        apply({ labelWidth: labelW, board: { maxWidth: Math.max(minFit, fitHeight(root.clientHeight - top - BOTTOM_AIR_PX)) } });
        return;
      }

      // The scroll box: the window's full width (out of the page's column), down to the bottom of the window less
      // the page's own bottom padding, so the page itself never scrolls. innerHeight too: on a phone it's the part
      // its browser's toolbars leave.
      const mainStyle = getComputedStyle(main);
      const mainRect = main.getBoundingClientRect();
      const mainContentLeft = mainRect.left + parseFloat(mainStyle.paddingLeft);
      const mainContentWidth = mainRect.width - parseFloat(mainStyle.paddingLeft) - parseFloat(mainStyle.paddingRight);
      const viewportH = Math.min(root.clientHeight, window.innerHeight);
      const scrollerTop = scroller.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(MIN_SCROLLER_PX, Math.floor(viewportH - scrollerTop - parseFloat(mainStyle.paddingBottom)));
      // Inside it: less the clip box's padding, any scrollbars it has now, and anything in the board above the grid
      // (the pre-start banner).
      const clipStyle = getComputedStyle(scroller.firstElementChild ?? scroller);
      const side = parseFloat(clipStyle.paddingLeft);
      const scrollbarW = scroller.offsetWidth - scroller.clientWidth;
      const scrollbarH = scroller.offsetHeight - scroller.clientHeight;
      const aboveGrid = grid.getBoundingClientRect().top - (grid.parentElement ?? grid).getBoundingClientRect().top;
      const availW = root.clientWidth - scrollbarW - 2 * side;
      const availH = height - scrollbarH - parseFloat(clipStyle.paddingTop) - parseFloat(clipStyle.paddingBottom) - aboveGrid;
      const heightFit = fitHeight(availH);
      const scrollerLayout: CSSProperties = { width: root.clientWidth, marginLeft: -mainContentLeft, height };

      if (size.mode === "fit") {
        // No wider than the page's column from `sm` up, as before the board had a box of its own.
        const cap = root.clientWidth < SM_PX ? Infinity : mainContentWidth;
        apply({ labelWidth: labelW, scroller: scrollerLayout, board: { maxWidth: Math.min(cap, Math.max(minFit, heightFit)) } });
        return;
      }
      const wanted = size.mode === "maximize" ? Math.max(availW, heightFit) : Math.floor((availW * size.widthPercent) / 100);
      const width = Math.max(Math.ceil(widthFor(GRID_MIN_TILE_PX)), wanted);
      // The clip box grows with a board wider than the scroll box, so it's what scrolls sideways.
      apply({ labelWidth: labelW, scroller: scrollerLayout, clip: width > availW ? { width: width + 2 * side } : undefined, board: { width, maxWidth: "none" } });
    };
    measure();
    window.addEventListener("resize", measure);
    // Zooming back out, which not every browser calls a resize.
    window.visualViewport?.addEventListener("resize", measure);
    // Fonts and images settling can move the grid's top; the box's own
    // scrollbars coming and going change the room inside it. The page's
    // column changes height when something above the box comes or goes (a
    // Catch-up card dismissed), which the body, at least a screen tall,
    // doesn't.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    if (scroller) ro.observe(scroller);
    if (main) ro.observe(main);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [gridRef, scrollerRef, rows, cols, size?.mode, size?.widthPercent]);
  return layout;
}

// Memoised: the page above re-renders as a Tile opens and closes, and the grid has nothing new to draw then (#470).
export const BoardGrid = memo(function BoardGrid({
  board,
  onOpenTile,
  highlightedTileId,
  tileOverlay,
  fillsPage = false,
}: {
  board: BoardModel;
  onOpenTile: (tileId: string) => void;
  highlightedTileId?: string | null;
  tileOverlay?: (tile: TileModel) => ReactNode;
  fillsPage?: boolean;
}) {
  const RowLabel = useSlot("RowLabel");
  const TileCell = useSlot("TileCell");
  const EmptyCell = useSlot("EmptyCell");
  const PreStartBanner = useSlot("PreStartBanner");
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const boardSize = useMyBoardSize();
  const layout = useBoardLayout(gridRef, scrollerRef, board.rows, board.cols, fillsPage ? boardSize : null);
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

  const boardEl = (
    // On a phone the board runs edge to edge (cancelling the page's own
    // side padding, or in the Board page's scroll box, which has none there)
    // with no gaps between tiles, so the books get every pixel there is. From
    // `sm` up it's centered, and its width is useBoardLayout's.
    // A size container, so the grid's rows can be sized off its width.
    <div data-tutorial="board" className={`relative w-full [container-type:inline-size] ${fillsPage ? "mx-auto" : "max-sm:-mx-3 max-sm:w-auto sm:mx-auto"}`} style={layout.board}>
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

      {/* Each row is exactly as tall as a column is wide, set rather than
          left to the Tiles' own aspect-ratio: WebKit sizes rows from that
          against the grid's width before it changed, so a widened board's
          rows (and the box around it) stayed at the old height. */}
      <div
        ref={gridRef}
        className="relative z-10 grid w-full gap-[var(--gap)] [--gap:0.5rem] max-sm:[--gap:0px]"
        style={{
          gridTemplateColumns: `${board.showRowLabels ? "auto " : ""}repeat(${board.cols}, minmax(65px, 1fr))`,
          gridAutoRows: `max(65px, calc((100cqw - ${layout.labelWidth}px - ${board.cols - 1} * var(--gap)) / ${board.cols}))`,
        }}
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
                // min-h-0: an aspect-ratio box grows to its content's height, and a completed Tile's "Completed by"
                // list is a few pixels taller than its square, which made Fit screen's board (sized as square tiles)
                // run a few pixels past the window, enough to scroll. Kept square, the list is clipped as it already
                // was.
                return (
                  <TileSearchSlot key={tile.id} tileId={tile.id} className="relative aspect-square min-h-0 w-full" dimmedClassName="pointer-events-none opacity-20 saturate-0">
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
  if (!fillsPage) return boardEl;
  return (
    // The Board page's scroll box (useBoardLayout): only the board scrolls,
    // both ways, and on a touch screen with a finger too; overscroll-contain
    // keeps a fling at its edge from scrolling (or reloading) the page.
    <div ref={scrollerRef} className="-mt-4 overflow-auto overscroll-contain" style={layout.scroller}>
      {/* Clips what hangs past the board, as the page's own clip did before
          the board had a box of its own: each book's frame runs a third of a
          Tile below its cell, cut off by its clip-path, which hides it but
          would still give the box that much to scroll. Clipped at its padding,
          which is room for the top row's hover lift and corner badges (pulled
          up over the search row's margin, so the gap above the board looks as
          it did) and, from `sm` up, the page's side padding. As wide as the
          board when that's wider than the box. */}
      <div className="overflow-clip pt-4 pb-2 sm:px-6" style={layout.clip}>
        {boardEl}
      </div>
    </div>
  );
});

/** A line's completion wash over a Tile, but not one the board's search dims (it reads that on its own, TileSearchProvider). */
function UndimmedWash({ tileId, ...wash }: { tileId: string } & Parameters<typeof LineCompletionWash>[0]) {
  return useTileDimmed(tileId) ? null : <LineCompletionWash {...wash} />;
}
