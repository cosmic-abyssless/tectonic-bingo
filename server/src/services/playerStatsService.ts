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
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { signups } from "../db/schema";
import { getWomClient, type WomClient } from "./womService";
import { getRuneProfileClient, type RuneProfileClient } from "./runeProfileService";

type Db = BetterSQLite3Database<typeof schema>;

export async function fetchAndPersistPlayerStats(
  db: Db,
  signupId: string,
  rsn: string,
  womClient: WomClient = getWomClient(),
  runeProfileClient: RuneProfileClient = getRuneProfileClient(),
): Promise<void> {
  try {
    const [womData, runeProfileData] = await Promise.all([womClient.getPlayerByUsername(rsn), runeProfileClient.getAccountFull(rsn)]);
    db.update(signups)
      .set({
        womDataJson: womData ? JSON.stringify(womData) : null,
        runeProfileDataJson: runeProfileData ? JSON.stringify(runeProfileData) : null,
        statsFetchedAt: new Date(),
      })
      .where(eq(signups.id, signupId))
      .run();
  } catch (err) {
    console.warn(`[player-stats] failed to fetch/persist for signup ${signupId} (${rsn})`, err instanceof Error ? err.message : err);
  }
}
