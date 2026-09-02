// Quick OCR sanity check against a real screenshot, without going through
// the UI — lets a mod/dev see exactly what the OCR pipeline extracts and
// matches for a given image in seconds. Not part of the server build
// (tsconfig.json's rootDir is src/, so this lives outside it and tsc never
// touches it); run directly with tsx.
//
//   node ../node_modules/tsx/dist/cli.mjs scripts/ocr-smoke.ts <path-to-image> [bingo-slug]
//
// With a bingo slug, also prints what analyzeSubmissionScreenshot-level
// item/wildcard matching would decide against that bingo's real board data
// (reads whatever DB_PATH points at — same as every other script here).

import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { PaddleOcrService, V6_SMALL_MODEL } from "ppu-paddle-ocr";
import { db } from "../src/db";
import { bingos, tileTaskItems, tileTasks, tileWildcards, tiles } from "../src/db/schema";
import { findBestMatch } from "../src/services/textMatchService";

async function main() {
  const [, , imagePath, slug] = process.argv;
  if (!imagePath) {
    console.error("Usage: tsx scripts/ocr-smoke.ts <path-to-image> [bingo-slug]");
    process.exit(1);
  }

  const buffer = readFileSync(imagePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

  const service = new PaddleOcrService({ model: V6_SMALL_MODEL });
  const initStart = Date.now();
  await service.initialize();
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
    console.log('\n(pass a bingo slug as a 2nd argument to also check item/wildcard matching, e.g. "demo")');
    return;
  }

  const bingo = db.select().from(bingos).where(eq(bingos.slug, slug)).get();
  if (!bingo) {
    console.error(`\nNo bingo with slug "${slug}"`);
    process.exitCode = 1;
    return;
  }

  const items = db
    .select({ id: tileTaskItems.id, itemName: tileTaskItems.itemName, taskId: tileTasks.id, tileId: tiles.id, tileName: tiles.name })
    .from(tileTaskItems)
    .innerJoin(tileTasks, eq(tileTaskItems.taskId, tileTasks.id))
    .innerJoin(tiles, eq(tileTasks.tileId, tiles.id))
    .where(eq(tiles.bingoId, bingo.id))
    .all();

  const wildcards = db
    .select({ id: tileWildcards.id, itemName: tileWildcards.itemName, applicableTaskId: tileWildcards.applicableTaskId, tileId: tiles.id, tileName: tiles.name })
    .from(tileWildcards)
    .innerJoin(tiles, eq(tileWildcards.tileId, tiles.id))
    .where(eq(tiles.bingoId, bingo.id))
    .all();

  const { detectedMatch, detectedWildcard } = findBestMatch(extractedText, items, wildcards);

  console.log(`\nAgainst bingo "${bingo.name}" (${items.length} items, ${wildcards.length} wildcards):`);
  if (detectedMatch) {
    console.log(`  Matched item: ${detectedMatch.itemName} (tile: ${detectedMatch.tileName})`);
  } else if (detectedWildcard) {
    console.log(`  Matched wildcard: ${detectedWildcard.itemName} (tile: ${detectedWildcard.tileName})`);
  } else {
    console.log("  No match");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
