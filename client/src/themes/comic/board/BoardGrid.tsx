import type { BoardModel } from "../../../headless/types";
import { useSlot } from "../../context";

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

  return (
    <div className="relative w-full">
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
        className="relative z-10 grid w-full gap-2"
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
                return <TileCell key={tile.id} tile={tile} onOpen={onOpenTile} isSearchHighlighted={tile.id === highlightedTileId} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
