import type { RequirementNodeModel } from "./types";

/** The item a single-item requirement row names (an ITEM leaf, or a SUM over one item), to link it; null otherwise. */
export function itemNameOf(node: RequirementNodeModel): string | null {
  // An ITEM leaf's label is its item name; iconUrl is set only when it has one (not the "(no item)" placeholder).
  if (node.kind === "ITEM") return node.iconUrl ? node.label : null;
  if (node.kind === "SUM" && node.items.length === 1) return node.items[0]!.name;
  return null;
}
