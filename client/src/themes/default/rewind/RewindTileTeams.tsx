import type { RewindTileTeamsModel } from "../../../headless/types";
import { Dialog, DialogHeader } from "../../../core/ui/Dialog";
import { CheckIcon } from "../../../core/ui/icons";

/** All Teams view: every Team's progress on one Tile at the moment being viewed, in scoreboard order. */
export function RewindTileTeams({ tile, isOpen, onClose }: { tile: RewindTileTeamsModel | null; isOpen: boolean; onClose: () => void }) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      {tile && (
        <>
          <DialogHeader title={tile.tileName} subtitle={`Completed by ${tile.completedBy.length} of ${tile.teams.length} teams`} onClose={onClose} />
          <ul className="divide-y divide-outline">
            {tile.teams.map((team) => (
              <li key={team.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="size-2.5 shrink-0 rounded-full bg-on-surface-subtle" style={team.color ? { backgroundColor: team.color } : undefined} />
                <span className={`min-w-0 flex-1 truncate ${team.complete ? "font-semibold text-on-surface" : "text-on-surface-muted"}`}>{team.name}</span>
                {team.complete ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-[var(--tile-complete)]">
                    <CheckIcon size={14} strokeWidth={2.5} />
                    Complete
                  </span>
                ) : (
                  <span className="num text-xs text-on-surface-subtle">
                    {team.completedTasks}/{team.totalTasks} parts
                  </span>
                )}
                <span className="num w-16 shrink-0 text-right text-xs font-medium">
                  {team.pointsAwarded}/{team.totalPoints} <span className="font-normal text-on-surface-subtle">pts</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
