import { createContext, useContext } from "react";
import { exclusivityGroupOf, normalizeItemName, type ExclusivityRule } from "@bingo/shared";

// The bingo's exclusivity rules, for the board editor: an item the rules name shows an "exclusive" badge where it
// is edited, so an admin sees the rule where the item lives (the rules themselves are managed in the settings).
const ExclusiveItemsContext = createContext<readonly ExclusivityRule[]>([]);
export const ExclusiveItemsProvider = ExclusiveItemsContext.Provider;

/** The rules that name an item. */
export function useRulesFor(itemName: string): ExclusivityRule[] {
  const rules = useContext(ExclusiveItemsContext);
  const name = normalizeItemName(itemName);
  return rules.filter((r) => r.itemNames.some((n) => normalizeItemName(n) === name) || exclusivityGroupOf(r, itemName) !== null);
}

/** "Pets: one tile, Slayer: one part (as a Bludgeon piece)" for a tooltip. */
export const describeRules = (rules: ExclusivityRule[], itemName: string): string =>
  rules
    .map((r) => {
      const group = exclusivityGroupOf(r, itemName);
      return `${r.label}: one ${r.scope}${group ? ` (as a ${group.label})` : ""}`;
    })
    .join(", ");
