// Seeds one item group per Collection log section (Abyssal Sire, Chambers of
// Xeric, Hard Treasure Trails, ...) so the item picker can expand a whole
// boss/category into its drops. Idempotent: re-running refreshes the item
// list of groups it created earlier (matched by name) and leaves other
// groups alone. Source is the live wiki page, so run it whenever the log
// changes: `npm run db:seed:collection-log --workspace=server`.
import { db } from "../src/db/index";
import { createItemGroup, getItemGroups, updateItemGroup } from "../src/services/itemGroupService";

const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const CATEGORIES = new Set(["Bosses", "Raids", "Clues", "Minigames", "Other"]);

async function fetchWikitext(page: string): Promise<string> {
  const params = new URLSearchParams({ action: "parse", page, prop: "wikitext", format: "json", formatversion: "2" });
  const res = await fetch(`${WIKI_API}?${params}`, { headers: { "User-Agent": "tectonic-bingo (collection log seed)" } });
  if (!res.ok) throw new Error(`wiki responded ${res.status} for ${page}`);
  const json = (await res.json()) as { parse: { wikitext: string } };
  return json.parse.wikitext;
}

// Walks `==Category==` / `===Section===` headings; every `{{plink|Title|...}}`
// under a section belongs to that section. The first positional param is
// the wiki page title, which is also what item search stores as the item name.
function parseSections(wikitext: string): { name: string; category: string; itemNames: string[] }[] {
  const sections: { name: string; category: string; itemNames: string[] }[] = [];
  let category: string | null = null;
  let current: { name: string; category: string; itemNames: string[] } | null = null;
  for (const line of wikitext.split("\n")) {
    const h2 = /^==([^=].*?)==\s*$/.exec(line);
    if (h2) {
      category = CATEGORIES.has(h2[1].trim()) ? h2[1].trim() : null;
      current = null;
      continue;
    }
    const h3 = /^===([^=].*?)===\s*$/.exec(line);
    if (h3) {
      current = category ? { name: h3[1].trim(), category, itemNames: [] } : null;
      if (current) sections.push(current);
      continue;
    }
    if (!current) continue;
    for (const match of line.matchAll(/\{\{plink\|([^}|]+)/g)) current.itemNames.push(match[1].trim());
  }
  return sections.filter((s) => s.itemNames.length > 0);
}

async function main() {
  const sections = parseSections(await fetchWikitext("Collection_log"));
  const existing = new Map(getItemGroups(db).map((g) => [g.name, g.id]));
  let created = 0;
  let updated = 0;
  for (const { name, category, itemNames } of sections) {
    const input = { name, description: `Collection log · ${category}`, itemNames };
    const id = existing.get(name);
    if (id) {
      updateItemGroup(db, id, input);
      updated++;
    } else {
      createItemGroup(db, input);
      created++;
    }
  }
  const items = sections.reduce((n, s) => n + s.itemNames.length, 0);
  console.log(`[seed:collection-log] ${created} groups created, ${updated} refreshed (${sections.length} sections, ${items} items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
