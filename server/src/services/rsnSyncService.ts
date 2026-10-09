// Keeps a signup's RSN current when the player renames their account in-game. The WOM id stored at signup (matched
// from the player's clan-registered RSNs, routes/bingos.ts) follows the account through a rename, so asking
// tectonic-api which name that WOM id goes by now gives the up-to-date RSN. Run when a mod refreshes a signup's stats,
// before the stats are fetched, so they're fetched under the current name.
//
// A Borrowed account (CONTEXT.md "Signup") isn't one of the Player's clan accounts, so its WOM id (from Wise Old Man,
// when an Admin set it) is asked of Wise Old Man itself. Either way only the name follows: the Signup stays on the
// account it's on, borrowed or not.
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { signups } from "../db/schema";
import { audit } from "../audit/record";
import { log } from "../log";
import { broadcast } from "../ws";
import { getTectonicClient, TectonicUnavailableError, type TectonicClient } from "./tectonicService";
import { getWomClient, parseWomAccount, type WomClient } from "./womService";

type Db = BetterSQLite3Database<typeof schema>;

export interface RsnSyncResult {
  /** The signup's RSN after the check: the new name if it changed, else the one it had. */
  rsn: string;
  /** The old name, when it changed. */
  renamedFrom: string | null;
}

/** The name the borrowed account's WOM id goes by on Wise Old Man now, or null when WOM can't say. */
async function borrowedAccountName(womClient: WomClient, womId: string): Promise<string | null> {
  const found = await womClient.lookupPlayerById(womId);
  if (found.status === "unavailable") log.warn("rsn sync: wom unavailable, keeping the signup's rsn", { womId });
  return found.status === "found" ? (parseWomAccount(found.player)?.displayName ?? null) : null;
}

/**
 * Looks up the signup's WOM id on tectonic-api (Wise Old Man for a Borrowed account) and, if the account now goes by a
 * different name, saves the new RSN and records a signup.name_changed audit entry. Never throws for tectonic or WOM
 * trouble: with no WOM id, no integration, an unknown id or an outage, the signup keeps its RSN.
 */
export async function syncSignupRsn(db: Db, signupId: string, client: TectonicClient | null = getTectonicClient(), womClient: WomClient = getWomClient()): Promise<RsnSyncResult> {
  const signup = db
    .select({ id: signups.id, rsn: signups.rsn, womId: signups.womId, accountBorrowed: signups.accountBorrowed, bingoId: signups.bingoId, userId: signups.userId })
    .from(signups)
    .where(eq(signups.id, signupId))
    .get();
  if (!signup) return { rsn: "", renamedFrom: null };
  const unchanged = { rsn: signup.rsn, renamedFrom: null };
  if (!signup.womId) return unchanged;

  let current: string | null;
  if (signup.accountBorrowed) {
    current = await borrowedAccountName(womClient, signup.womId);
  } else {
    if (!client) return unchanged;
    try {
      current = await client.getRsnByWomId(signup.womId);
    } catch (err) {
      if (!(err instanceof TectonicUnavailableError)) throw err;
      log.warn("rsn sync: tectonic unavailable, keeping the signup's rsn", { signupId, womId: signup.womId });
      return unchanged;
    }
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
  broadcast({ type: "player_renamed", bingoId: signup.bingoId, payload: { userId: signup.userId } });
  return { rsn: next, renamedFrom: signup.rsn };
}
