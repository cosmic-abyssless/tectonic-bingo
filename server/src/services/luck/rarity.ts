// Turns the OSRS Wiki's drop rows (its `dropsline` bucket) into drop rates:
// how many of an item one kill gives on average. That's what the luck model's
// λ = kills × rate needs, so several rolls multiply (a Barrows chest rolls 7
// times) and several rows of one item from one source add up (a Colosseum wave
// lists Sunfire splinters twice, at different quantities).

export interface DropRow {
  source: string;
  item: string;
  rarity: string;
  rolls: number;
}

/** A wiki rarity as a chance per roll: "1/1,088", "7.5/95.11", "Always". Null for words ("Common", "Varies") and blanks. */
export function parseRarity(rarity: string): number | null {
  const text = rarity.trim().replace(/^~/, "").replace(/,/g, "");
  if (/^always$/i.test(text)) return 1;
  const match = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (!match) return null;
  const [num, den] = [Number(match[1]), Number(match[2])];
  return den > 0 ? num / den : null;
}

export type Rates = Record<string, Record<string, number>>;

/** Rates by source then item, and the rows that couldn't be read. */
export function ratesFromRows(rows: DropRow[]): { rates: Rates; skipped: DropRow[] } {
  const rates: Rates = {};
  const skipped: DropRow[] = [];
  for (const row of rows) {
    const p = parseRarity(row.rarity);
    if (p === null) {
      skipped.push(row);
      continue;
    }
    const bySource = (rates[row.source] ??= {});
    bySource[row.item] = (bySource[row.item] ?? 0) + p * Math.max(1, row.rolls);
  }
  return { rates, skipped };
}

/** One `dropsline` bucket entry as a row, or null when it isn't one. */
export function rowFromBucket(entry: { drop_json?: string }): DropRow | null {
  if (!entry.drop_json) return null;
  const json = JSON.parse(entry.drop_json) as Record<string, unknown>;
  const source = json["Dropped from"];
  const item = json["Dropped item"];
  if (typeof source !== "string" || typeof item !== "string") return null;
  const rolls = Number(json["Rolls"]);
  return { source, item, rarity: String(json["Rarity"] ?? ""), rolls: Number.isFinite(rolls) && rolls > 0 ? rolls : 1 };
}
