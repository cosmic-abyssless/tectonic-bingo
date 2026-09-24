// Fetches WOM + RuneProfile data for a signup's RSN (and RuneProfile for
// other currently Tectonic-linked RSNs, for Peak CA) and persists the raw
// signed-up-RSN blobs plus derived CA snapshots. Draft/roster reads parse
// stored JSON only — no live external calls in those hot paths.
//
// Called fire-and-forget from the signup routes and the mod Refresh-stats
// route (never awaited in the response path). generate-bingo's synthetic
// signups fabricate stats locally instead (see fakePlayerStats.ts) and never
// call this. Never throws.
import { now as clockNow } from "../clock";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import type { AccountType, CombatAchievementStats, SignupAnswer, WomPlayerStats } from "@bingo/shared";
import * as schema from "../db/schema";
import { signupAnswers, signups, users } from "../db/schema";
import { getWomClient, parseWomSummary, type WomClient } from "./womService";
import { getRuneProfileClient, parseAccountType, type RuneProfileClient } from "./runeProfileService";
import { getTectonicClient, TectonicUnavailableError, type TectonicClient } from "./tectonicService";
import { deriveCombatAchievements, parseStoredCaStats, peakCombatAchievements } from "./combatAchievements";
import { audit } from "../audit/record";
import { skipsIntegrations } from "../audit/context";
import { broadcast } from "../ws";
import { log } from "../log";

type Db = BetterSQLite3Database<typeof schema>;

export interface StoredPlayerStats {
  womStats: WomPlayerStats | null;
  accountType: AccountType | null;
  caCurrent: CombatAchievementStats | null;
  caPeak: CombatAchievementStats | null;
  statsFetchedAt: Date | null;
}

export interface FetchPlayerStatsOpts {
  discordId?: string | null;
  linkedRsns?: string[] | null;
  womClient?: WomClient;
  runeProfileClient?: RuneProfileClient;
  tectonicClient?: TectonicClient | null;
}

function uniqueRsns(primary: string, extras: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rsn of [primary, ...extras]) {
    const key = rsn.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(rsn.trim());
  }
  return out;
}

async function linkedRsnsForUser(
  discordId: string | null | undefined,
  preloaded: string[] | null | undefined,
  tectonicClient: TectonicClient | null | undefined,
): Promise<string[] | null> {
  if (preloaded) return preloaded;
  if (!discordId) return null;
  const client = tectonicClient === undefined ? getTectonicClient() : tectonicClient;
  if (!client) return null;
  try {
    const member = await client.getDetailedUser(discordId);
    return (member?.rsns ?? []).map((r) => r.rsn);
  } catch (err) {
    if (err instanceof TectonicUnavailableError) return null;
    throw err;
  }
}

// Parses persisted blobs + derived CA columns into what clients see.
// Account type prefers RuneProfile (it distinguishes group ironman variants;
// WOM just reports "ironman" for a GIM member), falling back to WOM.
export function parseStoredPlayerStats(row: {
  womDataJson: string | null;
  runeProfileDataJson: string | null;
  caCurrentJson?: string | null;
  caPeakJson?: string | null;
  statsFetchedAt?: Date | null;
}): StoredPlayerStats {
  const womSummary = parseWomSummary(row.womDataJson ? JSON.parse(row.womDataJson) : null);
  const accountType = parseAccountType(row.runeProfileDataJson ? JSON.parse(row.runeProfileDataJson) : null) ?? womSummary?.accountType ?? null;
  return {
    womStats: womSummary ? { ehb: womSummary.ehb, ehp: womSummary.ehp } : null,
    accountType,
    caCurrent: parseStoredCaStats(row.caCurrentJson),
    caPeak: parseStoredCaStats(row.caPeakJson),
    statsFetchedAt: row.statsFetchedAt ?? null,
  };
}

/**
 * Every active signup's account type in this bingo, by user id (RuneProfile's, else WOM's, as in parseStoredPlayerStats);
 * players with none known are left out. Drives the account badge the client shows beside a player's name.
 */
export function getAccountTypes(db: Db, bingoId: string): Record<string, AccountType> {
  const rows = db
    .select({ userId: signups.userId, womDataJson: signups.womDataJson, runeProfileDataJson: signups.runeProfileDataJson })
    .from(signups)
    .where(and(eq(signups.bingoId, bingoId), eq(signups.status, "active")))
    .all();
  const types: Record<string, AccountType> = {};
  for (const row of rows) {
    const { accountType } = parseStoredPlayerStats(row);
    if (accountType) types[row.userId] = accountType;
  }
  return types;
}

