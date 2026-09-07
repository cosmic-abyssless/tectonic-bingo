import { PaddleOcrService, V6_SMALL_MODEL } from "ppu-paddle-ocr";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./db/schema";
import { itemGroupItems, requirementNodeItems, requirementNodes, tileTasks, tileWildcards, tiles } from "./db/schema";
import { findBestMatch, fuzzyIncludes, type DetectedItemMatch, type DetectedWildcardMatch } from "./services/textMatchService";

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
  detectedMatch: DetectedItemMatch | null;
  detectedWildcard: DetectedWildcardMatch | null;
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

// Exported so scripts/ocr-smoke.ts uses the exact same tuned options as
// production rather than the library's defaults, which drift silently
// otherwise (that drift is how the maxSideLength bug above went unnoticed).
export function getOcrService(): Promise<PaddleOcrService> {
  if (!_service) {
    _service = (async () => {
      const service = new PaddleOcrService({
        model: V6_SMALL_MODEL,
        // The library's default "auto" cap (clamp(0.75 * longestSide, 960,
        // 1920)) shrinks a real full-client RuneLite screenshot enough to
        // drop entire chatbox lines outright — confirmed against a real
        // 1500px-wide screenshot where "auto" silently dropped 4 of 9 chat
        // lines and a fixed higher cap recovered all of them. Real
        // screenshots aren't the tightly-cropped benchmark images this
        // model was tuned against, so don't downscale them.
        detection: { maxSideLength: 4000 },
        // charactersDictionary is typed as required here, but the library
        // always overwrites it with the loaded dict during initialize() —
        // confirmed by reading paddle-ocr.service.js. `[]` matches the
        // library's own DEFAULT_RECOGNITION_OPTIONS placeholder.
        //
        // strategy: "per-box" overrides the library default ("per-line",
        // which merges same-line boxes before recognizing). On a real
        // screenshot that merge corrupted adjacent text — e.g. a UI label
        // "frost-wyvern 03/09/2026 21:08 UTC" came out as "rost-uyer
        // 03/09/20e26 2" / "1.08 UT" under per-line, but recognized exactly
        // right (0.94-0.99 confidence per box) under per-box. A/B against
        // the same real screenshot showed per-box was more accurate on
        // nearly every line (not just this one), with no measurable
        // latency cost for a screenshot-sized image.
        recognition: { maxCropSourceSideLength: 4000, charactersDictionary: [], strategy: "per-box" },
      });
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
// the team's codeword and every item/wildcard on this bingo's board. All
// matching (including fuzzy tolerance for OCR slips) lives in
// textMatchService — this function is I/O only: OCR the image, load the
// board's items/wildcards, hand both to the pure matcher.
export async function analyzeSubmissionScreenshot(db: Db, bingo: Bingo, team: Team, file: ScreenshotFile): Promise<AnalyzeResult> {
  const service = await getOcrService();
  const result = await service.recognize(toArrayBuffer(file.buffer), { noCache: true });
  const extractedText = result.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Fixed at 1 edit regardless of the codeword's length — a false positive
  // here wrongly suppresses the "codeword not found" warning mods rely on,
  // so this stays more conservative than the length-scaled item/wildcard default.
  const codewordFound = fuzzyIncludes(extractedText, team.codeword, { maxEdits: 1 });

  const leafBase = {
    nodeId: requirementNodes.id,
    taskId: tileTasks.id,
    tileId: tiles.id,
    tileName: tiles.name,
  };
  const inlineItems = db
    .select({ ...leafBase, itemName: requirementNodeItems.itemName })
    .from(requirementNodeItems)
    .innerJoin(requirementNodes, eq(requirementNodeItems.nodeId, requirementNodes.id))
    .innerJoin(tileTasks, eq(requirementNodes.taskId, tileTasks.id))
    .innerJoin(tiles, eq(tileTasks.tileId, tiles.id))
    .where(eq(tiles.bingoId, bingo.id))
    .all();
  const groupItems = db
    .select({ ...leafBase, itemName: itemGroupItems.itemName })
    .from(itemGroupItems)
    .innerJoin(requirementNodes, eq(itemGroupItems.groupId, requirementNodes.itemGroupId))
    .innerJoin(tileTasks, eq(requirementNodes.taskId, tileTasks.id))
    .innerJoin(tiles, eq(tileTasks.tileId, tiles.id))
    .where(eq(tiles.bingoId, bingo.id))
    .all();
  const items = [...inlineItems, ...groupItems];

  const wildcards = db
    .select({ id: tileWildcards.id, itemName: tileWildcards.itemName, applicableNodeId: tileWildcards.applicableNodeId, tileId: tiles.id, tileName: tiles.name })
    .from(tileWildcards)
    .innerJoin(tiles, eq(tileWildcards.tileId, tiles.id))
    .where(eq(tiles.bingoId, bingo.id))
    .all();

  const { detectedMatch, detectedWildcard } = findBestMatch(extractedText, items, wildcards);

  const warnings: string[] = [];
  if (!codewordFound) {
    warnings.push(`Codeword '${team.codeword}' was not found in your screenshot. Make sure it's visible on screen before submitting.`);
  }

  return { codewordFound, codeword: team.codeword, extractedText, detectedMatch, detectedWildcard, warnings };
}
