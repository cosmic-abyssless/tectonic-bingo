import type { SubmissionFlowModel } from "../../../headless/types";
import { Dialog, DialogHeader } from "../../../core/ui/Dialog";
import { Button } from "../../../core/ui/Button";
import { Notice } from "../../../core/ui/Card";
import { useSlot } from "../../context";

export function SubmissionModal({ flow }: { flow: SubmissionFlowModel }) {
  const ScreenshotDropzone = useSlot("ScreenshotDropzone");
  const AnalysisPanel = useSlot("AnalysisPanel");
  const SubmitterPicker = useSlot("SubmitterPicker");
  const TilePicker = useSlot("TilePicker");
  const TaskPicker = useSlot("TaskPicker");
  const RequirementPicker = useSlot("RequirementPicker");
  const StagedClaimsList = useSlot("StagedClaimsList");

  return (
    <Dialog isOpen onClose={flow.close}>
      <DialogHeader title="Submit completion" onClose={flow.close} />

      <div className="space-y-5 p-5">
        <ScreenshotDropzone screenshot={flow.screenshot} />
        <AnalysisPanel analysis={flow.analysis} />

        <SubmitterPicker submitter={flow.submitter} />
        <TilePicker tile={flow.tile} />
        <TaskPicker task={flow.task} />
        <RequirementPicker requirement={flow.requirement} quantity={flow.quantity} />
        <StagedClaimsList staged={flow.staged} />

        {flow.submit.error && <Notice tone="danger">{flow.submit.error}</Notice>}

        <Button variant="primary" className="w-full" onPress={flow.submit.run} isDisabled={!flow.submit.isValid || flow.submit.isSubmitting || flow.submit.isAnalyzing}>
          {flow.submit.isSubmitting ? "Submitting…" : flow.submit.isAnalyzing ? "Analyzing…" : "Submit for review"}
        </Button>
      </div>
    </Dialog>
  );
}
