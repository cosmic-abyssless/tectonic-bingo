import type { RewindScoreboardModel } from "../../../headless/types";
import { useComic } from "../ui/useComic";
import { display } from "../wrapped/sections/sectionParts-team-bingo";
import { LETTERED } from "../../lettering";
import { RewindPanel, TeamDot } from "./rewindParts";

/**
 * Every Team's points at the moment being viewed, in an ink panel: the place in a little box (yellow for the leader), the
 * Team's dot and name, and its points lettered in Bangers. The Team on show is lit yellow with its colour down the edge.
 * Pressing a Team shows its Board.
 */
export function RewindScoreboard({ scoreboard }: { scoreboard: RewindScoreboardModel }) {
  const { colors } = useComic();
  return (
    <RewindPanel title="Scoreboard">
      <ol>
        {scoreboard.teams.map((team, i) => {
          // Before anyone scores every Team is tied first; the yellow box is for a real lead.
          const leader = team.rank === 1 && team.points > 0;
          return (
            <li key={team.id} className={i > 0 ? "border-t" : undefined} style={{ borderColor: colors.RULE }}>
              <button
                type="button"
                onClick={() => scoreboard.select(team.id)}
                aria-current={team.isViewed ? "true" : undefined}
                className="relative flex w-full cursor-pointer items-center gap-2.5 py-2 pl-3 pr-3 text-left outline-none transition-colors hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)]"
                style={{
                  background: team.isViewed ? colors.YELLOW : undefined,
                  color: team.isViewed ? colors.ON_YELLOW : colors.INK,
                  ["--row-hover" as string]: team.isViewed ? colors.YELLOW : colors.PAPER,
                }}
              >
                {team.isViewed && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-1.5 border-r-2"
                    style={{
                      background: team.color ?? colors.LINE,
                      borderColor: colors.LINE,
                    }}
                  />
                )}
                <span
                  className={`${LETTERED} num flex size-6 shrink-0 items-center justify-center border-2`}
                  style={{
                    ...display(15),
                    background: leader ? colors.YELLOW : colors.PAPER_RAISED,
                    color: leader ? colors.ON_YELLOW : colors.INK,
                    borderColor: colors.LINE,
                    boxShadow: `2px 2px 0 ${colors.SHADOW}`,
                  }}
                >
                  {team.rank}
                </span>
                <TeamDot color={team.color} />
                <span className={`min-w-0 flex-1 truncate text-sm ${team.isViewed ? "font-bold" : "font-semibold"}`}>
                  {team.name}
                  {team.isMine && (
                    <span
                      className={`${LETTERED} ml-1.5 inline-block border-[1.5px] px-1 pt-px align-middle leading-none`}
                      style={{
                        ...display(11),
                        borderColor: colors.LINE,
                        background: colors.YELLOW,
                        color: colors.ON_YELLOW,
                      }}
                    >
                      You
                    </span>
                  )}
                </span>
                <span className={`${LETTERED} num shrink-0`} style={display(19)}>
                  {team.points.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </RewindPanel>
  );
}
