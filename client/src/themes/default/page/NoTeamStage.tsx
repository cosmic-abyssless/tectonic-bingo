import type { TeamSelectorModel } from "../../../headless/types";
import { EmptyState } from "../../../core/ui/Card";
import { GridIcon } from "../../../core/ui/icons";

/** No team picked yet: mods, and everyone once the bingo is Finished, pick one from the team menu in the header. */
export function NoTeamStage(_props: { selector: TeamSelectorModel }) {
  return (
    <EmptyState icon={<GridIcon size={20} />} title="Select a team to view">
      Use the team menu in the header to open any team's board.
    </EmptyState>
  );
}
