// The one-time offers to turn Notifications or Catch-up on (shared NOTIFICATION_OFFERS): single inline lines at the
// moments they're useful, never a dialog or the browser's prompt. A user gets at most one per Bingo (the first one shown
// takes the Bingo's slot), and an offer they dismissed never shows again, in any Bingo, on any device.
import { and, count, eq, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { NOTIFICATION_OFFERS, type NotificationOffer } from "@bingo/shared";
import * as schema from "../db/schema";
import { notificationOffers, submissions, teams } from "../db/schema";
import { now as clockNow } from "../clock";
import { ServiceError } from "./errors";
import { getSettings, updateSettings } from "./notificationService";

type Db = BetterSQLite3Database<typeof schema>;

/** A claim made again this soon (the same page loading twice) still shows the offer it claimed. */
const RECLAIM_MS = 10 * 60_000;

export function assertOffer(value: unknown): NotificationOffer {
  if (!(NOTIFICATION_OFFERS as readonly unknown[]).includes(value)) throw new ServiceError(400, `offer must be one of ${NOTIFICATION_OFFERS.join(", ")}`);
  return value as NotificationOffer;
}

/** Whether what the offer would turn on is still off: Notifications, or for catch_up the Catch-up. */
function stillOff(db: Db, userId: string, offer: NotificationOffer): boolean {
  const settings = getSettings(db, userId);
  return offer === "catch_up" ? !settings.catchUpEnabled : settings.level === "off";
}

/**
 * Whether to show `offer` to the user in this Bingo now, taking the Bingo's one slot if so. No when what it offers is
 * already on, they dismissed it before, or the Bingo's slot went to an offer already shown. first_submission also needs
 * the Submission just made to be their first in the Bingo.
 */
export function claimOffer(db: Db, userId: string, bingoId: string, offer: NotificationOffer): boolean {
  return db.transaction((tx) => {
    if (!stillOff(tx as unknown as Db, userId, offer)) return false;
    if (tx.select({ id: notificationOffers.id }).from(notificationOffers).where(and(eq(notificationOffers.userId, userId), eq(notificationOffers.offer, offer), eq(notificationOffers.status, "dismissed"))).get()) return false;
    const taken = tx.select().from(notificationOffers).where(and(eq(notificationOffers.userId, userId), eq(notificationOffers.bingoId, bingoId))).get();
    const now = clockNow();
    if (taken) return taken.offer === offer && taken.status === "shown" && now.getTime() - taken.createdAt.getTime() < RECLAIM_MS;
    if (offer === "first_submission") {
      const made = tx
        .select({ n: count() })
        .from(submissions)
        .innerJoin(teams, eq(teams.id, submissions.teamId))
        .where(and(eq(teams.bingoId, bingoId), or(eq(submissions.submittedByUserId, userId), eq(submissions.postedByUserId, userId))))
        .get()?.n ?? 0;
      if (made > 1) return false;
    }
    tx.insert(notificationOffers).values({ userId, bingoId, offer, status: "shown", createdAt: now }).run();
    return true;
  });
}

/**
 * The user's answer to an offer shown in this Bingo: Turn on (Notifications at In the app with the kinds they had, or
 * Catch-up on), or No thanks / ✕, which keeps that offer from ever showing again.
 */
export function answerOffer(db: Db, userId: string, bingoId: string, offer: NotificationOffer, accepted: boolean): void {
  db.transaction((tx) => {
    const now = clockNow();
    const row = tx.select().from(notificationOffers).where(and(eq(notificationOffers.userId, userId), eq(notificationOffers.bingoId, bingoId), eq(notificationOffers.offer, offer))).get();
    const status = accepted ? "accepted" : "dismissed";
    if (row) tx.update(notificationOffers).set({ status, answeredAt: now }).where(eq(notificationOffers.id, row.id)).run();
    else tx.insert(notificationOffers).values({ userId, bingoId, offer, status, createdAt: now, answeredAt: now }).run();
    if (!accepted) return;
    if (offer === "catch_up") updateSettings(tx, userId, { catchUpEnabled: true });
    else if (getSettings(tx, userId).level === "off") updateSettings(tx, userId, { level: "app" });
  });
}
