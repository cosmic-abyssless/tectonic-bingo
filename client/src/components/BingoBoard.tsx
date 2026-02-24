import { useState, useEffect } from "react";
import type {
  BoardTile,
  BoardResponse,
  BadgeCategory,
  TileProgress,
  SubmissionSummary,
} from "../types";
import { TileModal } from "./TileModal";
import { TileCell } from "./TileCell";
import { formatDuration } from "../utils";

const BADGE_LABEL: Record<BadgeCategory, string> = {
  demonic: "Demonic",
  draconic: "Draconic",
  spectral: "Spectral",
  animalistic: "Animalistic",
  god_wars: "God Wars",
  vampyric: "Vampyric",
  desert: "Desert",
};

const BADGE_ROW_STYLE: Record<BadgeCategory, string> = {
  demonic: "bg-red-950/60     text-red-400     border-red-800",
  draconic: "bg-emerald-950/60 text-emerald-400 border-emerald-800",
  spectral: "bg-purple-950/60  text-purple-400  border-purple-800",
  animalistic: "bg-orange-950/60  text-orange-400  border-orange-800",
  god_wars: "bg-yellow-950/60  text-yellow-400  border-yellow-800",
  vampyric: "bg-rose-950/60    text-rose-400    border-rose-800",
  desert: "bg-amber-950/60   text-amber-400   border-amber-800",
};

const ROW_ORDER: BadgeCategory[] = [
  "demonic",
  "draconic",
  "spectral",
  "animalistic",
  "god_wars",
  "vampyric",
  "desert",
];

export function BingoBoard({
  tileProgress,
  tileSubmissions,
  onSubmitTile,
  onEvent,
  onBoardLoaded,
  searchQuery,
  openTileId,
  onOpenTileHandled,
}: {
  tileProgress?: Map<string, TileProgress>;
  tileSubmissions?: Map<string, SubmissionSummary[]>;
  onSubmitTile?: (tileId: string) => void;
  onEvent?: (event: BoardResponse["event"]) => void;
  onBoardLoaded?: (tiles: BoardTile[]) => void;
  searchQuery?: string;
  openTileId?: string | null;
  onOpenTileHandled?: () => void;
}) {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BoardTile | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // DEV ONLY — remove before deploy
  const [devOverride, setDevOverride] = useState(
    () => localStorage.getItem("dev_board_override") === "true",
  );

  useEffect(() => {
    fetch("/api/board")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: BoardResponse) => {
        setBoard(data);
        onEvent?.(data.event);
        onBoardLoaded?.(data.tiles);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open a tile selected from the search dropdown in Home
  useEffect(() => {
    if (!openTileId || !board) return;
    const tile = board.tiles.find((t) => t.id === openTileId);
    if (tile) {
      setSelected(tile);
      onOpenTileHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTileId]);

  // Tick every second from now until event start + max freeze expiry
  useEffect(() => {
    if (!board) return;
    const eventStart = new Date(board.event.startsAt).getTime();
    const freezeTiles = board.tiles.filter((t) => t.hasFreezePeriod);
    const maxFreezeMs = freezeTiles.length
      ? Math.max(...freezeTiles.map((t) => t.freezeDurationMinutes)) * 60_000
      : 0;
    const tickUntil = eventStart + maxFreezeMs;

    if (Date.now() >= tickUntil) return; // pre-event and freeze already past

    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= tickUntil) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [board]);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        Loading board…
      </div>
    );
  if (error)
    return (
      <div className="flex items-center justify-center py-20 text-red-400">
        Error: {error}
      </div>
    );
  if (!board) return null;

  const eventStart = new Date(board.event.startsAt).getTime();
  // TODO — remove devOverride before deploy
  const isPreEvent = now < eventStart && !devOverride;

  const grid = new Map<number, Map<number, BoardTile>>();
  for (const tile of board.tiles) {
    if (!grid.has(tile.boardRow)) grid.set(tile.boardRow, new Map());
    grid.get(tile.boardRow)!.set(tile.boardCol, tile);
  }

  const q = (searchQuery ?? "").trim().toLowerCase();
  const matchingTileIds = q
    ? new Set(
        board.tiles
          .filter((tile) => {
            if (tile.name.toLowerCase().includes(q)) return true;
            for (const side of Object.values(tile.sides)) {
              if (!side) continue;
              if (side.description.toLowerCase().includes(q)) return true;
              for (const item of side.items) {
                if (item.itemName.toLowerCase().includes(q)) return true;
              }
            }
            return false;
          })
          .map((t) => t.id),
      )
    : null; // null = no active search, all tiles shown normally

  return (
    <div className="w-full">
      {/* Board grid + optional pre-event overlay */}
      <div className="relative">
        {/* Grid — dimmed and non-interactive before event starts */}
        <div
          className={`overflow-x-auto${isPreEvent ? " opacity-25 pointer-events-none select-none" : ""}`}
        >
          <div
            className="grid gap-1 w-full"
            style={{ gridTemplateColumns: "auto repeat(7, minmax(65px, 1fr))" }}
          >
            {ROW_ORDER.map((category, row) => (
              <>
                {/* Badge label — vertical text, sized by content */}
                <div
                  key={`label-${row}`}
                  className={`flex items-center justify-center rounded-md border-2 text-[11px] font-bold uppercase tracking-widest px-1.5 ${BADGE_ROW_STYLE[category]}`}
                  style={{
                    writingMode: "vertical-lr",
                    transform: "rotate(180deg)",
                  }}
                >
                  {BADGE_LABEL[category]}
                </div>

                {/* 7 tile cells */}
                {Array.from({ length: 7 }, (_, col) => {
                  const tile = grid.get(row)?.get(col);
                  const freezeUnlocksAt = tile?.hasFreezePeriod
                    ? eventStart + tile.freezeDurationMinutes * 60_000
                    : undefined;
                  return tile ? (
                    <TileCell
                      key={tile.id}
                      tile={tile}
                      progress={tileProgress?.get(tile.id)}
                      now={now}
                      freezeUnlocksAt={freezeUnlocksAt}
                      dimmed={
                        matchingTileIds !== null &&
                        !matchingTileIds.has(tile.id)
                      }
                      onClick={() => setSelected(tile)}
                    />
                  ) : (
                    <div
                      key={`empty-${row}-${col}`}
                      className="aspect-square bg-slate-900/50 rounded-md border-2 border-slate-800"
                    />
                  );
                })}
              </>
            ))}
          </div>
        </div>

        {/* Pre-event overlay */}
        {isPreEvent && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-3 bg-slate-900/90 border border-slate-700 rounded-xl px-10 py-8 shadow-xl">
              <p className="text-slate-300 text-sm font-semibold uppercase tracking-widest">
                Bingo starts in
              </p>
              <p className="text-white text-3xl font-bold text-center">
                {formatDuration(eventStart - now)}
              </p>
              {/* DEV ONLY override, remove before deploy */}
              <button
                onClick={() => {
                  localStorage.setItem("dev_board_override", "true");
                  setDevOverride(true);
                }}
                className="pointer-events-auto mt-2 text-xs text-slate-600 hover:text-slate-400 border border-slate-700 hover:border-slate-600 rounded px-3 py-1 transition-colors cursor-pointer"
              >
                [DEV] Override
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <TileModal
          tile={selected}
          onClose={() => setSelected(null)}
          onSubmit={onSubmitTile ? () => onSubmitTile(selected.id) : undefined}
          progress={tileProgress?.get(selected.id)}
          submissions={tileSubmissions?.get(selected.id)}
        />
      )}
    </div>
  );
}
