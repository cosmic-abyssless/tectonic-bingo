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

// Bingos the round leaves alone: one the test data generator is building (devTools/generateBingo/job.ts). The run plays
// it on a spoofed clock, so its start date is long past by the real one while the run is still at Board revealed; the
// run has it start, as the system or by an Admin's Start now, at the right moment on its own clock.
const held = new Set<string>();

/** Holds a Bingo back from the round until the returned release is called. */
export function holdFromStartRound(slug: string): () => void {
  held.add(slug);
  return () => held.delete(slug);
}

// The refusals a due Bingo can meet in passing: another server started it first, or an Admin moved it meanwhile.
// Anything else would refuse it every round, so it's logged.
const EXPECTED_REFUSALS = new Set(["stage_moved", "already_in_stage"]);

/**
 * Starts every Bingo that's due: at Board revealed, with a start date that has passed, and not already Live since that
 * date (one an Admin moved back to Board revealed after it started stays there, until its start date moves on).
 * Returns the Bingos it started.
 *
 * Safe to run from two servers at once (both API containers during a deploy): the change is only made from Board
 * revealed, inside its transaction, so the second finds the Bingo already Live and leaves it.
 */
export function startDueBingos(db: Db, now: Date, only?: { slug: string }): Bingo[] {
  const due = db
    .select()
    .from(bingos)
    .where(and(eq(bingos.stage, "reveal"), isNotNull(bingos.startsAt), lte(bingos.startsAt, now), only ? eq(bingos.slug, only.slug) : undefined))
    .all();
  const started: Bingo[] = [];
  for (const bingo of due) {
    // Asked for by name (the generator's own round, at its clock), a held Bingo is started all the same.
    if (!only && held.has(bingo.slug)) continue;
    const wentLive = lastWentLiveAt(db, bingo.id);
    if (wentLive && bingo.startsAt && wentLive.getTime() >= bingo.startsAt.getTime()) continue;
    try {
      const live = advanceStage(db, { bingoId: bingo.id, toStage: "live", fromStage: "reveal", changedByUserId: null, now });
      afterStageChange(db, live, "reveal", "live", null);
      started.push(live);
      log.info("bingo started at its start date", { bingoId: bingo.id, slug: bingo.slug, startsAt: bingo.startsAt?.toISOString() });
    } catch (err) {
      if (err instanceof ServiceError && err.code && EXPECTED_REFUSALS.has(err.code)) continue;
      if (err instanceof ServiceError) log.warn("a bingo due to start was refused", { bingoId: bingo.id, slug: bingo.slug, status: err.status, code: err.code, message: err.message });
      else log.error("starting a bingo at its start date failed", { err, bingoId: bingo.id });
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
