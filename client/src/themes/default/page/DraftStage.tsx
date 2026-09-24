import type { StageMilestone } from "@bingo/shared";
import type { BingoPageModel } from "../../../headless/types";
import { EmptyState, Notice } from "../../../core/ui/Card";
import { Button } from "../../../core/ui/Button";
import { MilestoneCountdown } from "../../../core/ui/StageStepper";
import { CheckIcon, UsersIcon } from "../../../core/ui/icons";
import { FinalTeams } from "../../../core/draft/FinalTeams";
import { useAuth } from "../../../context/AuthContext";

/**
 * Draft stage: before it starts, a countdown; while it runs, a pointer into
 * the draft room; once done, the team reveal. The draft endpoint is 403 for
 * people who didn't sign up, so the error case just shows the generic copy.
 */
export function DraftStage({ draft, milestone, onOpenDraft }: { draft: BingoPageModel["draft"]; milestone: StageMilestone | null; onOpenDraft: () => void }) {
  const { user } = useAuth();
  if (draft.isLoading) return null;

  // Having draft state at all means the server let us into the room (mods,
  // captains and signed-up players), so offer the door even before it starts.
  if (!draft.state || !draft.state.draftStarted) {
    return (
      <EmptyState
        icon={<UsersIcon size={20} />}
        title="The draft hasn't started yet"
        action={
          draft.state ? (
            <Button variant="primary" onPress={onOpenDraft}>
              Open draft room
            </Button>
          ) : undefined
        }
      >
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
    <section className="space-y-4">
      <Notice tone="ok" icon={<CheckIcon />}>
        Draft complete. The board is revealed next.
      </Notice>
      <FinalTeams teams={draft.state.teams} picks={draft.state.picks} myUserId={user?.id ?? null} />
    </section>
  );
}
