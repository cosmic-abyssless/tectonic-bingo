import { createHash } from "node:crypto";
import { PaddleOcrService, V6_SMALL_MODEL } from "ppu-paddle-ocr";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./db/schema";
import { tiles } from "./db/schema";
import { getFullGraph, leafDescendants } from "./services/graphService";
import { findBestMatch, fuzzyIncludes, type DetectedItemMatch, type MatchableItem } from "./services/textMatchService";
import { log } from "./log";
import { ocrConcurrency } from "./ocrConfig";
import { createLimiter, createResultCache, type OcrPriority } from "./ocrScheduler";

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
  warnings: string[];
}

/** Test/CI escape hatch — skips the ~30MB first-run model download entirely. */
export function isOcrEnabled(): boolean {
  return process.env.SCREENSHOT_OCR_DISABLED !== "true";
}

// Lazy singleton: initialize() is ~1.6s warm (longer on the very first call,
// which also downloads and caches the model), so this must happen once and
// never per-request. In production warmOcr() does it in the background right
// after the server starts; elsewhere (a tsx-watch restart loop shouldn't pay
// that cost or hit the network) it waits for the first screenshot.
let _service: Promise<PaddleOcrService> | null = null;

// Recognition is CPU-bound and runs in this same process as the API, so an unbounded burst of submissions would
// make every one of them (and every other request) slow. Cap how many run at once and queue the rest.
// The limit is OCR_CONCURRENCY (default 5, see ocrConfig).
const limiter = createLimiter(ocrConcurrency(), ({ waitedMs, priority, running, queued }) => {
  log.info("ocr waited for a free slot", { waitedMs, priority, running, queued });
});

// What was read from an image, keyed by its bytes. A screenshot is analysed when it is picked in the submission
// modal and again, in the background, once it is submitted; the second time it is served from here instead of
// being read again. Only the text is kept: matching it against the codeword and board is cheap.
const textCache = createResultCache<string[]>({ ttlMs: 15 * 60_000, maxEntries: 200 });

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
    })().catch((err) => {
      // A failed load (the model download timing out, say) must not be remembered: the next call tries again
      // instead of every screenshot failing until the server restarts.
      _service = null;
      throw err;
    });
  }
  return _service;
}

/**
 * Loads the model ahead of the first screenshot so nobody's submission pays for it (or for downloading it, which
 * happens again after every deploy). Fire and forget: a failure is logged and the first real request retries.
 */
export async function warmOcr(): Promise<void> {
  const started = Date.now();
  try {
    await getOcrService();
    log.info("ocr model ready", { ms: Date.now() - started, concurrency: ocrConcurrency() });
  } catch (err) {
    log.error("ocr warm-up failed", { err });
  }
}


// A Buffer is a view into a shared, larger ArrayBuffer pool — `buf.buffer`
// alone hands the OCR library unrelated memory. Slice to the view's own range.
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// Runs local OCR on the screenshot, then matches the extracted text against
// the team's codeword and every item on this bingo's board. All matching
// (including fuzzy tolerance for OCR slips) lives in textMatchService — this
// function is I/O only: OCR the image, load the board's items, hand both to
// the pure matcher.
//
// `priority` decides who goes first when the queue is full: a person waiting on the submission modal ("interactive",
// the default) is served before the after-the-fact analysis of a submission that has already been saved ("background").
export async function analyzeSubmissionScreenshot(db: Db, bingo: Bingo, team: Team, file: ScreenshotFile, opts: { priority?: OcrPriority } = {}): Promise<AnalyzeResult> {
  try {
    return await runAnalyze(db, bingo, team, file, opts.priority ?? "interactive");
  } catch (err) {
    log.error("ocr analysis failed", { err, bingoId: bingo.id, teamId: team.id });
    throw err;
  }
}

function recognizeText(buffer: Buffer, priority: OcrPriority): Promise<string[]> {
  const key = createHash("sha256").update(buffer).digest("hex");
  return textCache.getOrCompute(key, () =>
    limiter.run(async () => {
      const service = await getOcrService();
      // noCache: the library's own cache is tiny and keyed differently; ours (above) is what dedupes.
      const result = await service.recognize(toArrayBuffer(buffer), { noCache: true });
      return result.text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    }, priority),
  );
}

async function runAnalyze(db: Db, bingo: Bingo, team: Team, file: ScreenshotFile, priority: OcrPriority): Promise<AnalyzeResult> {
  const extractedText = [...(await recognizeText(file.buffer, priority))];

  // Fixed at 1 edit regardless of the codeword's length — a false positive
  // here wrongly suppresses the "codeword not found" warning mods rely on,
  // so this stays more conservative than the length-scaled item default.
  const codewordFound = fuzzyIncludes(extractedText, team.codeword, { maxEdits: 1 });

  // Every ITEM leaf under each tile's node — one MatchableItem per leaf now
  // that a leaf holds exactly one name.
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

  const warnings: string[] = [];
  if (!codewordFound) {
    warnings.push(`Codeword '${team.codeword}' was not found in your screenshot. Make sure it's visible on screen before submitting.`);
  }

  return { codewordFound, codeword: team.codeword, extractedText, detectedMatch, warnings };
}
