import { memo, useState, type CSSProperties } from "react";
import type { TileModel } from "../../../headless/types";
import { formatCountdown } from "../../../core/ui/time";
import { TASK_STATUS_DOT } from "../../../core/ui/StatusBadge";
import { CheckIcon, ClockIcon, LockIcon } from "../../../core/ui/icons";

/*
 * Board tile. All colours come from the `--tile-*` variables set by the
 * bingo's theme (themes/tokens.ts) so a themed bingo can reskin tiles
 * without touching this component; a category colour overrides the accent.
 * Memoized: BoardProvider's two-stage tile memo only produces a new
 * TileModel object for tiles whose freeze/dim/canSubmit actually changed
 * this tick, so non-frozen cells skip re-render entirely.
 */
export const TileCell = memo(function TileCell({ tile, onOpen }: { tile: TileModel; onOpen: (tileId: string) => void }) {
  const [imgFailed, setImgFailed] = useState(false);

  const style = (tile.accentColor ? { "--tile-accent": tile.accentColor } : {}) as CSSProperties;
  const borderColor = tile.freeze.isFrozen ? "var(--tile-frozen)" : tile.progress.allComplete ? "var(--tile-complete)" : undefined;

  return (
    <button
      onClick={() => onOpen(tile.id)}
      title={tile.name}
      style={{ ...style, borderColor }}
      className={`group relative aspect-square w-full cursor-pointer overflow-hidden rounded-md border-2 border-[var(--tile-border)] bg-[var(--tile-bg)] transition-[border-color,opacity] duration-150 hover:border-[var(--tile-accent)] ${
        tile.dimmed ? "pointer-events-none opacity-20 saturate-0" : ""
      }`}
    >
      {tile.imageUrl && !imgFailed ? (
        <img
          src={tile.imageUrl}
          alt={tile.name}
          onError={() => setImgFailed(true)}
          className={`absolute inset-0 h-full w-full object-contain p-1.5 transition-transform duration-150 ${
            tile.freeze.isFrozen ? "opacity-30 saturate-0" : "group-hover:scale-105"
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] leading-tight text-fg-muted">{tile.name}</div>
      )}

      {tile.progress.allComplete && !tile.freeze.isFrozen && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--tile-complete)]/40">
          <CheckIcon className="size-1/2 text-[var(--tile-complete)] drop-shadow" strokeWidth={2.5} />
        </div>
      )}

      {tile.freeze.isFrozen && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-bg/70 text-[var(--tile-frozen)]">
          <LockIcon />
          <span className="num font-mono text-[11px] font-semibold leading-none">{formatCountdown(tile.freeze.remainingMs)}</span>
        </div>
      )}

      {tile.freeze.hasFreezePeriod && !tile.freeze.isFrozen && (
        <span className="absolute left-1 top-1 z-10 text-[var(--tile-frozen)] drop-shadow">
          <ClockIcon size={14} />
        </span>
      )}

      {tile.progress.totalTasks > 0 && (
        <span className="num absolute bottom-1 left-1 z-20 rounded-sm bg-bg/80 px-1 py-0.5 text-[9px] font-semibold leading-none text-fg-muted">
          {tile.progress.pointsAwarded}/{tile.progress.totalPoints}
        </span>
      )}

      {tile.progress.totalTasks > 1 && (
        <div className="absolute bottom-1 right-1 z-20 flex gap-0.5">
          {tile.taskStatuses.map((task) => {
            if (task.status === "not_started") return null;
            return (
              <span
                key={task.id}
                title={`${task.label}: ${task.status.replace(/_/g, " ")}`}
                className={`inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold leading-none text-bg ${TASK_STATUS_DOT[task.status]}`}
              >
                {task.index + 1}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
});
