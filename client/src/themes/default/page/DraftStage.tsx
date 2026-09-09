import type { StageMilestone } from "@bingo/shared";
import type { BingoPageModel } from "../../../headless/types";
import { EmptyState } from "../../../core/ui/Card";
import { Button } from "../../../core/ui/Button";
import { MilestoneCountdown } from "../../../core/ui/StageStepper";
import { UsersIcon } from "../../../core/ui/icons";
import { TeamRoster } from "../../../core/draft/TeamRoster";

/**
 * Draft stage: before it starts, a countdown; while it runs, a pointer into
 * the draft room; once done, the team reveal. The draft endpoint is 403 for
 * people who didn't sign up, so the error case just shows the generic copy.
 */
export function DraftStage({ draft, milestone, onOpenDraft }: { draft: BingoPageModel["draft"]; milestone: StageMilestone | null; onOpenDraft: () => void }) {
  if (draft.isLoading) return null;

  if (!draft.state || !draft.state.draftStarted) {
    return (
      <EmptyState icon={<UsersIcon size={20} />} title="The draft hasn't started yet">
        <MilestoneCountdown milestone={milestone} className="justify-center" />
      </EmptyState>
    );
  }

  if (draft.state.currentPick) {
    return (
      <EmptyState
        icon={<UsersIcon size={20} />}
        title="Draft in progress"
        action={
          <Button variant="primary" onPress={onOpenDraft}>
            Open draft room
          </Button>
        }
      >
        <span className="num">
          Round {draft.state.currentPick.round}, pick {draft.state.currentPick.pickNumber}
        </span>
        . Teams are revealed here once the draft is complete.
      </EmptyState>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-fg">Teams</h2>
        <p className="text-sm text-fg-muted">Draft complete. The board is revealed next.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {draft.state.teams.map((team) => (
          <TeamRoster key={team.id} team={team} picks={draft.state!.picks.filter((p) => p.teamId === team.id)} />
        ))}
      </div>
    </section>
  );
}
