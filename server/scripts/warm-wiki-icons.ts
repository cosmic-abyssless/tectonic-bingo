// Pre-fetches every item icon the app uses into the wiki icon cache
// (middleware/wikiIcons.ts), so the first players don't pay a cold fetch each.
// Safe to re-run: names already cached (or recently confirmed missing on the
// wiki) are skipped. Sequential with a delay between fetches, to be polite to
// the wiki. Usage: npm run wiki-icons:warm -w server
import { WIKI_ICONS_DIR } from "../src/config";
import { createWikiIconCache, iconFileName } from "../src/middleware/wikiIcons";
import { getKnownItemNames } from "../src/services/itemNames";
import fs from "fs";
import path from "path";

const DELAY_MS = 500;

async function main() {
  const names = [...getKnownItemNames()].sort();
  const cache = createWikiIconCache({ dir: WIKI_ICONS_DIR });
  const counts = { alreadyCached: 0, fetched: 0, missing: 0, failed: 0 };
  console.log(`[wiki-icons:warm] ${names.length} item names -> ${WIKI_ICONS_DIR}`);

  for (const name of names) {
    // Decide "already cached" before ensure() so we only sleep after real wiki requests.
    const iconOnDisk = fs.existsSync(path.join(WIKI_ICONS_DIR, iconFileName(name)));
    const result = await cache.ensure(name);
    if (iconOnDisk) counts.alreadyCached++;
    else if (result === "hit") counts.fetched++;
    else if (result === "miss") counts.missing++;
    else counts.failed++;
    const askedTheWiki = !iconOnDisk && (result === "hit" || result === "failed" || result === "miss");
    if (askedTheWiki) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log(`[wiki-icons:warm] done: ${counts.fetched} fetched, ${counts.alreadyCached} already cached, ${counts.missing} not on the wiki, ${counts.failed} failed`);
  if (counts.failed > 0) console.log("[wiki-icons:warm] failed names can be retried by running this again.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
