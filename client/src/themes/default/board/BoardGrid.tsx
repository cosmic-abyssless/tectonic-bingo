import type { BoardModel } from "../../../headless/types";
import { useSlot } from "../../context";

export function BoardGrid({ board, onOpenTile }: { board: BoardModel; onOpenTile: (tileId: string) => void }) {
  const RowLabel = useSlot("RowLabel");
  const TileCell = useSlot("TileCell");
  const EmptyCell = useSlot("EmptyCell");
  const PreStartBanner = useSlot("PreStartBanner");

  return (
    <div className="w-full">
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
                  return <TileCell key={tile.id} tile={tile} onOpen={onOpenTile} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
