import { EmptyState } from "../../../core/ui/Card";
import { ClockIcon } from "../../../core/ui/icons";

export function PlanningStage({ stage }: { stage: "planning" | "captains" }) {
  return (
    <EmptyState icon={<ClockIcon size={20} />} title={stage === "planning" ? "Signups haven't opened yet" : "Signups are closed"}>
      {stage === "planning" ? "Check back once the mods open signups." : "Mods are picking team captains. The draft comes next."}
    </EmptyState>
  );
}
