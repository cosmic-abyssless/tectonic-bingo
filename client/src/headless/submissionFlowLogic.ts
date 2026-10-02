// Pure logic for the submission flow. Phase 1 only moves getAvailableTasks
// (a free-standing function with no component state); the rest
// (computeOpenLeaves, buildTileOptions, buildCurrentClaim, isFlowValid) is
// still entangled in SubmissionModal.tsx's component body and moves here in
// Phase 4, once useSubmissionFlow.ts actually needs it decomposed.
import type { GraphNode, NodeStatus, Tile } from "@bingo/shared";

// A task is a direct child of its tile's node.
export function getAvailableTasks(tile: Tile, statusByNodeId: Map<string, NodeStatus>): GraphNode[] {
  return tile.node.children.filter((task) => {
    const status = statusByNodeId.get(task.id) ?? "not_started";
    if (status === "completed") return false;
    if (task.submitGateNodeId && statusByNodeId.get(task.submitGateNodeId) !== "completed") return false;
    return true;
  });
}
