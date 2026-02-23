import { useState, useEffect } from "react";
import type { BoardTile, BoardResponse, BadgeCategory } from "../types";
import { TileModal } from "./TileModal";
import { TILE_IMAGES } from "../tileImages";

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

const BADGE_TILE_HOVER: Record<BadgeCategory, string> = {
  demonic: "hover:border-red-500     hover:bg-red-950/40",
  draconic: "hover:border-emerald-500 hover:bg-emerald-950/40",
  spectral: "hover:border-purple-500  hover:bg-purple-950/40",
  animalistic: "hover:border-orange-500  hover:bg-orange-950/40",
  god_wars: "hover:border-yellow-500  hover:bg-yellow-950/40",
  vampyric: "hover:border-rose-500    hover:bg-rose-950/40",
  desert: "hover:border-amber-500   hover:bg-amber-950/40",
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

function TileCell({ tile, onClick }: { tile: BoardTile; onClick: () => void }) {
  const hover = BADGE_TILE_HOVER[tile.badgeCategory];
  const imgSrc = TILE_IMAGES[tile.name];
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      onClick={onClick}
      title={tile.name}
      className={`group relative overflow-hidden bg-slate-800 border-2 border-slate-700 rounded-md cursor-pointer transition-all duration-150 w-full aspect-square ${hover}`}
    >
      {imgSrc && !imgFailed && (
        <img
          src={imgSrc}
          alt={tile.name}
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-150"
        />
      )}
      {tile.hasFreezePeriod && (
        <span className="absolute top-1 left-1 text-blue-400 text-base z-10 drop-shadow leading-none">
          ⏱
        </span>
      )}
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
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setBoard)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

  const grid = new Map<number, Map<number, BoardTile>>();
  for (const tile of board.tiles) {
    if (!grid.has(tile.boardRow)) grid.set(tile.boardRow, new Map());
    grid.get(tile.boardRow)!.set(tile.boardCol, tile);
  }

  return (
    <div className="w-full">
      <h1 className="text-white text-2xl font-bold text-center mb-1">
        {board.event.name}
      </h1>
      <p className="text-slate-400 text-sm text-center mb-4">
        Click any tile to view its challenges
      </p>

      {/* Outer scroll wrapper — only scrolls on small screens */}
      <div className="overflow-x-auto">
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
                return tile ? (
                  <TileCell
                    key={tile.id}
                    tile={tile}
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

      {selected && (
        <TileModal tile={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
