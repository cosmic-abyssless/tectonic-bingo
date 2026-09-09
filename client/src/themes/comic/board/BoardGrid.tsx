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
    <div className="w-full">
      {board.preStart.isPreStart && board.preStart.startsAt !== null && <PreStartBanner startsAt={board.preStart.startsAt} />}

      {/* No overflow-x-auto here — the comic book's hover/focus lift on the
          top row needs room to spill upward, and that combination forces
          overflow-y to auto too (clipping it) with no way to opt out. Let
          the whole page scroll horizontally on narrow screens instead. */}
      <div className="grid w-full gap-2" style={{ gridTemplateColumns: `${board.showRowLabels ? "auto " : ""}repeat(${board.cols}, minmax(65px, 1fr))` }}>
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
