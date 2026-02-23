import { useEffect, useState } from "react";
import type { BoardTile, TileSide, TileSideItem } from "../types";
import { TILE_IMAGES } from "../tileImages";

const BADGE_COLORS: Record<string, string> = {
  demonic: "text-red-400 border-red-500 bg-red-500/10",
  draconic: "text-emerald-400 border-emerald-500 bg-emerald-500/10",
  spectral: "text-purple-400 border-purple-500 bg-purple-500/10",
  animalistic: "text-orange-400 border-orange-500 bg-orange-500/10",
  god_wars: "text-yellow-400 border-yellow-500 bg-yellow-500/10",
  vampyric: "text-rose-400 border-rose-500 bg-rose-500/10",
  desert: "text-amber-400 border-amber-500 bg-amber-500/10",
};

const BADGE_BORDER: Record<string, string> = {
  demonic: "border-red-500",
  draconic: "border-emerald-500",
  spectral: "border-purple-500",
  animalistic: "border-orange-500",
  god_wars: "border-yellow-500",
  vampyric: "border-rose-500",
  desert: "border-amber-500",
};

function groupItems(items: TileSideItem[]) {
  const required: TileSideItem[] = [];
  const grouped = new Map<string, TileSideItem[]>();
  for (const item of items) {
    if (!item.optionsGroup) {
      required.push(item);
    } else {
      const list = grouped.get(item.optionsGroup) ?? [];
      list.push(item);
      grouped.set(item.optionsGroup, list);
    }
  }
  return { required, grouped };
}

function SidePanel({ side, label }: { side: TileSide; label: string }) {
  const { required, grouped } = groupItems(side.items);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white font-bold text-sm">{label}</span>
        <span className="text-yellow-400 font-semibold text-sm">
          {side.points} pts
        </span>
      </div>

      <p className="text-slate-300 text-sm leading-relaxed mb-3">
        {side.description}
      </p>

      {required.length > 0 && (
        <ul className="space-y-1 mb-2">
          {required.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline gap-2 text-sm text-slate-200"
            >
              <span className="text-indigo-400 text-xs">▸</span>
              {item.quantity > 1 && (
                <span className="text-yellow-400 font-semibold text-xs">
                  {item.quantity}×
                </span>
              )}
              {item.itemName}
            </li>
          ))}
        </ul>
      )}

      {[...grouped.entries()].map(([group, opts]) => (
        <div key={group} className="mt-2">
          <span className="text-slate-500 text-xs uppercase tracking-wide">
            Choose one:
          </span>
          <ul className="space-y-1 mt-1">
            {opts.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline gap-2 text-sm text-slate-300"
              >
                <span className="text-slate-500 text-xs">◦</span>
                {item.quantity > 1 && (
                  <span className="text-yellow-400 font-semibold text-xs">
                    {item.quantity}×
                  </span>
                )}
                {item.itemName}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {(side.requiresNoDuplicates ||
        side.allowsPreviouslyAcquired ||
        side.allowsPreLoad) && (
        <div className="flex gap-2 flex-wrap mt-3">
          {side.requiresNoDuplicates && (
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
              No duplicates
            </span>
          )}
          {side.allowsPreviouslyAcquired && (
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
              Prev. acquired OK
            </span>
          )}
          {side.allowsPreLoad && (
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
              Pre-load allowed
            </span>
          )}
        </div>
      )}

      {side.notes && (
        <p className="mt-3 text-xs text-amber-400 border-l-2 border-amber-500 pl-2">
          {side.notes}
        </p>
      )}
    </div>
  );
}

interface Props {
  tile: BoardTile;
  onClose: () => void;
}

export function TileModal({ tile, onClose }: Props) {
  const badgeColor =
    BADGE_COLORS[tile.badgeCategory] ??
    "text-slate-400 border-slate-500 bg-slate-500/10";
  const borderColor = BADGE_BORDER[tile.badgeCategory] ?? "border-slate-500";
  const imgSrc = TILE_IMAGES[tile.name];
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-start justify-between p-5 border-b-2 ${borderColor}`}
        >
          <div className="flex items-center gap-4">
            {imgSrc && !imgFailed && (
              <img
                src={imgSrc}
                alt={tile.name}
                onError={() => setImgFailed(true)}
                className="w-16 h-16 object-contain shrink-0"
              />
            )}
            <div>
              <h2 className="text-white text-xl font-bold">{tile.name}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span
                  className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 capitalize ${badgeColor}`}
                >
                  {tile.badgeCategory.replace("_", " ")}
                </span>
                <span className="text-yellow-400 text-sm font-semibold">
                  {tile.totalPoints} pts
                </span>
                {tile.hasFreezePeriod && (
                  <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2.5 py-0.5">
                    ⏱ 2hr freeze
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            className="text-slate-400 hover:text-white text-lg leading-none p-1 cursor-pointer"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Sides */}
        <div className="grid grid-cols-2 divide-x divide-slate-700">
          {tile.sides.A && <SidePanel side={tile.sides.A} label="Part A" />}
          {tile.sides.B && <SidePanel side={tile.sides.B} label="Part B" />}
        </div>

        {/* Wildcards */}
        {tile.wildcards.length > 0 && (
          <div className="p-5 border-t border-slate-700">
            <h4 className="text-slate-400 text-xs uppercase tracking-wide mb-3">
              Wildcards
            </h4>
            <div className="space-y-2">
              {tile.wildcards.map((wc) => (
                <div
                  key={wc.id}
                  className="flex items-baseline gap-2 flex-wrap"
                >
                  <span className="text-yellow-400 text-sm font-semibold">
                    {wc.itemName}
                  </span>
                  <span className="text-slate-300 text-sm">
                    {wc.description}
                  </span>
                  {wc.applicableToSide && (
                    <span className="text-xs text-slate-500 bg-slate-900 rounded-full px-2 py-0.5">
                      Part {wc.applicableToSide} only
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
