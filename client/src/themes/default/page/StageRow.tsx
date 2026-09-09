import type { Stage, StageMilestone } from "@bingo/shared";
import { MilestoneCountdown, StageStepper } from "../../../core/ui/StageStepper";

// The stepper is mod-facing (it mirrors the mod panel's stage controls);
// players only see the next milestone countdown.
export function StageRow({ stage, milestone, showStepper }: { stage: Stage; milestone: StageMilestone | null; showStepper: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      {showStepper && <StageStepper stage={stage} />}
      <MilestoneCountdown milestone={milestone} className="ml-auto" />
    </div>
  );
}
