import { useState } from "react";
import type { BadgeCategory, BoardTile, TileProgress, SideStatus } from "../types";
import { TILE_IMAGES } from "../tileImages";

const STATUS_DOT: Record<SideStatus, string> = {
  not_started: "bg-slate-600",
  in_progress: "bg-yellow-400",
  pending_approval: "bg-blue-400",
  completed: "bg-green-500",
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

function SideDot({ label, status }: { label: "A" | "B"; status: SideStatus }) {
  if (status === "not_started") return null;
  return (
    <span
      title={`Part ${label}: ${status.replace(/_/g, " ")}`}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white leading-none ${STATUS_DOT[status]}`}
    >
      {label}
    </span>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TileCell({
  tile,
  progress,
  now,
  freezeUnlocksAt,
  dimmed,
  onClick,
}: {
  tile: BoardTile;
  progress?: TileProgress;
  now: number;
  freezeUnlocksAt?: number;
  dimmed?: boolean;
  onClick: () => void;
}) {
  const hover = BADGE_TILE_HOVER[tile.badgeCategory];
  const imgSrc = TILE_IMAGES[tile.name];
  const [imgFailed, setImgFailed] = useState(false);

  const isFrozen = !!(freezeUnlocksAt && now < freezeUnlocksAt);
  const remaining = freezeUnlocksAt ? freezeUnlocksAt - now : 0;

  const bothComplete =
    progress?.sideAStatus === "completed" &&
    progress?.sideBStatus === "completed";

  return (
    <button
      onClick={onClick}
      title={tile.name}
      className={`group relative overflow-hidden bg-slate-800 border-2 rounded-md cursor-pointer transition-all duration-150 w-full aspect-square ${
        isFrozen ? "border-blue-800" : `border-slate-700 ${hover}`
      } ${bothComplete && !isFrozen ? "border-green-600" : ""} ${
        dimmed ? "opacity-20 saturate-0 pointer-events-none" : ""
      }`}
    >
      {/* Tile image */}
      {imgSrc && !imgFailed && (
        <img
          src={imgSrc}
          alt={tile.name}
          onError={() => setImgFailed(true)}
          className={`absolute inset-0 w-full h-full object-contain p-1 transition-transform duration-150 ${
            isFrozen ? "opacity-30 saturate-0" : "group-hover:scale-105"
          }`}
        />
      )}

      {/* Full-tile green tint + checkmark for both sides complete */}
      {bothComplete && !isFrozen && (
        <div className="absolute inset-0 bg-green-500/50 pointer-events-none flex items-center justify-center">
          <svg
            className="w-1/2 h-1/2 text-green-300 drop-shadow"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}

      {/* Freeze overlay */}
      {isFrozen && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5 bg-blue-950/70 pointer-events-none">
          <span className="text-blue-400 text-base leading-none">🔒</span>
          <span className="text-blue-200 font-mono text-[11px] font-bold tabular-nums leading-none mt-0.5">
            {formatCountdown(remaining)}
          </span>
        </div>
      )}

      {/* ⏱ badge — shown on freeze tiles that are no longer locked */}
      {tile.hasFreezePeriod && !isFrozen && (
        <span className="absolute top-1 left-1 text-blue-400 text-base z-10 drop-shadow leading-none">
          ⏱
        </span>
      )}

      {/* Points progress */}
      {progress && (
        <div className="absolute bottom-1 left-1 z-20">
          <span className="text-[9px] font-semibold tabular-nums leading-none text-slate-300 bg-slate-900/80 rounded px-1 py-0.5">
            {progress.sideAPointsAwarded + progress.sideBPointsAwarded}/
            {tile.totalPoints}
          </span>
        </div>
      )}

      {/* A / B status dots */}
      {progress && (
        <div className="absolute bottom-1 right-1 flex gap-0.5 z-20">
          <SideDot label="A" status={progress.sideAStatus} />
          <SideDot label="B" status={progress.sideBStatus} />
        </div>
      )}
    </button>
  );
}
