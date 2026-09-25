// Looks up an Item's drop rates by the Wise Old Man bosses that drop it (#195),
// from the checked-in snapshot (dropRates.json, written by
// scripts/fetch-drop-rates.ts). An Item no tracked boss drops has no sources,
// so luck leaves it out.
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

export function dropRateTable(rates: Rates): DropRateTable {
  const byItem = new Map<string, Map<BossMetric, number>>();
  for (const [metric, sources] of Object.entries(BOSS_SOURCES) as [BossMetric, DropSource[]][]) {
    for (const source of sources) {
      const weight = source.weight ?? 1;
      for (const [item, rate] of Object.entries(rates[source.source] ?? {})) {
        const key = item.trim().toLowerCase();
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
