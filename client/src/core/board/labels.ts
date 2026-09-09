import type { GraphNode } from "@bingo/shared";

/** For an ITEM leaf, just its name. For a SUM, its children's names joined — the SUM is what carries the quantity/target now. */
export function leafLabel(node: GraphNode): string {
  if (node.kind === "SUM") return node.children.map((c) => c.itemName).filter((n): n is string => !!n).join(" / ") || "(no items)";
  return node.itemName ?? "(no item)";
}

export function compositeLabel(node: GraphNode): string {
  switch (node.kind) {
    case "ALL":
      return "All of:";
    case "ANY":
      return "Any one of:";
    case "COUNT":
      return `At least ${node.minCount ?? 1} of:`;
    default:
      return "";
  }
}