/** A player's active signup for this bingo with its stored stats parsed and their answers, or null. */
export function getSignupStats(db: Db, bingoId: string, userId: string): (StoredPlayerStats & { rsn: string; answers: SignupAnswer[] }) | null {
  const signup = db
    .select({
      id: signups.id,
      rsn: signups.rsn,
      womDataJson: signups.womDataJson,
      runeProfileDataJson: signups.runeProfileDataJson,
      caCurrentJson: signups.caCurrentJson,
      caPeakJson: signups.caPeakJson,
      statsFetchedAt: signups.statsFetchedAt,
    })
    .from(signups)
    .where(and(eq(signups.bingoId, bingoId), eq(signups.userId, userId), eq(signups.status, "active")))
    .get();
  if (!signup) return null;
  const answers = db.select().from(signupAnswers).where(eq(signupAnswers.signupId, signup.id)).all();
  return { rsn: signup.rsn, answers, ...parseStoredPlayerStats(signup) };
}

export async function fetchAndPersistPlayerStats(db: Db, signupId: string, rsn: string, opts: FetchPlayerStatsOpts = {}): Promise<void> {
  const signup = db.select({ bingoId: signups.bingoId, userId: signups.userId }).from(signups).where(eq(signups.id, signupId)).get();
  // Test hook — skips WOM/RuneProfile/Tectonic network calls entirely. Used
  // by the E2E suite so a real signup during tests never hits those live APIs,
  // and per request by the test data generator (skipsIntegrations).
  // Drop any in-flight spinner the refresh button already raised.
  if (process.env.PLAYER_STATS_FETCH_DISABLED === "true" || skipsIntegrations()) {
    if (signup?.bingoId) {
      broadcast({ type: "signup_changed", bingoId: signup.bingoId, payload: { signupId, userId: signup.userId, statsRefreshing: false } });
    }
    return;
  }

  if (signup?.bingoId) {
    broadcast({ type: "signup_changed", bingoId: signup.bingoId, payload: { signupId, userId: signup.userId, statsRefreshing: true } });
  }
  const discordId =
    opts.discordId !== undefined
      ? opts.discordId
      : signup
        ? (db.select({ discordId: users.discordId }).from(users).where(eq(users.id, signup.userId)).get()?.discordId ?? null)
        : null;

  const womClient = opts.womClient ?? getWomClient();
  const runeProfileClient = opts.runeProfileClient ?? getRuneProfileClient();

  try {
    const [womData, runeProfileData, linked] = await Promise.all([
      womClient.getPlayerByUsername(rsn),
      runeProfileClient.getAccountFull(rsn),
      linkedRsnsForUser(discordId, opts.linkedRsns, opts.tectonicClient),
    ]);

    const caCurrent = deriveCombatAchievements(runeProfileData);
    const altStats: Array<CombatAchievementStats | null> = [];
    if (linked) {
      for (const other of uniqueRsns(rsn, linked)) {
        if (other.toLowerCase() === rsn.trim().toLowerCase()) continue;
        altStats.push(deriveCombatAchievements(await runeProfileClient.getAccountFull(other)));
      }
    }
    const caPeak = linked ? peakCombatAchievements([caCurrent, ...altStats]) : caCurrent;

    db.update(signups)
      .set({
        womDataJson: womData ? JSON.stringify(womData) : null,
        runeProfileDataJson: runeProfileData ? JSON.stringify(runeProfileData) : null,
        caCurrentJson: caCurrent ? JSON.stringify(caCurrent) : null,
        caPeakJson: caPeak ? JSON.stringify(caPeak) : null,
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
    if (signup?.bingoId) {
      broadcast({ type: "signup_changed", bingoId: signup.bingoId, payload: { signupId, userId: signup.userId, statsRefreshing: false } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("player stats fetch failed", { signupId, rsn, err: message });
    audit(db, {
      action: "signup.stats_fetch_failed",
      bingoId: signup?.bingoId ?? null,
      entity: { type: "signup", id: signupId, label: rsn },
      details: { message },
      actor: "system",
    });
    if (signup?.bingoId) {
      broadcast({ type: "signup_changed", bingoId: signup.bingoId, payload: { signupId, userId: signup.userId, statsRefreshing: false } });
    }
  }
}
