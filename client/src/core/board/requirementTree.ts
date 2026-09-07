import type { RequirementNode, Tile } from "@bingo/shared";

export function findNode(root: RequirementNode, nodeId: string): RequirementNode | undefined {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const hit = findNode(child, nodeId);
    if (hit) return hit;
  }
  return undefined;
}

/** ITEM and MANUAL leaves in tree order. */
export function collectLeaves(root: RequirementNode): RequirementNode[] {
  if (root.kind === "ITEM" || root.kind === "MANUAL") return [root];
  return root.children.flatMap(collectLeaves);
}

export function collectItemNames(root: RequirementNode): string[] {
  return collectLeaves(root).flatMap((leaf) => leaf.acceptedItemNames);
}

export function tileMatchesSearch(tile: Tile, q: string): boolean {
  if (tile.name.toLowerCase().includes(q)) return true;
  return tile.tasks.some(
    (task) => task.description.toLowerCase().includes(q) || collectItemNames(task.requirement).some((n) => n.toLowerCase().includes(q)),
  );
}
