import { useState, type CSSProperties } from "react";
import type { SubmissionDetails, Tile, TileCategory, TeamNodeState } from "@bingo/shared";
import { summarizeTileProgress, getFreezeUnlockAt } from "./tileProgress";
import { formatCountdown } from "../ui/time";
import { TASK_STATUS_DOT } from "../ui/StatusBadge";

const NEUTRAL_ACCENT = "#64748b"; // slate-500

export function TileCell({
  tile,
  bingoStartsAt,
  category,
  nodeStates,
  teamSubmissions,
  now,
  dimmed,
  onClick,
}: {
  tile: Tile;
  bingoStartsAt: string | null;
  category?: TileCategory;
  nodeStates: TeamNodeState[];
  teamSubmissions: SubmissionDetails[];
  now: number;
  dimmed?: boolean;
  onClick: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const summary = summarizeTileProgress(tile, nodeStates, teamSubmissions);
  const freezeUnlocksAt = getFreezeUnlockAt(bingoStartsAt, tile);
  const isFrozen = !!(freezeUnlocksAt && now < freezeUnlocksAt);
  const remaining = freezeUnlocksAt ? freezeUnlocksAt - now : 0;

  const style = { "--tile-accent": category?.colorHex ?? NEUTRAL_ACCENT } as CSSProperties;

  return (
    <button
      onClick={onClick}
      title={tile.name}
      style={style}
      className={`group relative overflow-hidden bg-slate-800 border-2 rounded-md cursor-pointer transition-all duration-150 w-full aspect-square ${
        isFrozen ? "border-blue-800" : summary.allComplete ? "border-green-600" : "border-slate-700 hover:border-[var(--tile-accent)]"
      } ${dimmed ? "opacity-20 saturate-0 pointer-events-none" : ""}`}
    >
      {tile.imageUrl && !imgFailed ? (
        <img
          src={tile.imageUrl}
          alt={tile.name}
          onError={() => setImgFailed(true)}
          className={`absolute inset-0 w-full h-full object-contain p-1 transition-transform duration-150 ${
            isFrozen ? "opacity-30 saturate-0" : "group-hover:scale-105"
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-[10px] text-center px-1 leading-tight">
          {tile.name}
        </div>
      )}

      {summary.allComplete && !isFrozen && (
        <div className="absolute inset-0 bg-green-500/50 pointer-events-none flex items-center justify-center">
          <svg className="w-1/2 h-1/2 text-green-300 drop-shadow" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}

      {isFrozen && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5 bg-blue-950/70 pointer-events-none">
          <span className="text-blue-400 text-base leading-none">🔒</span>
          <span className="text-blue-200 font-mono text-[11px] font-bold tabular-nums leading-none mt-0.5">
            {formatCountdown(remaining)}
          </span>
        </div>
      )}

      {tile.hasFreezePeriod && !isFrozen && (
        <span className="absolute top-1 left-1 text-blue-400 text-base z-10 drop-shadow leading-none">⏱</span>
      )}

      {summary.totalTasks > 0 && (
        <div className="absolute bottom-1 left-1 z-20">
          <span className="text-[9px] font-semibold tabular-nums leading-none text-slate-300 bg-slate-900/80 rounded px-1 py-0.5">
            {summary.pointsAwarded}/{summary.totalPoints}
          </span>
        </div>
      )}

      {summary.totalTasks > 1 && (
        <div className="absolute bottom-1 right-1 flex gap-0.5 z-20">
          {tile.node.children.map((task, i) => {
            const status = summary.statusByNodeId.get(task.id) ?? "not_started";
            if (status === "not_started") return null;
            return (
              <span
                key={task.id}
                title={`${task.label}: ${status.replace(/_/g, " ")}`}
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white leading-none ${TASK_STATUS_DOT[status]}`}
              >
                {i + 1}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
}
