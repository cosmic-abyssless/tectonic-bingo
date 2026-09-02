import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { WomClient } from "./womService";
import { RuneProfileClient } from "./runeProfileService";
import { fetchAndPersistPlayerStats } from "./playerStatsService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedSignup() {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const bingo = db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "signup" }).returning().get();
  const [member] = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().all();
  const signup = db.insert(schema.signups).values({ bingoId: bingo.id, userId: member.id, rsn: "C osmic" }).returning().get();
  return signup;
}

function fakeWomClient(response: unknown): WomClient {
  const fetchImpl = (async () => new Response(JSON.stringify(response), { status: response === null ? 404 : 200 })) as unknown as typeof fetch;
  return new WomClient(fetchImpl);
}

function fakeRuneProfileClient(response: unknown): RuneProfileClient {
  const fetchImpl = (async () => new Response(JSON.stringify(response), { status: response === null ? 404 : 200 })) as unknown as typeof fetch;
  return new RuneProfileClient(fetchImpl, null);
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
  vi.unstubAllEnvs();
});

describe("fetchAndPersistPlayerStats", () => {
  it("persists both raw responses and a fetched-at timestamp", async () => {
    const signup = seedSignup();
    const womBody = { ehb: 42, type: "ironman" };
    const rpBody = { username: "C osmic", accountType: { key: "ironman" } };

    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", fakeWomClient(womBody), fakeRuneProfileClient(rpBody));

    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(JSON.parse(updated.womDataJson!)).toEqual(womBody);
    expect(JSON.parse(updated.runeProfileDataJson!)).toEqual(rpBody);
    expect(updated.statsFetchedAt).not.toBeNull();
  });

  it("persists whichever source succeeded when the other returns nothing", async () => {
    const signup = seedSignup();
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", fakeWomClient({ ehb: 1, type: "regular" }), fakeRuneProfileClient(null));

    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(updated.womDataJson).not.toBeNull();
    expect(updated.runeProfileDataJson).toBeNull();
  });

  it("never throws, even if both sources fail", async () => {
    const signup = seedSignup();
    const throwingClient = { getPlayerByUsername: async () => { throw new Error("boom"); } } as unknown as WomClient;
    const throwingRpClient = { getAccountFull: async () => { throw new Error("boom"); } } as unknown as RuneProfileClient;

    await expect(fetchAndPersistPlayerStats(db, signup.id, "C osmic", throwingClient, throwingRpClient)).resolves.toBeUndefined();
  });

  it("skips the fetch entirely when PLAYER_STATS_FETCH_DISABLED=true (E2E test hook)", async () => {
    vi.stubEnv("PLAYER_STATS_FETCH_DISABLED", "true");
    const signup = seedSignup();
    const client = fakeWomClient({ ehb: 1, type: "regular" });
    const rpClient = fakeRuneProfileClient({ accountType: { key: "normal" } });
    const clientSpy = vi.spyOn(client, "getPlayerByUsername");
    const rpClientSpy = vi.spyOn(rpClient, "getAccountFull");

    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", client, rpClient);

    expect(clientSpy).not.toHaveBeenCalled();
    expect(rpClientSpy).not.toHaveBeenCalled();
    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(updated.womDataJson).toBeNull();
    expect(updated.runeProfileDataJson).toBeNull();
    expect(updated.statsFetchedAt).toBeNull();
  });
});
