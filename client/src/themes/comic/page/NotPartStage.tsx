import { COMIC_FONT } from "../font";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";

/**
 * For someone who isn't part of this bingo (CONTEXT.md "Player"), from signups closing until it's Finished: a panel
 * with the news stamped on it, like PlanningStage. A Cut signup is told why, and so is a Player an Admin removed from
 * their Team.
 */
export function NotPartStage({ isCut, removedFromTeam }: { isCut: boolean; removedFromTeam: string | null }) {
  const { colors } = useComic();
  return (
    <section
      className="mx-auto flex max-w-lg flex-col items-center gap-3 border-[3px] px-5 py-8 text-center"
      style={{ background: colors.PAPER, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.SHADOW}` }}
    >
      <Stamp kind="custom" rotate={-6} size="md">
        {isCut ? "Cut" : "Members only"}
      </Stamp>
      <h2 className="mt-2 text-3xl uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", color: colors.INK }}>
        {isCut ? "You were cut from the draft" : "You're not part of this bingo"}
      </h2>
      <p className="max-w-md text-sm" style={{ color: colors.INK_BODY }}>
        {removedFromTeam
          ? `You were removed from ${removedFromTeam}. Contact an admin if this is a mistake.`
          : isCut
          ? "Not every signup fits on a team, so the newest were cut to keep the teams even. You can read the whole bingo once it's finished."
          : "Only its players and mods can follow it while it runs. You can read the whole bingo once it's finished."}
      </p>
    </section>
  );
}
