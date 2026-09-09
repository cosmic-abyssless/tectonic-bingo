import type { BoardModel } from "../../headless/types";
import { TileCell } from "./TileCell";
import { CountdownTimer } from "../ui/CountdownTimer";
import { Notice } from "../ui/Card";
import { ClockIcon } from "../ui/icons";

export function BoardGrid({ board, onOpenTile }: { board: BoardModel; onOpenTile: (tileId: string) => void }) {
  return (
    <div className="w-full">
      {board.preStart.isPreStart && board.preStart.startsAt !== null && (
        <Notice tone="info" icon={<ClockIcon />} className="mb-3">
          Bingo starts in <CountdownTimer target={board.preStart.startsAt} className="text-fg" />. Look over the tiles now — submissions open when the timer hits zero.
        </Notice>
      )}

      <div className="overflow-x-auto">
        <div className="grid w-full gap-1" style={{ gridTemplateColumns: `${board.showRowLabels ? "auto " : ""}repeat(${board.cols}, minmax(65px, 1fr))` }}>
          {Array.from({ length: board.rows }, (_, row) => {
            const rowCategory = board.rowCategories[row] ?? null;
            return (
              <div key={`row-${row}`} className="contents">
                {board.showRowLabels && (
                  <div
                    className="flex items-center justify-center rounded-md border border-[var(--tile-border)] bg-[var(--tile-empty)] px-1.5 text-[11px] font-semibold uppercase tracking-widest text-fg-muted"
                    style={{
                      writingMode: "vertical-lr",
                      transform: "rotate(180deg)",
                      color: rowCategory?.color ?? undefined,
                      borderColor: rowCategory?.color ? `${rowCategory.color}66` : undefined,
                    }}
                  >
                    {rowCategory?.label ?? ""}
                  </div>
                )}
                {Array.from({ length: board.cols }, (_, col) => {
                  const tile = board.grid[row]?.[col];
                  if (!tile) return <div key={`empty-${row}-${col}`} className="aspect-square rounded-md border border-[var(--tile-border)] bg-[var(--tile-empty)]" />;
                  return <TileCell key={tile.id} tile={tile} onClick={() => onOpenTile(tile.id)} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
