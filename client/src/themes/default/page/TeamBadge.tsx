import type { TeamModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";
import { UsersIcon } from "../../../core/ui/icons";

export function teamBadgeStyle(team: TeamModel) {
  return team.color ? { borderColor: `${team.color}99`, color: team.color } : undefined;
}

/** The player's own team, sized like the neighbouring header buttons; opens the roster. */
export function TeamBadge({ team, onPress }: { team: TeamModel; onPress: () => void }) {
  return (
    <Button size="sm" style={teamBadgeStyle(team)} onPress={onPress}>
      {team.color && <span className="size-2 rounded-full" style={{ backgroundColor: team.color }} />}
      {team.name}
      <UsersIcon className="text-on-surface-subtle" />
    </Button>
  );
}
