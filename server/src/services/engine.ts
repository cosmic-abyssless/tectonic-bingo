import type { NodeKind } from "@bingo/shared";

// Pure scoring engine — no DB access. Given a bingo's full node graph and one
// team's approved claims, evaluates every node bottom-up. See
// docs/node-graph-model.md §4. The caller (graphService/scoringService)
// guarantees the edge set is acyclic (enforced on every write); this module
// does not defend against cycles.

export interface EngineNode {
  id: string;
  kind: NodeKind;
  minCount: number | null; // COUNT only
  quantity: number | null; // ITEM only
  distinctItems: boolean; // ITEM only
  acceptedItemNames: string[]; // ITEM only, already resolved (inline ∪ group)
  points: number;
  pointsGateNodeId: string | null;
}

export interface ApprovedClaim {
  nodeId: string;
  itemName: string | null;
  quantity: number;
  wildcardId: string | null;
  reviewedAt: Date;
}

export interface NodeResult {
  complete: boolean;
  completedAt: Date | null;
}

// Evaluates every node in `nodes` for one team. `childrenOf` maps a node id
// to its children's ids in sortOrder (only composite nodes have entries).
export function evaluateGraph(
  nodes: EngineNode[],
  childrenOf: Map<string, string[]>,
  approvedClaims: ApprovedClaim[],
): Map<string, NodeResult> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const claimsByNode = new Map<string, ApprovedClaim[]>();
  for (const c of approvedClaims) {
    const list = claimsByNode.get(c.nodeId);
    if (list) list.push(c);
    else claimsByNode.set(c.nodeId, [c]);
  }

  const memo = new Map<string, NodeResult>();

  function evaluate(nodeId: string): NodeResult {
    const cached = memo.get(nodeId);
    if (cached) return cached;
    const node = byId.get(nodeId);
    if (!node) return { complete: false, completedAt: null };

    let result: NodeResult;
    switch (node.kind) {
      case "MANUAL": {
        const mine = (claimsByNode.get(nodeId) ?? []).slice().sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
        result = mine.length > 0 ? { complete: true, completedAt: mine[0]!.reviewedAt } : { complete: false, completedAt: null };
        break;
      }
      case "ITEM": {
        const accepted = new Set(node.acceptedItemNames.map((n) => n.toLowerCase()));
        const mine = (claimsByNode.get(nodeId) ?? [])
          .filter((c) => c.wildcardId !== null || (c.itemName !== null && accepted.has(c.itemName.toLowerCase())))
          .slice()
          .sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
        const target = node.quantity ?? 1;
        let completedAt: Date | null = null;
        if (node.distinctItems) {
          const seen = new Set<string>();
          for (const c of mine) {
            seen.add(c.itemName?.toLowerCase() ?? `wildcard:${c.wildcardId}`);
            if (seen.size >= target) { completedAt = c.reviewedAt; break; }
          }
          result = { complete: seen.size >= target, completedAt };
        } else {
          let tally = 0;
          for (const c of mine) {
            tally += c.quantity;
            if (tally >= target) { completedAt = c.reviewedAt; break; }
          }
          result = { complete: tally >= target, completedAt };
        }
        break;
      }
      case "ALL": {
        const results = (childrenOf.get(nodeId) ?? []).map(evaluate);
        // A childless ALL is a not-yet-configured tile/task, not a vacuously
        // satisfied one — treating it as complete would award its points to
        // every team the instant anything else gets approved.
        const complete = results.length > 0 && results.every((r) => r.complete);
        const completedAt = complete
          ? results.reduce<Date | null>((max, r) => (r.completedAt && (!max || r.completedAt > max) ? r.completedAt : max), null)
          : null;
        result = { complete, completedAt };
        break;
      }
      case "ANY": {
        const completeResults = (childrenOf.get(nodeId) ?? []).map(evaluate).filter((r) => r.complete);
        const completedAt = completeResults.reduce<Date | null>((min, r) => (r.completedAt && (!min || r.completedAt < min) ? r.completedAt : min), null);
        result = { complete: completeResults.length > 0, completedAt };
        break;
      }
      case "COUNT": {
        const minCount = node.minCount ?? 1;
        const completedTimes = (childrenOf.get(nodeId) ?? [])
          .map(evaluate)
          .filter((r) => r.complete)
          .map((r) => r.completedAt)
          .filter((d): d is Date => d !== null)
          .sort((a, b) => a.getTime() - b.getTime());
        const complete = completedTimes.length >= minCount;
        result = { complete, completedAt: complete ? completedTimes[minCount - 1]! : null };
        break;
      }
    }
    memo.set(nodeId, result);
    return result;
  }

  for (const n of nodes) evaluate(n.id);
  return memo;
}

// A complete node's points are withheld (0) until its gate node (if any) is
// also complete for this team. Nodes with no gate always award once complete.
export function awardedPoints(nodeId: string, results: Map<string, NodeResult>, nodesById: Map<string, EngineNode>): number {
  const node = nodesById.get(nodeId);
  if (!node) return 0;
  if (!results.get(nodeId)?.complete) return 0;
  if (node.pointsGateNodeId && !results.get(node.pointsGateNodeId)?.complete) return 0;
  return node.points;
}
