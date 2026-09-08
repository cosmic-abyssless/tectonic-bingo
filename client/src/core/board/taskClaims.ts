import type { Claim, SubmissionDetails } from "@bingo/shared";

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

/** Whether an ITEM/MANUAL leaf has at least one approved claim — mirrors the engine's `value >= 1`. */
export function leafComplete(nodeId: string, maps: LeafClaimMaps): boolean {
  return itemLeafValue(nodeId, maps) >= 1;
}
