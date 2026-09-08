import type { GraphNode, Tile } from "@bingo/shared";

export function findNode(root: GraphNode, nodeId: string): GraphNode | undefined {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const hit = findNode(child, nodeId);
    if (hit) return hit;
  }
  return undefined;
}

/** ITEM and MANUAL leaves in tree order. */
export function collectLeaves(root: GraphNode): GraphNode[] {
  if (root.kind === "ITEM" || root.kind === "MANUAL") return [root];
  return root.children.flatMap(collectLeaves);
}

export function collectItemNames(root: GraphNode): string[] {
  return collectLeaves(root).flatMap((leaf) => leaf.acceptedItemNames);
}

// A tile's "tasks" are just the direct children of its node.
export function tileMatchesSearch(tile: Tile, q: string): boolean {
  if (tile.name.toLowerCase().includes(q)) return true;
  return tile.node.children.some(
    (task) => (task.description ?? "").toLowerCase().includes(q) || collectItemNames(task).some((n) => n.toLowerCase().includes(q)),
  );
}
