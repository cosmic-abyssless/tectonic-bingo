import type { TeamModel } from "../../../headless/types";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";

/**
 * The "published by" strip for the board: team swatch + name lettered in
 * Bangers, a small caption saying whose board this is, and the running
 * score in a yellow tab on the right. Matches the ComicButton geometry
 * (h-10, 3px ink border, hard shadow) so it sits level with the search box.
 */
export function TeamBanner({
  team,
  isOtherTeam,
  totalPoints,
}: {
  team: TeamModel;
  isOtherTeam: boolean;
  totalPoints: number | null;
}) {
  const { colors } = useComic();
  const swatch = team.color ?? colors.BLUE;

  return (
    <div
      className="flex h-10 items-stretch overflow-hidden rounded-md border-[3px]"
      style={{ borderColor: colors.INK, background: colors.PAPER_RAISED, boxShadow: `3px 3px 0 ${colors.INK}`, color: colors.INK }}
    >
      {/* Team swatch — a vertical ink-edged color bar, like a spine stripe. */}
      <span className="w-3 shrink-0 border-r-[3px]" style={{ background: swatch, borderColor: colors.INK }} aria-hidden />

      <div className="flex min-w-0 items-center gap-2 px-3">
        <span className="truncate text-xl uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em" }}>
          {team.name}
        </span>
        <span className="hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wider sm:inline" style={{ color: colors.INK_SUBTLE }}>
          {isOtherTeam ? "Mod view" : "Your board"}
        </span>
      </div>

      {totalPoints !== null && (
        <span
          className="flex shrink-0 items-center gap-1 border-l-[3px] px-3 text-xl leading-none"
          style={{ fontFamily: COMIC_FONT, background: colors.YELLOW, borderColor: colors.INK, color: "#0b0b0d" }}
        >
          <span className="num">{totalPoints.toLocaleString()}</span>
          <span className="text-sm">pts</span>
        </span>
      )}
    </div>
  );
}
