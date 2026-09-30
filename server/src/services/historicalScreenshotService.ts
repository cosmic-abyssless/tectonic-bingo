// A Historical Bingo's screenshots, uploaded after its import (#320, docs/historical-bingos-plan.md → Screenshots are
// uploaded separately). The import records each one as pending: its Submission's screenshot row with the bundle's key
// (`historicalKey`) and no file yet (`storageUrl` empty). A script then uploads them one at a time, resumably, and
// each upload attaches its file to the rows that name its key.
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos, submissionScreenshots, submissions, teams } from "../db/schema";
import { audit } from "../audit/record";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Bingo = typeof bingos.$inferSelect;

export interface HistoricalScreenshotStatus {
  pending: number;
  attached: number;
  /** The keys still to upload, sorted. */
  pendingKeys: string[];
}

/** Every one of the Bingo's imported screenshots: its key, and whether its file is attached yet. */
function screenshotsOf(db: Db | Tx, bingoId: string): { id: string; key: string; attached: boolean }[] {
  return db
    .select({ id: submissionScreenshots.id, key: submissionScreenshots.historicalKey, storageUrl: submissionScreenshots.storageUrl })
    .from(submissionScreenshots)
    .innerJoin(submissions, eq(submissionScreenshots.submissionId, submissions.id))
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(and(eq(teams.bingoId, bingoId), isNotNull(submissionScreenshots.historicalKey)))
    .all()
    .map((r) => ({ id: r.id, key: r.key!, attached: r.storageUrl !== "" }));
}

function statusOf(rows: { key: string; attached: boolean }[]): HistoricalScreenshotStatus {
  const pendingKeys = [...new Set(rows.filter((r) => !r.attached).map((r) => r.key))].sort();
  const attached = new Set(rows.filter((r) => r.attached).map((r) => r.key)).size;
  return { pending: pendingKeys.length, attached, pendingKeys };
}

export function requireHistorical(bingo: Bingo): void {
  if (!bingo.historical) throw new ServiceError(409, "Only a Historical Bingo's imported screenshots can be attached");
}

export function getScreenshotStatus(db: Db, bingo: Bingo): HistoricalScreenshotStatus {
  requireHistorical(bingo);
  return statusOf(screenshotsOf(db, bingo.id));
}

/** Where a key stands before its file is taken: an unknown key is refused (404). */
export function screenshotKeyState(db: Db, bingo: Bingo, key: string): "pending" | "attached" {
  requireHistorical(bingo);
  const rows = screenshotsOf(db, bingo.id).filter((r) => r.key === key);
  if (rows.length === 0) throw new ServiceError(404, `"${key}" isn't one of this Bingo's imported screenshots`);
  return rows.some((r) => !r.attached) ? "pending" : "attached";
}

export interface AttachResult {
  /** False when the key was already attached (by an earlier or concurrent upload): the file given wasn't used. */
  attached: boolean;
  status: HistoricalScreenshotStatus;
}

/**
 * Attaches a stored upload (`storageUrl`) to every pending screenshot row with this key. When it's the last pending
 * one, the Bingo gets its one audit entry for all of them.
 */
export function attachScreenshot(db: Db, bingo: Bingo, key: string, storageUrl: string): AttachResult {
  requireHistorical(bingo);
  return db.transaction((tx) => {
    const rows = screenshotsOf(tx, bingo.id);
    const mine = rows.filter((r) => r.key === key);
    if (mine.length === 0) throw new ServiceError(404, `"${key}" isn't one of this Bingo's imported screenshots`);
    const pending = mine.filter((r) => !r.attached);
    if (pending.length === 0) return { attached: false, status: statusOf(rows) };

    tx.update(submissionScreenshots).set({ storageUrl }).where(inArray(submissionScreenshots.id, pending.map((r) => r.id))).run();
    const after = rows.map((r) => (r.key === key ? { ...r, attached: true } : r));
    const status = statusOf(after);
    if (status.pending === 0) {
      audit(tx, {
        action: "bingo.historical_screenshots_attached",
        bingoId: bingo.id,
        entity: { type: "bingo", id: bingo.id, label: bingo.name },
        details: { slug: bingo.slug, name: bingo.name, screenshots: status.attached },
      });
    }
    return { attached: true, status };
  });
}
