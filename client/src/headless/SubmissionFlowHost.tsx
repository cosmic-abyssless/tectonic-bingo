import type { ReactNode } from "react";
import type { SubmissionKind } from "@bingo/shared";
import { useSubmissionFlow } from "./useSubmissionFlow";
import { useTutorialSubmitSeed } from "./useTutorial";
import type { SubmissionFlowModel } from "./types";

// Mounted only while the submission flow is open (see BoardPageLayout) —
// unmounting is what resets its state, matching the old SubmissionModal's
// own mount-only-while-open lifecycle.
export function SubmissionFlowHost({
  initialTileId,
  initialTaskId,
  initialFile,
  initialKind,
  onClose,
  onSuccess,
  children,
}: {
  initialTileId?: string;
  initialTaskId?: string;
  /** "proof" opens it on posting a Proof screenshot for initialTileId (and initialTaskId). */
  initialKind?: SubmissionKind;
  /** Seeds the flow's screenshot on mount; a new File while already mounted feeds it in again (drag-drop/paste-to-submit). */
  initialFile?: File;
  onClose: () => void;
  onSuccess: () => void;
  children: (flow: SubmissionFlowModel) => ReactNode;
}) {
  // Opened during the Tutorial (CONTEXT.md), it starts on the Tile the Player opened there, so there's something to show.
  const seed = useTutorialSubmitSeed();
  const flow = useSubmissionFlow({
    initialTileId: initialTileId ?? seed?.tileId,
    initialTaskId: initialTileId ? initialTaskId : seed?.taskId,
    initialFile,
    initialKind,
    onClose,
    onSuccess,
  });
  return children(flow);
}
