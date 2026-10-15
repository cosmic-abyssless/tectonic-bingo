import type { RewindTileTeamsModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { COMIC_FIGURES_FONT } from "../font";
import { ComicDialog, ComicDialogHeader } from "../ui/ComicDialog";
import { useComic } from "../ui/useComic";
import { display } from "../wrapped/sections/sectionParts-team-bingo";
import { LETTERED } from "../../lettering";
import { TeamDot } from "./rewindParts";

/**
 * All Teams view: every Team's progress on one Tile at the moment being viewed, in scoreboard order, in the comic dialog:
 * a green "Complete" tag or the Parts done, and the points out of the Tile's.
 */
export function RewindTileTeams({ tile, isOpen, onClose }: { tile: RewindTileTeamsModel | null; isOpen: boolean; onClose: () => void }) {
  const { colors } = useComic();
  return (
    <ComicDialog isOpen={isOpen} onClose={onClose}>
      {tile && (
        <>
          <ComicDialogHeader title={tile.tileName} subtitle={`Completed by ${tile.completedBy.length} of ${tile.teams.length} teams`} onClose={onClose} />
          <ul>
            {tile.teams.map((team, i) => (
              <li
                key={team.id}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm ${i > 0 ? "border-t" : ""}`}
                style={{ borderColor: colors.RULE, color: colors.INK }}
              >
                <TeamDot color={team.color} />
                <span
                  className={`min-w-0 flex-1 truncate ${team.complete ? "font-bold" : "font-semibold"}`}
                  style={team.complete ? undefined : { color: colors.INK_SUBTLE }}
                >
                  {team.name}
                </span>
                {team.complete ? (
                  <span
                    className={`${LETTERED} inline-flex shrink-0 items-center gap-1 border-2 px-1.5 pt-[3px] pb-px leading-none`}
                    style={{
                      ...display(13, { letterSpacing: "0.05em" }),
                      background: colors.GREEN_TINT,
                      borderColor: colors.LINE,
                      color: colors.INK,
                    }}
                  >
                    <CheckIcon size={12} strokeWidth={3} />
                    Complete
                  </span>
                ) : (
                  <span
                    className="num shrink-0 text-[13px] font-bold"
                    style={{
                      color: colors.INK_SUBTLE,
                      fontFamily: COMIC_FIGURES_FONT,
                    }}
                  >
                    {team.completedTasks}/{team.totalTasks} parts
                  </span>
                )}
                <span className={`${LETTERED} num w-20 shrink-0 text-right`} style={display(16)}>
                  {team.pointsAwarded}/{team.totalPoints} <span style={{ color: colors.INK_SUBTLE }}>pts</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ComicDialog>
  );
}
