import type { GraphNode } from "@bingo/shared";

/**
 * The names under a SUM, in order — what its label joins with " / ". An "any one of" group of Items in it is named by
 * its label, or by its pieces ("Bludgeon axon or Bludgeon claw") when it has none.
 */
export function sumItemNames(node: GraphNode): string[] {
  return node.children.map((c) => (c.kind === "ANY" ? c.label || groupPieces(c).join(" or ") : c.itemName)).filter((n): n is string => !!n);
}

/** The item names of an "any one of" group of Items inside a SUM, in order. */
export function groupPieces(group: Pick<GraphNode, "children">): string[] {
  return group.children.map((c) => c.itemName).filter((n): n is string => !!n);
}

/** An "any one of" group of Items inside a SUM, as its row reads: "Bludgeon piece (any one of: Bludgeon axon, Bludgeon claw)". */
export function groupLabel(label: string | null, pieces: string[]): string {
  const list = `any one of: ${pieces.join(", ") || "(no items)"}`;
  return label ? `${label} (${list})` : `A${list.slice(1)}`;
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
