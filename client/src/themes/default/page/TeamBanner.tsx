import type { TeamModel } from "../../../headless/types";

export function TeamBanner({ team, isOtherTeam, totalPoints }: { team: TeamModel; isOtherTeam: boolean; totalPoints: number | null }) {
  return (
    <div
      className="flex h-10 items-center justify-between gap-4 rounded-md border border-outline bg-surface px-3"
      style={team.color ? { borderColor: `${team.color}99` } : undefined}
    >
      <div className="flex items-center gap-2 text-sm">
        {team.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />}
        <span className="font-semibold text-on-surface">{team.name}</span>
        <span className="text-on-surface-subtle">{isOtherTeam ? "Viewing as moderator" : "Your team's board"}</span>
      </div>
      {totalPoints !== null && (
        <span className="num text-sm font-semibold text-on-surface">
          {totalPoints.toLocaleString()} <span className="font-normal text-on-surface-subtle">pts</span>
        </span>
      )}
    </div>
  );
}
