import type { ReactNode } from "react";
import { useSubmissionFlow } from "./useSubmissionFlow";
import type { SubmissionFlowModel } from "./types";

// Mounted only while the submission flow is open (see BoardPageLayout) —
// unmounting is what resets its state, matching the old SubmissionModal's
// own mount-only-while-open lifecycle.
export function SubmissionFlowHost({
  initialTileId,
  initialTaskId,
  initialFile,
  onClose,
  onSuccess,
  children,
}: {
  initialTileId?: string;
  initialTaskId?: string;
  /** Seeds the flow's screenshot on mount; a new File while already mounted feeds it in again (drag-drop/paste-to-submit). */
  initialFile?: File;
  onClose: () => void;
  onSuccess: () => void;
  children: (flow: SubmissionFlowModel) => ReactNode;
}) {
  const flow = useSubmissionFlow({ initialTileId, initialTaskId, initialFile, onClose, onSuccess });
  return children(flow);
}
