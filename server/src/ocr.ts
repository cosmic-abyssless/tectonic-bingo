import { PaddleOcrService, V6_SMALL_MODEL } from "ppu-paddle-ocr";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./db/schema";
import { tileTaskItems, tileTasks, tileWildcards, tiles } from "./db/schema";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;
type Team = typeof schema.teams.$inferSelect;

export interface ScreenshotFile {
  buffer: Buffer;
  mimetype: string;
}

export interface AnalyzeResult {
  codewordFound: boolean;
  codeword: string;
  extractedText: string[];
  detectedMatch: { tileId: string; tileName: string; taskId: string; taskItemId: string; itemName: string } | null;
  detectedWildcard: { tileId: string; tileName: string; wildcardId: string; itemName: string; applicableTaskId: string | null } | null;
  warnings: string[];
}

/** Test/CI escape hatch — skips the ~30MB first-run model download entirely. */
export function isOcrEnabled(): boolean {
  return process.env.SCREENSHOT_OCR_DISABLED !== "true";
}

// Lazy singleton: initialize() is ~1.6s warm (longer on the very first call,
// which also downloads and caches the model), so this must happen once, on
// first use — never at server boot (a tsx-watch restart loop shouldn't pay
// that cost or hit the network) and never per-request.
let _service: Promise<PaddleOcrService> | null = null;

function getOcrService(): Promise<PaddleOcrService> {
  if (!_service) {
    _service = (async () => {
      const service = new PaddleOcrService({ model: V6_SMALL_MODEL });
      await service.initialize();
      return service;
    })();
  }
  return _service;
}

// A Buffer is a view into a shared, larger ArrayBuffer pool — `buf.buffer`
// alone hands the OCR library unrelated memory. Slice to the view's own range.
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// Runs local OCR on the screenshot, then matches the extracted text against
// the team's codeword and every item/wildcard on this bingo's board.
export async function analyzeSubmissionScreenshot(db: Db, bingo: Bingo, team: Team, file: ScreenshotFile): Promise<AnalyzeResult> {
  const service = await getOcrService();
  const result = await service.recognize(toArrayBuffer(file.buffer), { noCache: true });
  const extractedText = result.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Plain substring matching for now — Phase O2 (textMatchService) adds edit-
  // distance tolerance for OCR slips on OSRS's bitmap font.
  const codewordFound = extractedText.some((line) => line.toLowerCase().includes(team.codeword.toLowerCase()));

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

  let detectedMatch: AnalyzeResult["detectedMatch"] = null;
  outer: for (const item of items) {
    const needle = item.itemName.toLowerCase();
    for (const text of extractedText) {
      if (text.toLowerCase().includes(needle)) {
        detectedMatch = { tileId: item.tileId, tileName: item.tileName, taskId: item.taskId, taskItemId: item.id, itemName: item.itemName };
        break outer;
      }
    }
  }

  // Only check wildcards if no regular item was matched.
  let detectedWildcard: AnalyzeResult["detectedWildcard"] = null;
  if (!detectedMatch) {
    outerWc: for (const wc of wildcards) {
      const needle = wc.itemName.toLowerCase();
      for (const text of extractedText) {
        if (text.toLowerCase().includes(needle)) {
          detectedWildcard = { tileId: wc.tileId, tileName: wc.tileName, wildcardId: wc.id, itemName: wc.itemName, applicableTaskId: wc.applicableTaskId };
          break outerWc;
        }
      }
    }
  }

  const warnings: string[] = [];
  if (!codewordFound) {
    warnings.push(`Codeword '${team.codeword}' was not found in your screenshot. Make sure it's visible on screen before submitting.`);
  }

  return { codewordFound, codeword: team.codeword, extractedText, detectedMatch, detectedWildcard, warnings };
}
