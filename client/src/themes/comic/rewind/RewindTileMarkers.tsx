import type { RewindTileTeamsModel } from "../../../headless/types";
import { useComic } from "../ui/useComic";

/**
 * All Teams view: an ink-ringed, hard-shadowed dot in its Team's colour along the top of the Tile for each Team that has
 * completed it, in scoreboard order, on a paper strip so they read over any artwork. Fills the cell and takes no clicks;
 * the page puts the hover title on it.
 */
export function RewindTileMarkers({ tile }: { tile: RewindTileTeamsModel }) {
  const { colors } = useComic();
  if (tile.completedBy.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute inset-x-1 top-1 flex justify-center">
        <div
          className="flex flex-wrap justify-center gap-1 border-2 px-1 py-0.5"
          style={{
            background: colors.PAPER_RAISED,
            borderColor: colors.LINE,
            boxShadow: `2px 2px 0 ${colors.SHADOW}`,
          }}
        >
          {tile.completedBy.map((team) => (
            <span
              key={team.id}
              aria-label={`Completed by ${team.name}`}
              className="size-3 rounded-full border-2 sm:size-3.5"
              style={{
                background: team.color ?? colors.INK_SUBTLE,
                borderColor: colors.LINE,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
