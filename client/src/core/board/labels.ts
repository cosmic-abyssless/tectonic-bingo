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

/** "counts as 25" for an Item that adds more than one to its SUM's total (CONTEXT.md "Counts as"); null when it counts as 1. */
export function countsAsLabel(countsAs: number | null | undefined): string | null {
  return countsAs && countsAs !== 1 ? `counts as ${countsAs}` : null;
}

/** The quantity hint in the Submit flow: the SUM's total, and what one of the picked item adds to it when that isn't 1. */
export function sumQuantityHint(quantity: { needed: number; countsAs: number }): string {
  const each = countsAsLabel(quantity.countsAs);
  return `${each ? `Each ${each} · ` : ""}${quantity.needed} needed in total`;
}
