import { EmptyState } from "../../../core/ui/Card";
import { UsersIcon } from "../../../core/ui/icons";

/**
 * For someone who isn't part of this bingo (CONTEXT.md "Player"), from signups closing until it's Finished: nothing
 * of it is shown to them. A Cut signup is told why, and so is a Player an Admin removed from their Team.
 */
export function NotPartStage({ isCut, removedFromTeam }: { isCut: boolean; removedFromTeam: string | null }) {
  return removedFromTeam ? (
    <EmptyState icon={<UsersIcon size={20} />} title="You're not part of this bingo">
      You were removed from {removedFromTeam}. Contact an admin if this is a mistake.
    </EmptyState>
  ) : isCut ? (
    <EmptyState icon={<UsersIcon size={20} />} title="You were cut from the draft">
      Not every signup fits on a team, so the newest were cut to keep the teams even. You can read the whole bingo once it's finished.
    </EmptyState>
  ) : (
    <EmptyState icon={<UsersIcon size={20} />} title="You're not part of this bingo">
      Only its players and mods can follow it while it runs. You can read the whole bingo once it's finished.
    </EmptyState>
  );
}
