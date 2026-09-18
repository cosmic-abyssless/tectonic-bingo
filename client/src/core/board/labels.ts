import type { GraphNode } from "@bingo/shared";

/** The item names under a SUM, in order — what its label joins with " / ". */
export function sumItemNames(node: GraphNode): string[] {
  return node.children.map((c) => c.itemName).filter((n): n is string => !!n);
}

/** For an ITEM leaf, just its name. For a SUM, its children's names joined — the SUM is what carries the quantity/target now. */
export function leafLabel(node: GraphNode): string {
  if (node.kind === "SUM") return sumItemNames(node).join(" / ") || "(no items)";
  return node.itemName ?? "(no item)";
}
