// Quick OCR sanity check against a real screenshot, without going through
// the UI — lets a mod/dev see exactly what the OCR pipeline extracts and
// matches for a given image in seconds. Not part of the server build
// (tsconfig.json's rootDir is src/, so this lives outside it and tsc never
// touches it); run directly with tsx.
//
//   node ../node_modules/tsx/dist/cli.mjs scripts/ocr-smoke.ts <path-to-image> [bingo-slug]
//
// With a bingo slug, also prints what analyzeSubmissionScreenshot-level item
// matching would decide against that bingo's real board data (reads
// whatever DB_PATH points at — same as every other script here).

import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { bingos, tiles } from "../src/db/schema";
import { getOcrService } from "../src/ocrEngine";
import { getFullGraph, leafDescendants } from "../src/services/graphService";
import { findBestMatch, type MatchableItem } from "../src/services/textMatchService";

async function main() {
  const [, , imagePath, slug] = process.argv;
  if (!imagePath) {
    console.error("Usage: tsx scripts/ocr-smoke.ts <path-to-image> [bingo-slug]");
    process.exit(1);
  }

  const buffer = readFileSync(imagePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

  const initStart = Date.now();
  const service = await getOcrService();
  const initMs = Date.now() - initStart;

  const recognizeStart = Date.now();
  const result = await service.recognize(arrayBuffer, { noCache: true });
  const recognizeMs = Date.now() - recognizeStart;

  const extractedText = result.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  console.log(`init: ${initMs}ms, recognize: ${recognizeMs}ms\n`);
  console.log("Extracted lines:");
  for (const line of extractedText) console.log(`  ${line}`);

  if (!slug) {
    console.log('\n(pass a bingo slug as a 2nd argument to also check item matching, e.g. "demo")');
    return;
  }

  const bingo = db.select().from(bingos).where(eq(bingos.slug, slug)).get();
  if (!bingo) {
    console.error(`\nNo bingo with slug "${slug}"`);
    process.exitCode = 1;
    return;
  }

  // Every ITEM leaf under each tile's node — one MatchableItem per leaf.
  // Mirrors ocr.ts's analyzeSubmissionScreenshot exactly.
  const tileRows = db.select({ id: tiles.id, nodeId: tiles.nodeId, name: tiles.name }).from(tiles).where(eq(tiles.bingoId, bingo.id)).all();
  const { childrenOf, nodesById } = getFullGraph(db, bingo.id);
  const items: MatchableItem[] = [];
  for (const tile of tileRows) {
    for (const leafId of leafDescendants(tile.nodeId, childrenOf, nodesById)) {
      const node = nodesById.get(leafId);
      if (node?.kind !== "ITEM" || !node.itemName) continue;
      items.push({ nodeId: leafId, itemName: node.itemName, tileId: tile.id, tileName: tile.name });
    }
  }

  const { detectedMatch } = findBestMatch(extractedText, items);

  console.log(`\nAgainst bingo "${bingo.name}" (${items.length} items):`);
  if (detectedMatch) {
    console.log(`  Matched item: ${detectedMatch.itemName} (tile: ${detectedMatch.tileName})`);
  } else {
    console.log("  No match");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
