import { createContext, useContext } from "react";
import { normalizeItemName, type ExclusivityRule } from "@bingo/shared";

// The bingo's exclusivity rules, for the board editor: an item the rules name shows an "exclusive" badge where it
// is edited, so an admin sees the rule where the item lives (the rules themselves are managed in the settings).
const ExclusiveItemsContext = createContext<readonly ExclusivityRule[]>([]);
export const ExclusiveItemsProvider = ExclusiveItemsContext.Provider;

/** The rules that name an item. */
export function useRulesFor(itemName: string): ExclusivityRule[] {
  const rules = useContext(ExclusiveItemsContext);
  const name = normalizeItemName(itemName);
  return rules.filter((r) => r.itemNames.some((n) => normalizeItemName(n) === name));
}

/** "Pets: one tile, Slayer: one part" for a tooltip. */
export const describeRules = (rules: ExclusivityRule[]): string => rules.map((r) => `${r.label}: one ${r.scope}`).join(", ");
