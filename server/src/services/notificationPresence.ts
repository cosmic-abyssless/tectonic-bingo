// What a tab's presence messages (ws.ts) mean for Notifications: a tab in view drops the Discord DMs waiting for its user
// (they've had the toasts), and a Bingo's page in view records that they have it open, for their Catch-up, at most once
// a minute per user and Bingo.
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { bingos } from "../db/schema";
import { log } from "../log";
import { onPresence } from "../ws";
import { cancelPendingDms } from "./notificationDm";
import { recordBingoPresence } from "./catchUpService";

type Db = BetterSQLite3Database<typeof schema>;

const RECORD_EVERY_MS = 60_000;
const lastRecorded = new Map<string, number>();

export function installPresenceListener(db: Db): void {
  onPresence((owner, presence) => {
    if (!presence.visible) return;
    try {
      cancelPendingDms(db, owner.userId);
      if (!presence.bingoId || !db.select({ id: bingos.id }).from(bingos).where(eq(bingos.id, presence.bingoId)).get()) return;
      const key = `${owner.userId}|${presence.bingoId}`;
      const now = Date.now();
      if (now - (lastRecorded.get(key) ?? 0) < RECORD_EVERY_MS) return;
      lastRecorded.set(key, now);
      recordBingoPresence(db, owner.userId, presence.bingoId, new Date(now));
    } catch (err) {
      log.warn("recording presence failed", { err });
    }
  });
}
