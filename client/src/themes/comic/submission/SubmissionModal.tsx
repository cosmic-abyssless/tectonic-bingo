import type { SubmissionFlowModel } from "../../../headless/types";
import { useSlot } from "../../context";
import { ComicDialog, ComicDialogHeader } from "../ui/ComicDialog";
import { ComicButton } from "../ui/ComicButton";
import { CaptionBox } from "../ui/CaptionBox";

/**
 * The submission form: exhibit
 * photo up top, the form fields below, and a big red SUBMIT to send it.
 */
export function SubmissionModal({ flow }: { flow: SubmissionFlowModel }) {
  const ScreenshotDropzone = useSlot("ScreenshotDropzone");
  const AnalysisPanel = useSlot("AnalysisPanel");
  const SubmitterPicker = useSlot("SubmitterPicker");
  const TilePicker = useSlot("TilePicker");
  const TaskPicker = useSlot("TaskPicker");
  const ProofPicker = useSlot("ProofPicker");
  const RequirementPicker = useSlot("RequirementPicker");
  const StagedClaimsList = useSlot("StagedClaimsList");

  const busy = flow.submit.isSubmitting || flow.submit.isAnalyzing;
  const label = flow.submit.isSubmitting ? "Submitting…" : flow.submit.isAnalyzing ? "Analyzing…" : "Submit for review";

  return (
    <ComicDialog isOpen onClose={flow.close} isDismissable={!flow.submit.isSubmitting}>
      <ComicDialogHeader
        title={flow.kind.value === "proof" ? "Proof screenshot" : "Submit completion"}
        subtitle={flow.kind.value === "proof" ? "Attach a screenshot of the starting state." : "Attach a screenshot and pick what it proves."}
        onClose={flow.close}
      />

      <div className="relative space-y-5 p-5">
        <ScreenshotDropzone screenshot={flow.screenshot} />
        <AnalysisPanel analysis={flow.analysis} />

        <SubmitterPicker submitter={flow.submitter} />
        <TilePicker tile={flow.tile} />
        <TaskPicker task={flow.task} />
        <ProofPicker kind={flow.kind} warning={flow.proofWarning} />
        <RequirementPicker requirement={flow.requirement} quantity={flow.quantity} />
        <StagedClaimsList staged={flow.staged} />

        {flow.submit.error && (
          <CaptionBox tone="red" title="Submission failed">
            <p className="text-sm">{flow.submit.error}</p>
          </CaptionBox>
        )}

        <ComicButton
          variant="primary"
          size="lg"
          className="w-full"
          isDisabled={!flow.submit.isValid || busy}
          sfx={{ text: "SUBMITTED!", size: 150 }}
          onPress={() => {
            void flow.submit.run();
          }}
        >
          {label}
        </ComicButton>
      </div>
    </ComicDialog>
  );
}
