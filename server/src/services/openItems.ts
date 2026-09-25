// Which Items would still move each node forward for one Team at a moment:
// its open Items (#195). Luck's Clutch judges a drop against the Items that
// were still open on its Task; a Tile's open Items are what its missing points
// hang on. Pure, like the engine it builds on.
import { evaluateGraph, type ApprovedClaim, type EngineNode } from "./engine";

/**
 * Every node's open Items, given the Claims approved by `at` (item names, as on the Board). A complete node has
 * none. An incomplete ITEM is open. A SUM short of its total keeps all its Items open. ALL, ANY and COUNT are open
 * through their incomplete children: the missing ones, any one, and the ones not yet counted.
 */
export function openItems(
  nodes: EngineNode[],
  childrenOf: Map<string, string[]>,
  approvedClaims: ApprovedClaim[],
  at: Date,
): Map<string, Set<string>> {
  const results = evaluateGraph(
    nodes,
    childrenOf,
    approvedClaims.filter((c) => c.reviewedAt <= at),
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, Set<string>>();

  function open(nodeId: string): Set<string> {
    const cached = memo.get(nodeId);
    if (cached) return cached;
    const node = byId.get(nodeId);
    let items = new Set<string>();
    if (node && !results.get(nodeId)?.complete) {
      const children = childrenOf.get(nodeId) ?? [];
      switch (node.kind) {
        case "ITEM":
          if (node.itemName) items.add(node.itemName);
          break;
        case "MANUAL":
          break;
        case "SUM":
          items = new Set(children.map((id) => byId.get(id)?.itemName).filter((n): n is string => !!n));
          break;
        case "ALL":
        case "ANY":
        case "COUNT":
          for (const child of children) for (const item of open(child)) items.add(item);
          break;
      }
    }
    memo.set(nodeId, items);
    return items;
  }

  for (const n of nodes) open(n.id);
  return memo;
}
