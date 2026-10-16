// Looks up an Item's drop rates by the Wise Old Man bosses that drop it (#195),
// from the checked-in snapshot (dropRates.json, written by
// scripts/fetch-drop-rates.ts). An Item no tracked boss drops has no sources,
// so luck leaves it out, and so does a skilling pet even where a boss's table
// lists it (SKILLING_PETS).
import { UNCHARGED_SUFFIXES } from "../gePriceService";
import { BOSS_SOURCES, type BossMetric, type DropSource } from "./bossSources";
import type { Rates } from "./rarity";
import snapshot from "./dropRates.json";

export interface ItemSource {
  metric: BossMetric;
  /** How many of the Item one kill gives on average. */
  rate: number;
}

export interface DropRateTable {
  /** The bosses that drop `item`, matched like GE prices: case-insensitive, or as its uncharged version. */
  sourcesOf(item: string): ItemSource[];
}

/**
 * Skilling pets have no luck (CONTEXT.md "Luck"). A boss's table can list one (Hespori's Tangleroot, 1 in 5,375), but a
 * Player almost always gets it from the skill, so judging it over their few kills of that boss made it look absurdly lucky.
 */
const SKILLING_PETS = new Set(
  ["Abyssal protector", "Baby chinchompa", "Beaver", "Giant squirrel", "Heron", "Herbi", "Phoenix", "Rift guardian", "Rock golem", "Rocky", "Smolcano", "Tangleroot", "Tiny tempor"].map(
    (name) => name.toLowerCase(),
  ),
);

export function dropRateTable(rates: Rates): DropRateTable {
  const byItem = new Map<string, Map<BossMetric, number>>();
  for (const [metric, sources] of Object.entries(BOSS_SOURCES) as [BossMetric, DropSource[]][]) {
    for (const source of sources) {
      const weight = source.weight ?? 1;
      for (const [item, rate] of Object.entries(rates[source.source] ?? {})) {
        const key = item.trim().toLowerCase();
        if (SKILLING_PETS.has(key)) continue;
        const byMetric = byItem.get(key) ?? new Map<BossMetric, number>();
        byMetric.set(metric, (byMetric.get(metric) ?? 0) + rate * weight);
        byItem.set(key, byMetric);
      }
    }
  }
  return {
    sourcesOf(item) {
      const key = item.trim().toLowerCase();
      for (const suffix of ["", ...UNCHARGED_SUFFIXES]) {
        const byMetric = byItem.get(key + suffix);
        if (byMetric) return [...byMetric].map(([metric, rate]) => ({ metric, rate }));
      }
      return [];
    },
  };
}

let _table: DropRateTable | undefined;

export function getDropRates(): DropRateTable {
  if (!_table) _table = dropRateTable(snapshot.rates);
  return _table;
}
