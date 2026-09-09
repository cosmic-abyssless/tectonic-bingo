import type { Stage, StageMilestone } from "@bingo/shared";
import { MilestoneCountdown, StageStepper } from "../../../core/ui/StageStepper";

export function StageRow({ stage, milestone }: { stage: Stage; milestone: StageMilestone | null }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <StageStepper stage={stage} />
      <MilestoneCountdown milestone={milestone} />
    </div>
  );
}
