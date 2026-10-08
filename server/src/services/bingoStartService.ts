// A Bingo goes Live by itself at its start date (CONTEXT.md "Stage": Live always means started). A round every few
// seconds moves each Bingo that's due from Board revealed to Live, as the system, with the same follow-ups as an
// Admin's stage change (stageChangeEffects.ts).

import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos } from "../db/schema";
import { log } from "../log";
import { advanceStage } from "./bingoService";
import { lastWentLiveAt } from "./bingoStart";
import { ServiceError } from "./errors";
import { afterStageChange } from "./stageChangeEffects";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

/** How often the round looks for Bingos due to start: the most a start can lag its date by. */
export const START_ROUND_MS = 5_000;

/**
 * Starts every Bingo that's due: at Board revealed, with a start date that has passed, and not already Live since that
 * date (one an Admin moved back to Board revealed after it started stays there, until its start date moves on).
 * Returns the Bingos it started.
 *
 * Safe to run from two servers at once (both API containers during a deploy): the change is only made from Board
 * revealed, inside its transaction, so the second finds the Bingo already Live and leaves it.
 */
export function startDueBingos(db: Db, now: Date): Bingo[] {
  const due = db
    .select()
    .from(bingos)
    .where(and(eq(bingos.stage, "reveal"), isNotNull(bingos.startsAt), lte(bingos.startsAt, now)))
    .all();
  const started: Bingo[] = [];
  for (const bingo of due) {
    const wentLive = lastWentLiveAt(db, bingo.id);
    if (wentLive && bingo.startsAt && wentLive.getTime() >= bingo.startsAt.getTime()) continue;
    try {
      const live = advanceStage(db, { bingoId: bingo.id, toStage: "live", fromStage: "reveal", changedByUserId: null, now });
      afterStageChange(db, live, "reveal", "live", null);
      started.push(live);
      log.info("bingo started at its start date", { bingoId: bingo.id, slug: bingo.slug, startsAt: bingo.startsAt?.toISOString() });
    } catch (err) {
      // Another server started it first, an Admin moved it, or its start date moved into the future: nothing to do.
      if (err instanceof ServiceError) continue;
      log.error("starting a bingo at its start date failed", { err, bingoId: bingo.id });
    }
  }
  return started;
}

/** Starts the round, and runs one now (a start missed while the server was down happens as it comes back). The timer doesn't keep the process alive. */
export function startBingoStarts(db: Db): void {
  const round = () => {
    try {
      startDueBingos(db, new Date());
    } catch (err) {
      log.warn("bingo start round failed", { err });
    }
  };
  round();
  setInterval(round, START_ROUND_MS).unref();
}
