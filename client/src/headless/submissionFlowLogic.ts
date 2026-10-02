// Pure logic for the submission flow. Phase 1 only moved getAvailableTasks
// (a free-standing function with no component state), and leafStillNeeded
// (which Items are still wanted) followed; the rest
// (buildTileOptions, buildCurrentClaim, isFlowValid) is
// still entangled in SubmissionModal.tsx's component body and moves here in
// Phase 4, once useSubmissionFlow.ts actually needs it decomposed.
import type { GraphNode, NodeStatus, Tile } from "@bingo/shared";
import { groupDone, sumTotal } from "../core/board/taskClaims";

/**
 * Whether the Submit flow still offers an Item of the picked Task, given its enclosing conditions (`ancestors`, root
 * first, its parent last). Not once any of them is completed (`completed`: server-confirmed, so a still-pending sibling
 * doesn't hide the rest, since a mod could yet reject it). A SUM's Item stays wanted while the SUM is short (duplicates
 * count); a piece of an "any one of" group inside a SUM only while the SUM is short and no piece of the group is in yet,
 * since a second piece adds nothing; any other Item until it has one. `value`: a leaf's approved quantity plus what's
 * already staged in this screenshot.
 */
export function leafStillNeeded(leaf: GraphNode, ancestors: GraphNode[], completed: (nodeId: string) => boolean, value: (nodeId: string) => number): boolean {
  if (ancestors.some((a) => completed(a.id))) return false;
  const sumStillOpen = (sum: GraphNode) => sumTotal(sum, value) < (sum.quantity ?? 1);
  const parent = ancestors[ancestors.length - 1];
  if (parent?.kind === "SUM") return sumStillOpen(parent);
  const grandparent = ancestors[ancestors.length - 2];
  if (parent?.kind === "ANY" && grandparent?.kind === "SUM") return sumStillOpen(grandparent) && !groupDone(parent, value);
  return value(leaf.id) < 1;
}

// A task is a direct child of its tile's node.
export function getAvailableTasks(tile: Tile, statusByNodeId: Map<string, NodeStatus>): GraphNode[] {
  return tile.node.children.filter((task) => {
    const status = statusByNodeId.get(task.id) ?? "not_started";
    if (status === "completed") return false;
    if (task.submitGateNodeId && statusByNodeId.get(task.submitGateNodeId) !== "completed") return false;
    return true;
  });
}
