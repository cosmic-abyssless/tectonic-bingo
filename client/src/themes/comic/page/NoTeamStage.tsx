import type { TeamSelectorModel } from "../../../headless/types";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { Swatch } from "./TeamSelector";

/**
 * Nothing to show yet: whoever can pick a team (a mod, or anyone once the
 * bingo is Finished) and hasn't gets every team as a chip to pick from (the
 * header no longer carries a team menu — the board's team banner does, once a
 * team's chosen).
 */
export function NoTeamStage({ selector }: { selector: TeamSelectorModel }) {
  const { colors } = useComic();

  return (
    <section
      className="mx-auto flex max-w-2xl flex-col items-center gap-4 border-[3px] px-5 py-6 text-center"
      style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `4px 4px 0 ${colors.SHADOW}`, color: colors.INK }}
    >
      <h2 className="text-3xl uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em" }}>
        Select a team to view
      </h2>
      <ul className="flex flex-wrap items-center justify-center gap-3">
        {selector.teams.map((team, i) => (
          <li key={team.id}>
            <ComicButton size="sm" tilt={i % 2 === 0 ? -1 : 1} onPress={() => selector.select(team.id)}>
              <Swatch color={team.color} />
              <span className="max-w-[14rem] truncate">{team.name}</span>
              {team.isMine && (
                <span className="text-sm opacity-60" style={{ fontFamily: COMIC_FONT }}>
                  You
                </span>
              )}
            </ComicButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
