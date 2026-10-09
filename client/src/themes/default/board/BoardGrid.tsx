import type { ReactNode } from "react";
import type { BoardModel, TileModel } from "../../../headless/types";
import { useSlot } from "../../context";
import { TileSearchSlot } from "../../../headless/TileSearchProvider";

export function BoardGrid({
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

  return (
    <div data-tutorial="board" className="w-full">
      {board.preStart.isPreStart && board.preStart.startsAt !== null && <PreStartBanner startsAt={board.preStart.startsAt} />}

      <div className="overflow-x-auto">
        <div className="grid w-full gap-1" style={{ gridTemplateColumns: `${board.showRowLabels ? "auto " : ""}repeat(${board.cols}, minmax(65px, 1fr))` }}>
          {Array.from({ length: board.rows }, (_, row) => {
            const rowCategory = board.rowCategories[row] ?? null;
            return (
              <div key={`row-${row}`} className="contents">
                {board.showRowLabels && <RowLabel category={rowCategory} />}
                {Array.from({ length: board.cols }, (_, col) => {
                  const tile = board.grid[row]?.[col];
                  if (!tile) return <EmptyCell key={`empty-${row}-${col}`} row={row} col={col} />;
                  return (
                    <TileSearchSlot key={tile.id} tileId={tile.id} className="relative" dimmedClassName="pointer-events-none opacity-20 saturate-0">
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
    </div>
  );
}
