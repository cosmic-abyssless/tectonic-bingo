import type { Claim, SubmissionDetails } from "@bingo/shared";

export interface LeafClaimMaps {
  /** Approved claims grouped by requirement leaf node id. */
  approvedByNode: Map<string, Claim[]>;
  /** Leaf node ids with any non-rejected claim. */
  submittedNodeIds: Set<string>;
}

// Builds per-leaf "what's been submitted/approved" maps from a team's
// submissions — feeds TaskPanel's progress display. Mirrors the server's
// evaluateNode: an ITEM leaf's tally is the sum (or distinct count) of its
// approved claims.
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

export function leafProgress(nodeId: string, distinctItems: boolean, maps: LeafClaimMaps): number {
  const approved = maps.approvedByNode.get(nodeId) ?? [];
  if (distinctItems) return new Set(approved.map((c) => c.itemName?.toLowerCase())).size;
  return approved.reduce((sum, c) => sum + c.quantity, 0);
}
