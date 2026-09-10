import type { TeamModel } from "../../../headless/types";
import { COMIC_FONT } from "../font";

/** Same layout as the default theme's TeamBanner — the team name set in the
    comic display font instead of the body font. */
export function TeamBanner({
  team,
  isOtherTeam,
  totalPoints,
}: {
  team: TeamModel;
  isOtherTeam: boolean;
  totalPoints: number | null;
}) {
  return (
    <div
      className="flex h-10 items-center justify-between gap-4 rounded-md border-[3px] border-line bg-surface px-3"
      style={team.color ? { borderColor: `${team.color}99` } : undefined}
    >
      <div className="flex items-center gap-2 text-sm">
        {team.color && (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: team.color }}
          />
        )}
        <span className="text-base text-fg" style={{ fontFamily: COMIC_FONT }}>
          {team.name}
        </span>
        <span className="text-fg-subtle">
          {isOtherTeam ? "Viewing as moderator" : "Your team's board"}
        </span>
      </div>
      {totalPoints !== null && (
        <span className="num text-sm font-semibold text-fg">
          {totalPoints.toLocaleString()}{" "}
          <span className="font-normal text-fg-subtle">pts</span>
        </span>
      )}
    </div>
  );
}
