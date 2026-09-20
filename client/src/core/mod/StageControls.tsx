import { useState } from "react";
import { STAGE_LABEL, STAGE_ORDER, nextMilestone, type Bingo, type Stage } from "@bingo/shared";
import { useAdvanceStage } from "../../api/queries";
import { Button } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { MilestoneCountdown, StageStepper } from "../ui/StageStepper";
import { ArrowLeftIcon, ArrowRightIcon } from "../ui/icons";

// What advancing *into* each stage does, so a mod knows before confirming.
const ENTER_EFFECT: Record<Stage, string> = {
  planning: "Signups close; the board becomes editable again.",
  signup: "Players can sign up and edit their answers. New signups are gated on clan membership. Captains can be picked from the Captains tab as signups come in.",
  captains: "Signups close and the roster is final. Captains can keep scouting until the draft starts.",
  draft: "Captains can enter the draft room. Start the draft from there once everyone is present.",
  reveal: "Teams and the board become visible to players. The board locks for editing.",
  live: "Submissions open. If no start time is set, the bingo starts now.",
  complete: "Submissions close; the board and stats stay visible.",
};

/** The stage and what is next. Only site admins can change it: for anyone else there are no buttons, just the read-out. */
export function StageControls({ slug, bingo, canChange }: { slug: string; bingo: Bingo; canChange: boolean }) {
  const advanceStage = useAdvanceStage(slug);
  const [confirming, setConfirming] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const idx = STAGE_ORDER.indexOf(bingo.stage);
  const nextStage = idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  const prevStage = idx > 0 ? STAGE_ORDER[idx - 1] : null;

  // Stages strictly between the current one and the target, in travel order.
  const skipped = confirming ? STAGE_ORDER.slice(Math.min(idx, STAGE_ORDER.indexOf(confirming)) + 1, Math.max(idx, STAGE_ORDER.indexOf(confirming))) : [];

  async function go(toStage: Stage) {
    setError(null);
    try {
      await advanceStage.mutateAsync(toStage);
      setConfirming(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to change stage");
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-on-surface-subtle">Current stage</p>
          <p className="text-lg font-semibold text-on-surface">{STAGE_LABEL[bingo.stage]}</p>
        </div>
        <div className="flex gap-2">
          {canChange && prevStage && (
            <Button size="sm" onPress={() => setConfirming(prevStage)}>
              <ArrowLeftIcon />
              Back to {STAGE_LABEL[prevStage]}
            </Button>
          )}
          {canChange && nextStage && (
            <Button size="sm" variant="primary" onPress={() => setConfirming(nextStage)}>
              Advance to {STAGE_LABEL[nextStage]}
              <ArrowRightIcon />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StageStepper stage={bingo.stage} onSelect={canChange ? setConfirming : undefined} />
        <MilestoneCountdown milestone={nextMilestone(bingo)} />
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {canChange && confirming && (
        <Notice tone="warn">
          <p className="font-medium text-on-surface">
            Move from {STAGE_LABEL[bingo.stage]} to {STAGE_LABEL[confirming]}?
          </p>
          <p className="mt-1 text-on-surface-muted">{ENTER_EFFECT[confirming]}</p>
          {skipped.length > 0 && (
            <p className="mt-1 text-on-surface-muted">
              Skips {skipped.map((s) => STAGE_LABEL[s]).join(", ")}.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="ghost" onPress={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onPress={() => go(confirming)} isDisabled={advanceStage.isPending}>
              Confirm
            </Button>
          </div>
        </Notice>
      )}
    </Card>
  );
}
