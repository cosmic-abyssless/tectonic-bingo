// Refreshes the drop-rate snapshot luck is judged on (#195): reads every boss's
// drop rows from the OSRS Wiki (its `dropsline` bucket), adds the hand-written
// raid rates, and writes src/services/luck/dropRates.json. Run it by hand when
// drop rates change, then commit the JSON. Sequential with a delay between
// pages, to be polite to the wiki. Usage: npm run drop-rates:refresh -w server
import fs from "fs";
import path from "path";
import { USER_AGENT } from "../src/config";
import { BOSS_SOURCES, wikiPages } from "../src/services/luck/bossSources";
import { RAID_RATES } from "../src/services/luck/raidRates";
import { ratesFromRows, rowFromBucket, type DropRow, type Rates } from "../src/services/luck/rarity";

const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const DELAY_MS = 500;
const OUT = path.join(__dirname, "../src/services/luck/dropRates.json");

async function pageRows(page: string): Promise<DropRow[]> {
  const escaped = page.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = `bucket('dropsline').select('drop_json').where('page_name','${escaped}').limit(5000).run()`;
  const url = `${WIKI_API}?${new URLSearchParams({ action: "bucket", format: "json", query })}`;
  const res = await fetch(url, { headers: { "User-Agent": `${USER_AGENT} drop rates` } });
  if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
  const body = (await res.json()) as { bucket?: { drop_json?: string }[]; error?: string };
  if (body.error) throw new Error(`${page}: ${body.error}`);
  return (body.bucket ?? []).map(rowFromBucket).filter((r): r is DropRow => r !== null);
}

/** `rates` with its sources and items in sorted order, so a refresh diffs cleanly. */
function sorted(rates: Rates): Rates {
  return Object.fromEntries(
    Object.keys(rates)
      .sort()
      .map((source) => [source, Object.fromEntries(Object.entries(rates[source]).sort(([a], [b]) => a.localeCompare(b)))]),
  );
}

async function main() {
  const wanted = new Set(Object.values(BOSS_SOURCES).flatMap((sources) => sources.map((s) => s.source)));
  const rows: DropRow[] = [];
  const pages = wikiPages();
  console.log(`[drop-rates] reading ${pages.length} wiki pages`);
  for (const page of pages) {
    rows.push(...(await pageRows(page)).filter((r) => wanted.has(r.source)));
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  const { rates, skipped } = ratesFromRows(rows);
  Object.assign(rates, RAID_RATES);

  for (const row of skipped) console.log(`[drop-rates] skipped ${row.source} | ${row.item} | "${row.rarity}"`);
  for (const [metric, sources] of Object.entries(BOSS_SOURCES)) {
    const missing = sources.filter((s) => !rates[s.source]);
    for (const s of missing) console.log(`[drop-rates] no rates for ${metric} (${s.source})`);
  }

  fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), rates: sorted(rates) }, null, 2) + "\n");
  const count = Object.values(rates).reduce((n, items) => n + Object.keys(items).length, 0);
  console.log(`[drop-rates] wrote ${count} rates from ${Object.keys(rates).length} sources -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
