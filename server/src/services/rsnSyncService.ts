// Keeps a signup's RSN current when the player renames their account in-game. The WOM id stored at signup (matched
// from the player's clan-registered RSNs, routes/bingos.ts) follows the account through a rename, so asking
// tectonic-api which name that WOM id goes by now gives the up-to-date RSN. Run when a mod refreshes a signup's stats,
// before the stats are fetched, so they're fetched under the current name.
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { signups } from "../db/schema";
import { audit } from "../audit/record";
import { log } from "../log";
import { broadcast } from "../ws";
import { getTectonicClient, TectonicUnavailableError, type TectonicClient } from "./tectonicService";
import { syncWomCompetition } from "./womCompetitionService";

type Db = BetterSQLite3Database<typeof schema>;

export interface RsnSyncResult {
  /** The signup's RSN after the check: the new name if it changed, else the one it had. */
  rsn: string;
  /** The old name, when it changed. */
  renamedFrom: string | null;
}

/**
 * Looks up the signup's WOM id on tectonic-api and, if the account now goes by a different name, saves the new RSN
 * and records a signup.name_changed audit entry. Never throws for tectonic trouble: with no WOM id, no integration,
 * an unknown id or an outage, the signup keeps its RSN.
 */
export async function syncSignupRsn(db: Db, signupId: string, client: TectonicClient | null = getTectonicClient()): Promise<RsnSyncResult> {
  const signup = db
    .select({ id: signups.id, rsn: signups.rsn, womId: signups.womId, bingoId: signups.bingoId, userId: signups.userId })
    .from(signups)
    .where(eq(signups.id, signupId))
    .get();
  if (!signup) return { rsn: "", renamedFrom: null };
  const unchanged = { rsn: signup.rsn, renamedFrom: null };
  if (!signup.womId || !client) return unchanged;

  let current: string | null;
  try {
    current = await client.getRsnByWomId(signup.womId);
  } catch (err) {
    if (!(err instanceof TectonicUnavailableError)) throw err;
    log.warn("rsn sync: tectonic unavailable, keeping the signup's rsn", { signupId, womId: signup.womId });
    return unchanged;
  }
  const next = current?.trim();
  if (!next || next === signup.rsn) return unchanged;

  db.transaction((tx) => {
    tx.update(signups).set({ rsn: next }).where(eq(signups.id, signup.id)).run();
    audit(tx, {
      action: "signup.name_changed",
      bingoId: signup.bingoId,
      entity: { type: "signup", id: signup.id, label: next },
      details: { before: signup.rsn, after: next, womId: signup.womId! },
      onBehalfOfUserId: signup.userId,
    });
  });
  log.info("rsn sync: signup renamed", { signupId, before: signup.rsn, after: next });
  broadcast({ type: "signup_changed", bingoId: signup.bingoId, payload: {} });
  // A drafted player's new name has to reach their team in the WOM competition too (a no-op before one exists).
  void syncWomCompetition(db, signup.bingoId);
  return { rsn: next, renamedFrom: signup.rsn };
}
