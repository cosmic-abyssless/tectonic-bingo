import { useEffect, useMemo, useState } from "react";
import type { Bingo, SubmissionDetails, TeamNodeState, Tile, TileCategory } from "@bingo/shared";
import { TileCell } from "./TileCell";
import { TileModal } from "./TileModal";
import { groupSubmissionsByTile } from "./tileProgress";
import { tileMatchesSearch } from "./requirementTree";
import { CountdownTimer } from "../ui/CountdownTimer";

function getRowCategory(tiles: Tile[], categories: TileCategory[], row: number): TileCategory | null {
  const rowTiles = tiles.filter((t) => t.boardRow === row);
  const catIds = new Set(rowTiles.map((t) => t.categoryId).filter((id): id is string => id !== null));
  if (catIds.size !== 1) return null;
  return categories.find((c) => c.id === [...catIds][0]) ?? null;
}

export function BoardGrid({
  bingo,
  tiles,
  categories,
  nodeStates,
  teamSubmissions,
  searchQuery,
  openTileId,
  onOpenTileHandled,
  onSubmitTile,
}: {
  bingo: Bingo;
  tiles: Tile[];
  categories: TileCategory[];
  nodeStates: TeamNodeState[];
  teamSubmissions: SubmissionDetails[];
  searchQuery?: string;
  openTileId?: string | null;
  onOpenTileHandled?: () => void;
  onSubmitTile?: (tileId: string) => void;
}) {
  const [selected, setSelected] = useState<Tile | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const submissionsByTile = useMemo(() => groupSubmissionsByTile(tiles, teamSubmissions), [tiles, teamSubmissions]);

  useEffect(() => {
    if (!openTileId) return;
    const tile = tiles.find((t) => t.id === openTileId);
    if (tile) {
      setSelected(tile);
      onOpenTileHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTileId]);

  // Tick every second until the last freeze window (relative to bingo start) has elapsed.
  useEffect(() => {
    if (!bingo.startsAt) return;
    const startMs = new Date(bingo.startsAt).getTime();
    const freezeTiles = tiles.filter((t) => t.hasFreezePeriod);
    const maxFreezeMs = freezeTiles.length ? Math.max(...freezeTiles.map((t) => t.freezeDurationMinutes)) * 60_000 : 0;
    const tickUntil = startMs + maxFreezeMs;
    if (Date.now() >= tickUntil) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= tickUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [bingo.startsAt, tiles]);

  const grid = new Map<number, Map<number, Tile>>();
  for (const tile of tiles) {
    if (!grid.has(tile.boardRow)) grid.set(tile.boardRow, new Map());
    grid.get(tile.boardRow)!.set(tile.boardCol, tile);
  }

  const q = (searchQuery ?? "").trim().toLowerCase();
  const matchingTileIds = q ? new Set(tiles.filter((t) => tileMatchesSearch(t, q)).map((t) => t.id)) : null;

  const rowCategories = Array.from({ length: bingo.boardRows }, (_, row) => getRowCategory(tiles, categories, row));
  const showLabelColumn = rowCategories.some((c) => c !== null);

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const startMs = bingo.startsAt ? new Date(bingo.startsAt).getTime() : null;
  // Board can be revealed before it goes live — show it, but dimmed with a countdown.
  const isPreStart = startMs !== null && now < startMs;

  return (
    <div className="w-full">
      <div className="relative">
        <div className={`overflow-x-auto${isPreStart ? " opacity-25 pointer-events-none select-none" : ""}`}>
          <div
            className="grid gap-1 w-full"
            style={{ gridTemplateColumns: `${showLabelColumn ? "auto " : ""}repeat(${bingo.boardCols}, minmax(65px, 1fr))` }}
          >
          {Array.from({ length: bingo.boardRows }, (_, row) => {
            const rowCategory = rowCategories[row];
            return (
              <div key={`row-${row}`} className="contents">
                {showLabelColumn && (
                  <div
                    className="flex items-center justify-center rounded-md border-2 text-[11px] font-bold uppercase tracking-widest px-1.5 border-slate-700 bg-slate-900/60 text-slate-400"
                    style={
                      rowCategory
                        ? {
                            writingMode: "vertical-lr",
                            transform: "rotate(180deg)",
                            color: rowCategory.colorHex ?? undefined,
                            borderColor: rowCategory.colorHex ?? undefined,
                            backgroundColor: rowCategory.colorHex ? `${rowCategory.colorHex}1a` : undefined,
                          }
                        : { writingMode: "vertical-lr", transform: "rotate(180deg)" }
                    }
                  >
                    {rowCategory?.label ?? ""}
                  </div>
                )}
                {Array.from({ length: bingo.boardCols }, (_, col) => {
                  const tile = grid.get(row)?.get(col);
                  if (!tile) return <div key={`empty-${row}-${col}`} className="aspect-square bg-slate-900/50 rounded-md border-2 border-slate-800" />;
                  return (
                    <TileCell
                      key={tile.id}
                      tile={tile}
                      bingoStartsAt={bingo.startsAt}
                      category={tile.categoryId ? categoryById.get(tile.categoryId) : undefined}
                      nodeStates={nodeStates}
                      teamSubmissions={teamSubmissions}
                      now={now}
                      dimmed={matchingTileIds !== null && !matchingTileIds.has(tile.id)}
                      onClick={() => setSelected(tile)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {isPreStart && startMs !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 bg-slate-900/90 border border-slate-700 rounded-xl px-10 py-8 shadow-xl">
            <p className="text-slate-300 text-sm font-semibold uppercase tracking-widest">Bingo starts in</p>
            <p className="text-white text-3xl font-bold text-center">
              <CountdownTimer target={startMs} />
            </p>
          </div>
        </div>
      )}
      </div>

      {selected && (
        <TileModal
          tile={selected}
          bingo={bingo}
          category={selected.categoryId ? categoryById.get(selected.categoryId) : undefined}
          nodeStates={nodeStates}
          teamSubmissions={submissionsByTile.get(selected.id) ?? []}
          onClose={() => setSelected(null)}
          onSubmit={onSubmitTile ? () => onSubmitTile(selected.id) : undefined}
        />
      )}
    </div>
  );
}
