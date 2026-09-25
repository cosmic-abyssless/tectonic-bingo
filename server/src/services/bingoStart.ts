import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { stageTransitions } from "../db/schema";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** When the bingo was last moved into the "live" stage, or null if it never was (from the stage transition log). */
export function lastWentLiveAt(db: Db | Tx, bingoId: string): Date | null {
  const row = db
    .select({ at: stageTransitions.createdAt })
    .from(stageTransitions)
    .where(and(eq(stageTransitions.bingoId, bingoId), eq(stageTransitions.toStage, "live")))
    .orderBy(desc(stageTransitions.createdAt))
    .get();
  return row?.at ?? null;
}

/**
 * The moment the bingo counts as having started, which is what tile freezes run from and what
 * opens submissions: the start date the admin set in the settings; if there isn't one, when the
 * bingo was last put into "live". (A start date is never invented from a stage change, so putting
 * the bingo live again after moving it back restarts the freeze, unless an admin fixed a date.)
 * Null when neither exists, meaning it hasn't started.
 */
export function effectiveStartsAt(db: Db | Tx, bingo: { id: string; startsAt: Date | null }): Date | null {
  return bingo.startsAt ?? lastWentLiveAt(db, bingo.id);
}

/** When the bingo moved to "complete" (the last time it did), or null while it isn't complete. */
export function endedAt(db: Db | Tx, bingo: { id: string; stage: string }): Date | null {
  if (bingo.stage !== "complete") return null;
  const row = db
    .select({ at: stageTransitions.createdAt })
    .from(stageTransitions)
    .where(and(eq(stageTransitions.bingoId, bingo.id), eq(stageTransitions.toStage, "complete")))
    .orderBy(desc(stageTransitions.createdAt))
    .get();
  return row?.at ?? null;
}
