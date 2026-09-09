import { useEffect, useMemo, useState } from "react";
import type { Bingo, SubmissionDetails, TeamNodeState, Tile, TileCategory } from "@bingo/shared";
import { TileCell } from "./TileCell";
import { TileModal } from "./TileModal";
import { groupSubmissionsByTile } from "./tileProgress";
import { tileMatchesSearch } from "./requirementTree";
import { CountdownTimer } from "../ui/CountdownTimer";
import { Notice } from "../ui/Card";
import { ClockIcon } from "../ui/icons";

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
  // The board is revealed before it goes live so teams can plan. Keep it
  // fully inspectable; a banner carries the countdown instead of an overlay.
  const isPreStart = startMs !== null && now < startMs;

  return (
    <div className="w-full">
      {isPreStart && startMs !== null && (
        <Notice tone="info" icon={<ClockIcon />} className="mb-3">
          Bingo starts in <CountdownTimer target={startMs} className="text-fg" />. Look over the tiles now — submissions open when the timer hits zero.
        </Notice>
      )}

      <div className="overflow-x-auto">
        <div className="grid w-full gap-1" style={{ gridTemplateColumns: `${showLabelColumn ? "auto " : ""}repeat(${bingo.boardCols}, minmax(65px, 1fr))` }}>
          {Array.from({ length: bingo.boardRows }, (_, row) => {
            const rowCategory = rowCategories[row];
            return (
              <div key={`row-${row}`} className="contents">
                {showLabelColumn && (
                  <div
                    className="flex items-center justify-center rounded-md border border-[var(--tile-border)] bg-[var(--tile-empty)] px-1.5 text-[11px] font-semibold uppercase tracking-widest text-fg-muted"
                    style={{
                      writingMode: "vertical-lr",
                      transform: "rotate(180deg)",
                      color: rowCategory?.colorHex ?? undefined,
                      borderColor: rowCategory?.colorHex ? `${rowCategory.colorHex}66` : undefined,
                    }}
                  >
                    {rowCategory?.label ?? ""}
                  </div>
                )}
                {Array.from({ length: bingo.boardCols }, (_, col) => {
                  const tile = grid.get(row)?.get(col);
                  if (!tile) return <div key={`empty-${row}-${col}`} className="aspect-square rounded-md border border-[var(--tile-border)] bg-[var(--tile-empty)]" />;
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

      <TileModal
        tile={selected}
        bingo={bingo}
        category={selected?.categoryId ? categoryById.get(selected.categoryId) : undefined}
        nodeStates={nodeStates}
        teamSubmissions={selected ? submissionsByTile.get(selected.id) ?? [] : []}
        onClose={() => setSelected(null)}
        onSubmit={onSubmitTile && selected ? () => onSubmitTile(selected.id) : undefined}
      />
    </div>
  );
}
