// Fetches WOM + RuneProfile data for a signup's RSN and persists the raw
// responses onto the signup row, once, at signup time — see
// docs/tectonic-api-integration-plan.md. Draft-time reads
// (draftService/routes/bingos.ts) then just parse the stored JSON; no live
// external calls in that hot path. Data can go stale between signup and
// draft day (a player could re-roll their ironman status, sync WOM, etc.)
// — accepted tradeoff for what's a reference display, not authoritative.
//
// Called fire-and-forget from the signup routes (never awaited in the
// response path — a flaky third-party API should never slow down or fail
// someone's signup) and from the dev seed-signups tool. Never throws.
import { now as clockNow } from "../clock";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import type { AccountType, SignupAnswer, WomPlayerStats } from "@bingo/shared";
import * as schema from "../db/schema";
import { signupAnswers, signups } from "../db/schema";
import { getWomClient, parseWomSummary, type WomClient } from "./womService";
import { getRuneProfileClient, parseAccountType, type RuneProfileClient } from "./runeProfileService";
import { audit } from "../audit/record";

type Db = BetterSQLite3Database<typeof schema>;

export interface StoredPlayerStats {
  womStats: WomPlayerStats | null;
  accountType: AccountType | null;
}

// Parses the JSON blobs persisted above into what clients see. Account type
// prefers RuneProfile (it distinguishes group ironman variants; WOM just
// reports "ironman" for a GIM member), falling back to WOM for a player who
// syncs to WOM but isn't set up with the RuneProfile RuneLite plugin.
export function parseStoredPlayerStats(row: { womDataJson: string | null; runeProfileDataJson: string | null }): StoredPlayerStats {
  const womSummary = parseWomSummary(row.womDataJson ? JSON.parse(row.womDataJson) : null);
  const accountType = parseAccountType(row.runeProfileDataJson ? JSON.parse(row.runeProfileDataJson) : null) ?? womSummary?.accountType ?? null;
  return { womStats: womSummary ? { ehb: womSummary.ehb, ehp: womSummary.ehp } : null, accountType };
}

/** A player's active signup for this bingo with its stored stats parsed and their answers, or null. */
export function getSignupStats(db: Db, bingoId: string, userId: string): (StoredPlayerStats & { rsn: string; answers: SignupAnswer[] }) | null {
  const signup = db
    .select({ id: signups.id, rsn: signups.rsn, womDataJson: signups.womDataJson, runeProfileDataJson: signups.runeProfileDataJson })
    .from(signups)
    .where(and(eq(signups.bingoId, bingoId), eq(signups.userId, userId), eq(signups.status, "active")))
    .get();
  if (!signup) return null;
  const answers = db.select().from(signupAnswers).where(eq(signupAnswers.signupId, signup.id)).all();
  return { rsn: signup.rsn, answers, ...parseStoredPlayerStats(signup) };
}

export async function fetchAndPersistPlayerStats(
  db: Db,
  signupId: string,
  rsn: string,
  womClient: WomClient = getWomClient(),
  runeProfileClient: RuneProfileClient = getRuneProfileClient(),
): Promise<void> {
  // Test hook — skips the WOM/RuneProfile network calls entirely. Used by
  // the E2E suite (docs/e2e-testing-plan.md) so a real signup during tests
  // never hits those live APIs.
  if (process.env.PLAYER_STATS_FETCH_DISABLED === "true") return;

  const signup = db.select({ bingoId: signups.bingoId }).from(signups).where(eq(signups.id, signupId)).get();

  try {
    const [womData, runeProfileData] = await Promise.all([womClient.getPlayerByUsername(rsn), runeProfileClient.getAccountFull(rsn)]);
    db.update(signups)
      .set({
        womDataJson: womData ? JSON.stringify(womData) : null,
        runeProfileDataJson: runeProfileData ? JSON.stringify(runeProfileData) : null,
        statsFetchedAt: clockNow(),
      })
      .where(eq(signups.id, signupId))
      .run();
    audit(db, {
      action: "signup.stats_fetched",
      bingoId: signup?.bingoId ?? null,
      entity: { type: "signup", id: signupId, label: rsn },
      details: { womFound: !!womData, runeProfileFound: !!runeProfileData },
      actor: "system",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[player-stats] failed to fetch/persist for signup ${signupId} (${rsn})`, message);
    audit(db, {
      action: "signup.stats_fetch_failed",
      bingoId: signup?.bingoId ?? null,
      entity: { type: "signup", id: signupId, label: rsn },
      details: { message },
      actor: "system",
    });
  }
}
