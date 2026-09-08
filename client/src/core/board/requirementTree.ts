import type { GraphNode, GraphNodeInput, NodeKind, Tile } from "@bingo/shared";

// The server replaces a node's full fields + subtree on every write — this
// mirrors a loaded node into that same input shape unmodified, both for "the
// task's current state, as input" (TaskEditor's patch calls) and for cloning
// an existing composite in as a shared child, ids and all (RequirementTreeEditor's
// "+ existing condition").
export function toGraphNodeInput(node: GraphNode): GraphNodeInput {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    description: node.description,
    notes: node.notes,
    points: node.points,
    minCount: node.minCount ?? undefined,
    quantity: node.quantity ?? undefined,
    itemName: node.itemName ?? undefined,
    pointsGateNodeId: node.pointsGateNodeId,
    submitGateNodeId: node.submitGateNodeId,
    allowsPreLoad: node.allowsPreLoad,
    children: node.children.map(toGraphNodeInput),
  };
}

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

/**
 * Every ALL/ANY/COUNT/SUM block in a tree — the admin editor's "condition
 * blocks" that can be referenced whole, not decomposed into leaves — each
 * paired with an outline-style dot label: the root is "1", each composite
 * child is its parent's label + ".N" (counting only composite siblings —
 * items don't get a number and don't count toward one), so a nested
 * condition's label shows exactly where it lives (a first composite
 * grandchild of the second composite child of the root is "1.2.1").
 *
 * Generic over GraphNode (server-loaded) and GraphNodeInput (an unsaved
 * admin draft, whose nodes have no id yet) — both shapes carry `kind` and
 * `children`, which is all this needs.
 */
export function collectLabeledConditions<T extends { kind: NodeKind; children?: T[] | null }>(root: T): { node: T; label: string }[] {
  const result: { node: T; label: string }[] = [];
  function walk(node: T, label: string) {
    if (node.kind === "ITEM" || node.kind === "MANUAL") return;
    result.push({ node, label });
    let counter = 0;
    for (const child of node.children ?? []) {
      if (child.kind === "ITEM" || child.kind === "MANUAL") continue;
      counter += 1;
      walk(child, `${label}.${counter}`);
    }
  }
  walk(root, "1");
  return result;
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
