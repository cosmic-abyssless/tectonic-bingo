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

/**
 * ITEM/MANUAL leaves paired with their immediate parent — lets a caller tell
 * a SUM's child (duplicates still wanted until the SUM's own total is met)
 * apart from an ordinary leaf (open until it individually completes). See
 * docs/item-quantity-model.md §8.
 */
export function collectLeavesWithParent(root: GraphNode, parent: GraphNode | null = null): { leaf: GraphNode; parent: GraphNode | null }[] {
  if (root.kind === "ITEM" || root.kind === "MANUAL") return [{ leaf: root, parent }];
  return root.children.flatMap((child) => collectLeavesWithParent(child, root));
}

export function collectItemNames(root: GraphNode): string[] {
  return collectLeaves(root)
    .map((leaf) => leaf.itemName)
    .filter((name): name is string => name !== null);
}

// A tile's "tasks" are just the direct children of its node.
export function tileMatchesSearch(tile: Tile, q: string): boolean {
  if (tile.name.toLowerCase().includes(q)) return true;
  return tile.node.children.some(
    (task) => (task.description ?? "").toLowerCase().includes(q) || collectItemNames(task).some((n) => n.toLowerCase().includes(q)),
  );
}
