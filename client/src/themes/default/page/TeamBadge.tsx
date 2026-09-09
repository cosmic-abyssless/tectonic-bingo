import type { TeamModel } from "../../../headless/types";
import { Badge } from "../../../core/ui/Card";

export function teamBadgeStyle(team: TeamModel) {
  return team.color ? { borderColor: `${team.color}99`, color: team.color } : undefined;
}

export function TeamBadge({ team }: { team: TeamModel }) {
  return (
    <Badge className="hidden sm:inline-flex" style={teamBadgeStyle(team)}>
      {team.color && <span className="size-2 rounded-full" style={{ backgroundColor: team.color }} />}
      {team.name}
    </Badge>
  );
}
