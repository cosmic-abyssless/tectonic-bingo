import type { TeamModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";

export function TeamBanner({ team, isOtherTeam, totalPoints, onOpenPoints }: { team: TeamModel; isOtherTeam: boolean; totalPoints: number | null; onOpenPoints?: () => void }) {
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
      {totalPoints !== null &&
        (onOpenPoints ? (
          <Button variant="ghost" size="sm" className="-mr-1.5" onPress={onOpenPoints} aria-label={`${team.name}: ${totalPoints.toLocaleString()} points, see the breakdown`}>
            <span className="num font-semibold text-on-surface">{totalPoints.toLocaleString()}</span> <span className="font-normal text-on-surface-subtle">pts</span>
          </Button>
        ) : (
          <span className="num text-sm font-semibold text-on-surface">
            {totalPoints.toLocaleString()} <span className="font-normal text-on-surface-subtle">pts</span>
          </span>
        ))}
    </div>
  );
}
