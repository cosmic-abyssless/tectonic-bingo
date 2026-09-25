import type { GraphNodeInput } from "@bingo/shared";

// Moving a row of a task's requirement tree by drag and drop (RequirementTreeEditor). A row is addressed by its path of
// child indexes from the task's root; a drop spot by its parent's path and the index it inserts at (0 = before the
// first child, children.length = after the last). The moved node keeps its id, so claims already on it stay valid:
// the server's PATCH updates a node named by id in place, wherever it now sits, and saves children in array order.

export type Path = number[];

export function nodeAt(root: GraphNodeInput, path: Path): GraphNodeInput | undefined {
  let node: GraphNodeInput | undefined = root;
  for (const i of path) node = node?.children?.[i];
  return node;
}

function startsWith(path: Path, prefix: Path): boolean {
  return prefix.length <= path.length && prefix.every((v, i) => path[i] === v);
}

function updateAt(root: GraphNodeInput, path: Path, fn: (node: GraphNodeInput) => GraphNodeInput): GraphNodeInput {
  if (path.length === 0) return fn(root);
  const [head, ...rest] = path;
  return { ...root, children: (root.children ?? []).map((child, i) => (i === head ? updateAt(child, rest, fn) : child)) };
}

/**
 * Whether a drop at (parent, index) would do something and is allowed: not into the dragged row itself or anywhere
 * inside it, not right where it already is, and not into a condition that already has the same node (a shared item or
 * condition can't be one condition's child twice).
 */
export function canMove(root: GraphNodeInput, from: Path, toParent: Path, toIndex: number): boolean {
  if (from.length === 0 || startsWith(toParent, from)) return false;
  const node = nodeAt(root, from);
  const parent = nodeAt(root, toParent);
  if (!node || !parent || parent.kind === "ITEM") return false;
  const fromParent = from.slice(0, -1);
  const fromIndex = from[from.length - 1]!;
  const sameParent = fromParent.length === toParent.length && startsWith(toParent, fromParent);
  if (sameParent) return toIndex !== fromIndex && toIndex !== fromIndex + 1;
  return !node.id || !(parent.children ?? []).some((c) => c.id === node.id);
}

/** The tree with the row at `from` moved to index `toIndex` of the node at `toParent` (both as they are before the move). */
export function moveNode(root: GraphNodeInput, from: Path, toParent: Path, toIndex: number): GraphNodeInput {
  const node = nodeAt(root, from)!;
  const fromParent = from.slice(0, -1);
  const fromIndex = from[from.length - 1]!;
  // Taking the row out shifts its later siblings up one, which moves the drop spot too when it's among (or inside) them.
  const parent = [...toParent];
  let index = toIndex;
  if (startsWith(parent, fromParent)) {
    const d = fromParent.length;
    if (parent.length === d) {
      if (index > fromIndex) index--;
    } else if (parent[d]! > fromIndex) {
      parent[d]!--;
    }
  }
  const removed = updateAt(root, fromParent, (p) => ({ ...p, children: (p.children ?? []).filter((_, i) => i !== fromIndex) }));
  return updateAt(removed, parent, (p) => {
    const children = [...(p.children ?? [])];
    children.splice(index, 0, node);
    return { ...p, children };
  });
}
