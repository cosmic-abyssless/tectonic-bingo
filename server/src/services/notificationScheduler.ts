// The Notification rounds (CONTEXT.md "Notification"): what no request makes. Every few seconds: the audit log's
// entries no request drained (a Bingo going Live by itself) and the Discord DMs that are due. Every minute: Queue
// waiting long, the Superlative voting reminder, and the Inbox's 30-day pruning.
import { and, asc, count, eq, inArray, isNotNull, min } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos, submissions, superlativeCategories, superlativeVotes, teams } from "../db/schema";
import { log } from "../log";
import { waitedFor } from "@bingo/shared";
import { drainAuditLog } from "./notificationDispatch";
import { pruneDmLog, runDmRound, DM_ROUND_MS } from "./notificationDm";
import { bingoPlayerIds, moderatorIds, notify, optedIn, pruneInbox, type NewNotification } from "./notificationService";

type Db = BetterSQLite3Database<typeof schema>;

const MINUTE_MS = 60_000;
/** The Superlative reminder goes this long before an announced end date. */
const SUPERLATIVE_REMINDER_MS = 24 * 60 * MINUTE_MS;

/** Queue waiting long: each Moderator, once per oldest pending Submission, once it has waited past their threshold. */
export function queueWaitingLong(db: Db, now: Date): number {
  const pending = db
    .select({ bingoId: teams.bingoId, oldest: min(submissions.submittedAt), waiting: count() })
    .from(submissions)
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .where(eq(submissions.status, "pending"))
    .groupBy(teams.bingoId)
    .all();
  const items: NewNotification[] = [];
  for (const row of pending) {
    if (!row.oldest) continue;
    const bingo = db.select().from(bingos).where(eq(bingos.id, row.bingoId)).get();
    if (!bingo || bingo.historical || bingo.stage === "complete") continue;
    const oldest = db
      .select({ id: submissions.id, submittedAt: submissions.submittedAt })
      .from(submissions)
      .innerJoin(teams, eq(teams.id, submissions.teamId))
      .where(and(eq(teams.bingoId, bingo.id), eq(submissions.status, "pending")))
      .orderBy(asc(submissions.submittedAt))
      .limit(1)
      .get();
    if (!oldest) continue;
    const waitedMs = now.getTime() - oldest.submittedAt.getTime();
    for (const [userId, settings] of optedIn(db, moderatorIds(db, bingo.id), "queue_waiting_long", null)) {
      if (waitedMs < settings.queueThresholdMinutes * MINUTE_MS) continue;
      items.push({
        userId,
        kind: "queue_waiting_long",
        bingoId: bingo.id,
        title: "The review queue is waiting",
        body: `${row.waiting} waiting in ${bingo.name}, oldest ${waitedFor(oldest.submittedAt.toISOString(), now)}.`,
        link: `/b/${bingo.slug}/mod?tab=submissions`,
        data: { since: oldest.submittedAt.toISOString() },
        dedupeKey: `queue_waiting_long:${oldest.id}`,
        at: now,
      });
    }
  }
  return notify(db, items).length;
}

/** The Superlative reminder: once, a day before a Live Bingo's announced end date, to each Player who hasn't voted. */
export function superlativeReminders(db: Db, now: Date): number {
  const due = db
    .select()
    .from(bingos)
    .where(and(eq(bingos.stage, "live"), eq(bingos.historical, false), isNotNull(bingos.endsAt)))
    .all()
    .filter((b) => b.endsAt && b.endsAt.getTime() > now.getTime() && b.endsAt.getTime() - now.getTime() <= SUPERLATIVE_REMINDER_MS);
  const items: NewNotification[] = [];
  for (const bingo of due) {
    const categoryIds = db.select({ id: superlativeCategories.id }).from(superlativeCategories).where(eq(superlativeCategories.bingoId, bingo.id)).all().map((c) => c.id);
    if (categoryIds.length === 0) continue;
    const voted = new Set(db.select({ id: superlativeVotes.voterUserId }).from(superlativeVotes).where(inArray(superlativeVotes.categoryId, categoryIds)).all().map((v) => v.id));
    for (const userId of optedIn(db, bingoPlayerIds(db, bingo.id).filter((id) => !voted.has(id)), "superlative_reminder", null).keys()) {
      items.push({
        userId,
        kind: "superlative_reminder",
        bingoId: bingo.id,
        title: "Superlative voting closes soon",
        body: `${bingo.name} ends in under a day. Vote for your teammates before it does.`,
        link: `/b/${bingo.slug}`,
        dedupeKey: `superlative_reminder:${bingo.id}`,
        at: now,
      });
    }
  }
  return notify(db, items).length;
}

/** Starts the rounds. The timers don't keep the process alive. */
export function startNotificationRounds(db: Db): void {
  let dmRunning = false;
  const fast = () => {
    try {
      drainAuditLog(db);
    } catch (err) {
      log.warn("notification drain failed", { err });
    }
    if (dmRunning) return;
    dmRunning = true;
    runDmRound(db)
      .catch((err) => log.warn("discord dm round failed", { err }))
      .finally(() => {
        dmRunning = false;
      });
  };
  const slow = () => {
    const now = new Date();
    for (const [name, round] of [
      ["queue waiting long", () => queueWaitingLong(db, now)],
      ["superlative reminders", () => superlativeReminders(db, now)],
      ["inbox pruning", () => pruneInbox(db, now) + pruneDmLog(db, now)],
    ] as const) {
      try {
        round();
      } catch (err) {
        log.warn(`notification round failed: ${name}`, { err });
      }
    }
  };
  fast();
  setInterval(fast, Math.min(DM_ROUND_MS, 5_000)).unref();
  setInterval(slow, MINUTE_MS).unref();
}
