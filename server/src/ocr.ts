import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./db/schema";
import { tiles } from "./db/schema";
import { getFullGraph, leafDescendants } from "./services/graphService";
import { findBestMatch, fuzzyIncludes, type DetectedItemMatch, type MatchableItem } from "./services/textMatchService";
import { log } from "./log";
import { createRemoteRecognizer } from "./ocrClient";
import { ocrRequestTimeoutMs, ocrServiceUrl } from "./ocrConfig";
import type { OcrPriority } from "./ocrScheduler";
import { createTextReader, type TextRecognizer } from "./ocrText";

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

// Where the reading happens depends on OCR_URL. Set (production and staging), every screenshot goes to the separate
// `ocr` service, which has its own CPU and its own limit on concurrent readings, so a burst of submissions can't slow
// the site. Unset (local development, tests), it is read inside this process by the same engine, loaded on first use so
// an API that only talks to the service never pays for the model runtime.
// The API never falls back to reading in-process when the service is set but down: that would load the model into the
// process that serves the site, which is exactly what the split avoids. The analysis fails cleanly (503) and the
// submission itself is unaffected: see OcrUnavailableError.
async function recognizeInProcess(buffer: Buffer, priority: OcrPriority): Promise<string[]> {
  const { recognizeLocally } = await import("./ocrEngine");
  return recognizeLocally(buffer, priority);
}

const recognizeText: TextRecognizer = createTextReader((buffer, priority) => {
  const url = ocrServiceUrl();
  return url ? createRemoteRecognizer({ url, timeoutMs: ocrRequestTimeoutMs() })(buffer, priority) : recognizeInProcess(buffer, priority);
});

/**
 * Loads the model ahead of the first screenshot so nobody's submission pays for it. Only meaningful when reading
 * in-process: with a separate OCR service, that service warms itself. Fire and forget: a failure is logged and the
 * first real request retries.
 */
export async function warmOcr(): Promise<void> {
  if (ocrServiceUrl()) return;
  const { warmOcrEngine } = await import("./ocrEngine");
  await warmOcrEngine();
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
