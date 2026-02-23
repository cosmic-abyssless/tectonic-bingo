import { useState, useEffect } from "react";
import type { BoardTile, BoardResponse, BadgeCategory } from "../types";
import { TileModal } from "./TileModal";

const BADGE_LABEL: Record<BadgeCategory, string> = {
  demonic:     "Demonic",
  draconic:    "Draconic",
  spectral:    "Spectral",
  animalistic: "Animalistic",
  god_wars:    "God Wars",
  vampyric:    "Vampyric",
  desert:      "Desert",
};

const BADGE_ROW_STYLE: Record<BadgeCategory, string> = {
  demonic:     "bg-red-950/60 text-red-400 border-r-red-500",
  draconic:    "bg-emerald-950/60 text-emerald-400 border-r-emerald-500",
  spectral:    "bg-purple-950/60 text-purple-400 border-r-purple-500",
  animalistic: "bg-orange-950/60 text-orange-400 border-r-orange-500",
  god_wars:    "bg-yellow-950/60 text-yellow-400 border-r-yellow-500",
  vampyric:    "bg-rose-950/60 text-rose-400 border-r-rose-500",
  desert:      "bg-amber-950/60 text-amber-400 border-r-amber-500",
};

const BADGE_TILE_HOVER: Record<BadgeCategory, string> = {
  demonic:     "hover:border-red-500 hover:bg-red-950/40",
  draconic:    "hover:border-emerald-500 hover:bg-emerald-950/40",
  spectral:    "hover:border-purple-500 hover:bg-purple-950/40",
  animalistic: "hover:border-orange-500 hover:bg-orange-950/40",
  god_wars:    "hover:border-yellow-500 hover:bg-yellow-950/40",
  vampyric:    "hover:border-rose-500 hover:bg-rose-950/40",
  desert:      "hover:border-amber-500 hover:bg-amber-950/40",
};

const ROW_ORDER: BadgeCategory[] = [
  "demonic", "draconic", "spectral", "animalistic", "god_wars", "vampyric", "desert",
];

function TileCell({ tile, onClick }: { tile: BoardTile; onClick: () => void }) {
  const hover = BADGE_TILE_HOVER[tile.badgeCategory];

  return (
    <button
      onClick={onClick}
      className={`
        group relative flex flex-col items-center justify-center gap-1
        bg-slate-800 border border-slate-700 rounded-lg p-2
        cursor-pointer transition-all duration-150
        ${hover}
        text-center w-full h-full min-h-[80px]
      `}
    >
      {tile.hasFreezePeriod && (
        <span className="absolute top-1 right-1 text-blue-400 text-[10px]">⏱</span>
      )}
      <span className="text-white text-xs font-semibold leading-tight">{tile.name}</span>
      <span className="text-yellow-400 text-[11px] font-medium">{tile.totalPoints} pts</span>
    </button>
  );
}

export function BingoBoard() {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BoardTile | null>(null);

  useEffect(() => {
    fetch("/api/board")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setBoard)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">Loading board…</div>
  );

  if (error) return (
    <div className="flex items-center justify-center py-20 text-red-400">Error: {error}</div>
  );

  if (!board) return null;

  // Build grid: row → col → tile
  const grid = new Map<number, Map<number, BoardTile>>();
  for (const tile of board.tiles) {
    if (!grid.has(tile.boardRow)) grid.set(tile.boardRow, new Map());
    grid.get(tile.boardRow)!.set(tile.boardCol, tile);
  }

  return (
    <div className="w-full overflow-x-auto">
      <h1 className="text-white text-2xl font-bold text-center mb-1">{board.event.name}</h1>
      <p className="text-slate-400 text-sm text-center mb-6">
        Click any tile to view its challenges
      </p>

      <div className="inline-grid gap-1 min-w-max" style={{ gridTemplateColumns: "auto repeat(7, minmax(100px, 1fr))" }}>

        {/* Column headers */}
        <div /> {/* empty corner */}
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="text-slate-500 text-xs text-center pb-1 font-medium">
            Col {i + 1}
          </div>
        ))}

        {/* Rows */}
        {ROW_ORDER.map((category, row) => (
          <>
            {/* Badge label */}
            <div
              key={`label-${row}`}
              className={`flex items-center justify-center rounded-lg border-r-2 px-3 py-2 text-xs font-bold uppercase tracking-wide writing-mode-vertical min-w-[72px] ${BADGE_ROW_STYLE[category]}`}
            >
              {BADGE_LABEL[category]}
            </div>

            {/* 7 tiles */}
            {Array.from({ length: 7 }, (_, col) => {
              const tile = grid.get(row)?.get(col);
              return tile ? (
                <TileCell key={tile.id} tile={tile} onClick={() => setSelected(tile)} />
              ) : (
                <div key={`empty-${row}-${col}`} className="bg-slate-900/50 rounded-lg border border-slate-800 min-h-[80px]" />
              );
            })}
          </>
        ))}
      </div>

      {selected && <TileModal tile={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
