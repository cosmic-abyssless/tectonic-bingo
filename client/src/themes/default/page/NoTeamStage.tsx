import { EmptyState } from "../../../core/ui/Card";
import { GridIcon, UsersIcon } from "../../../core/ui/icons";

export function NoTeamStage({ isMod }: { isMod: boolean }) {
  return isMod ? (
    <EmptyState icon={<GridIcon size={20} />} title="Select a team to view">
      Use the team menu in the header to open any team's board.
    </EmptyState>
  ) : (
    <EmptyState icon={<UsersIcon size={20} />} title="You're not on a team">
      You weren't drafted for this bingo. You can still follow along on the stats page once it's live.
    </EmptyState>
  );
}
