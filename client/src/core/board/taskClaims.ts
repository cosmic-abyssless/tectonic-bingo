import type { Claim, GraphNode, SubmissionDetails } from "@bingo/shared";

export interface LeafClaimMaps {
  /** Approved claims grouped by requirement leaf node id. */
  approvedByNode: Map<string, Claim[]>;
  /** Leaf node ids with any non-rejected claim. */
  submittedNodeIds: Set<string>;
}

// Builds per-leaf "what's been submitted/approved" maps from a team's
// submissions — feeds TaskPanel's progress display. Mirrors the server's
// engine: an ITEM leaf's value is the sum of its approved claims' quantity.
export function buildLeafClaimMaps(teamSubmissions: SubmissionDetails[]): LeafClaimMaps {
  const approvedByNode = new Map<string, Claim[]>();
  const submittedNodeIds = new Set<string>();

  for (const detail of teamSubmissions) {
    if (detail.submission.status === "rejected") continue;
    for (const c of detail.claims) {
      submittedNodeIds.add(c.nodeId);
      if (detail.submission.status !== "approved") continue;
      const list = approvedByNode.get(c.nodeId) ?? [];
      list.push(c);
      approvedByNode.set(c.nodeId, list);
    }
  }

  return { approvedByNode, submittedNodeIds };
}

/** Sum of approved-claim quantity for one ITEM leaf. */
export function itemLeafValue(nodeId: string, maps: LeafClaimMaps): number {
  const approved = maps.approvedByNode.get(nodeId) ?? [];
  return approved.reduce((sum, c) => sum + c.quantity, 0);
}

/**
 * A SUM's running total, mirroring the server's engine: each child Item's quantity (from `valueOf`, the real number of
 * items) times what it counts as (CONTEXT.md "Counts as"), so one Pyromancer garb adds 25 to "200 burnt pages"; and 1
 * for each "any one of" group of Items in it that has one of its Items (see groupDone).
 */
export function sumTotal(sum: Pick<GraphNode, "children">, valueOf: (nodeId: string) => number): number {
  return sum.children.reduce((total, child) => total + (child.kind === "ANY" ? (groupDone(child, valueOf) ? 1 : 0) : valueOf(child.id) * (child.countsAs ?? 1)), 0);
}

/** Whether an "any one of" group of Items (an ANY inside a SUM) has one of its Items, by `valueOf`: it then adds its 1. */
export function groupDone(group: Pick<GraphNode, "children">, valueOf: (nodeId: string) => number): boolean {
  return group.children.some((piece) => valueOf(piece.id) >= 1);
}

/** Whether an ITEM/MANUAL leaf has at least one approved claim — mirrors the engine's `value >= 1`. */
export function leafComplete(nodeId: string, maps: LeafClaimMaps): boolean {
  return itemLeafValue(nodeId, maps) >= 1;
}
