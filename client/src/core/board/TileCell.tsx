import { useState, type CSSProperties } from "react";
import type { SubmissionDetails, Tile, TileCategory, TeamNodeState } from "@bingo/shared";
import { summarizeTileProgress, getFreezeUnlockAt } from "./tileProgress";
import { formatCountdown } from "../ui/time";
import { TASK_STATUS_DOT } from "../ui/StatusBadge";
import { CheckIcon, ClockIcon, LockIcon } from "../ui/icons";

/*
 * Board tile. All colours come from the `--tile-*` variables set by the
 * bingo's theme (themes/<key>/tokens.ts) so a themed bingo can reskin tiles
 * without touching this component; a category colour overrides the accent.
 */
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

  const style = (category?.colorHex ? { "--tile-accent": category.colorHex } : {}) as CSSProperties;
  const borderColor = isFrozen ? "var(--tile-frozen)" : summary.allComplete ? "var(--tile-complete)" : undefined;

  return (
    <button
      onClick={onClick}
      title={tile.name}
      style={{ ...style, borderColor }}
      className={`group relative aspect-square w-full cursor-pointer overflow-hidden rounded-md border-2 border-[var(--tile-border)] bg-[var(--tile-bg)] transition-[border-color,opacity] duration-150 hover:border-[var(--tile-accent)] ${
        dimmed ? "pointer-events-none opacity-20 saturate-0" : ""
      }`}
    >
      {tile.imageUrl && !imgFailed ? (
        <img
          src={tile.imageUrl}
          alt={tile.name}
          onError={() => setImgFailed(true)}
          className={`absolute inset-0 h-full w-full object-contain p-1.5 transition-transform duration-150 ${
            isFrozen ? "opacity-30 saturate-0" : "group-hover:scale-105"
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] leading-tight text-fg-muted">{tile.name}</div>
      )}

      {summary.allComplete && !isFrozen && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--tile-complete)]/40">
          <CheckIcon className="size-1/2 text-[var(--tile-complete)] drop-shadow" strokeWidth={2.5} />
        </div>
      )}

      {isFrozen && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-bg/70 text-[var(--tile-frozen)]">
          <LockIcon />
          <span className="num font-mono text-[11px] font-semibold leading-none">{formatCountdown(remaining)}</span>
        </div>
      )}

      {tile.hasFreezePeriod && !isFrozen && (
        <span className="absolute left-1 top-1 z-10 text-[var(--tile-frozen)] drop-shadow">
          <ClockIcon size={14} />
        </span>
      )}

      {summary.totalTasks > 0 && (
        <span className="num absolute bottom-1 left-1 z-20 rounded-sm bg-bg/80 px-1 py-0.5 text-[9px] font-semibold leading-none text-fg-muted">
          {summary.pointsAwarded}/{summary.totalPoints}
        </span>
      )}

      {summary.totalTasks > 1 && (
        <div className="absolute bottom-1 right-1 z-20 flex gap-0.5">
          {tile.node.children.map((task, i) => {
            const status = summary.statusByNodeId.get(task.id) ?? "not_started";
            if (status === "not_started") return null;
            return (
              <span
                key={task.id}
                title={`${task.label}: ${status.replace(/_/g, " ")}`}
                className={`inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold leading-none text-bg ${TASK_STATUS_DOT[status]}`}
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
