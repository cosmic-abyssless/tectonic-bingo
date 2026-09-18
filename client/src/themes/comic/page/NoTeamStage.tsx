import type { TeamSelectorModel } from "../../../headless/types";
import { EmptyState } from "../../../core/ui/Card";
import { UsersIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { Swatch } from "./TeamSelector";

/**
 * Nothing to show yet: a mod who hasn't picked a team gets every team as a
 * chip to pick from (the header no longer carries a team menu — the board's
 * team banner does, once a team's chosen); a player who wasn't drafted gets
 * the plain explanation.
 */
export function NoTeamStage({ isMod, selector }: { isMod: boolean; selector?: TeamSelectorModel }) {
  const { colors } = useComic();

  if (!isMod) {
    return (
      <EmptyState icon={<UsersIcon size={20} />} title="You're not on a team">
        You weren't drafted for this bingo. You can still follow along on the stats page once it's live.
      </EmptyState>
    );
  }

  return (
    <section
      className="mx-auto flex max-w-2xl flex-col items-center gap-4 border-[3px] px-5 py-6 text-center"
      style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `4px 4px 0 ${colors.LINE}`, color: colors.INK }}
    >
      <h2 className="text-3xl uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em" }}>
        Select a team to view
      </h2>
      <ul className="flex flex-wrap items-center justify-center gap-3">
        {(selector?.teams ?? []).map((team, i) => (
          <li key={team.id}>
            <ComicButton size="sm" tilt={i % 2 === 0 ? -1 : 1} onPress={() => selector!.select(team.id)}>
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
