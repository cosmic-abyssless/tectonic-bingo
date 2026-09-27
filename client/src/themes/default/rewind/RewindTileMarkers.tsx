import type { RewindTileTeamsModel } from "../../../headless/types";

/**
 * All Teams view: a Team-coloured dot along the top of the Tile for each Team that has completed it, in scoreboard
 * order, and a faint wash once any has. Fills the cell and takes no clicks; the page puts the hover title on it.
 */
export function RewindTileMarkers({ tile }: { tile: RewindTileTeamsModel }) {
  if (tile.completedBy.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 rounded-md bg-[var(--tile-complete)]/15">
      <div className="absolute inset-x-1 top-1 flex flex-wrap justify-center gap-0.5">
        {tile.completedBy.map((team) => (
          <span
            key={team.id}
            aria-label={`Completed by ${team.name}`}
            className="size-2.5 rounded-full bg-on-surface-subtle ring-1 ring-background sm:size-3"
            style={team.color ? { backgroundColor: team.color } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
