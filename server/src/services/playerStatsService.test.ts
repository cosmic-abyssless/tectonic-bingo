import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { WomClient } from "./womService";
import { RuneProfileClient } from "./runeProfileService";
import { fetchAndPersistPlayerStats, getSignupStats } from "./playerStatsService";
import { parseStoredCaStats } from "./combatAchievements";

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

function fakeRuneProfileByRsn(byRsn: Record<string, unknown | null>): RuneProfileClient {
  return {
    getAccountFull: async (rsn: string) => {
      const key = Object.keys(byRsn).find((k) => k.toLowerCase() === rsn.toLowerCase());
      return key !== undefined ? byRsn[key]! : null;
    },
  } as unknown as RuneProfileClient;
}

const EASY_RP = {
  accountType: { key: "ironman" },
  combatAchievements: [{ name: "Easy", completed: 41, total: 50 }],
};
const GM_RP = {
  accountType: { key: "normal" },
  combatAchievements: [
    { name: "Easy", completed: 50, total: 50 },
    { name: "Medium", completed: 80, total: 80 },
    { name: "Hard", completed: 90, total: 90 },
    { name: "Elite", completed: 150, total: 150 },
    { name: "Master", completed: 180, total: 180 },
    { name: "Grandmaster", completed: 130, total: 130 },
  ],
};

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
  vi.unstubAllEnvs();
});

describe("fetchAndPersistPlayerStats", () => {
  it("persists both raw responses, derived CA, and a fetched-at timestamp", async () => {
    const signup = seedSignup();
    const womBody = { ehb: 42, type: "ironman" };

    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", {
      womClient: fakeWomClient(womBody),
      runeProfileClient: fakeRuneProfileClient(EASY_RP),
      tectonicClient: null,
    });

    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(JSON.parse(updated.womDataJson!)).toEqual(womBody);
    expect(JSON.parse(updated.runeProfileDataJson!)).toEqual(EASY_RP);
    expect(parseStoredCaStats(updated.caCurrentJson)).toEqual({ tier: "easy", points: 41 });
    expect(parseStoredCaStats(updated.caPeakJson)).toEqual({ tier: "easy", points: 41 });
    expect(updated.statsFetchedAt).not.toBeNull();
  });

  it("persists whichever source succeeded when the other returns nothing", async () => {
    const signup = seedSignup();
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", {
      womClient: fakeWomClient({ ehb: 1, type: "regular" }),
      runeProfileClient: fakeRuneProfileClient(null),
      tectonicClient: null,
    });

    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(updated.womDataJson).not.toBeNull();
    expect(updated.runeProfileDataJson).toBeNull();
    expect(updated.caCurrentJson).toBeNull();
    expect(updated.caPeakJson).toBeNull();
  });

  it("never throws, even if both sources fail", async () => {
    const signup = seedSignup();
    const throwingClient = { getPlayerByUsername: async () => { throw new Error("boom"); } } as unknown as WomClient;
    const throwingRpClient = { getAccountFull: async () => { throw new Error("boom"); } } as unknown as RuneProfileClient;

    await expect(
      fetchAndPersistPlayerStats(db, signup.id, "C osmic", { womClient: throwingClient, runeProfileClient: throwingRpClient, tectonicClient: null }),
    ).resolves.toBeUndefined();
  });

  it("does not clobber a previous snapshot when the fetch throws", async () => {
    const signup = seedSignup();
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", {
      womClient: fakeWomClient({ ehb: 9, type: "regular" }),
      runeProfileClient: fakeRuneProfileClient(EASY_RP),
      tectonicClient: null,
    });
    const before = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;

    const throwingClient = { getPlayerByUsername: async () => { throw new Error("boom"); } } as unknown as WomClient;
    const throwingRpClient = { getAccountFull: async () => { throw new Error("boom"); } } as unknown as RuneProfileClient;
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", { womClient: throwingClient, runeProfileClient: throwingRpClient, tectonicClient: null });

    const after = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(after.womDataJson).toBe(before.womDataJson);
    expect(after.runeProfileDataJson).toBe(before.runeProfileDataJson);
    expect(after.caCurrentJson).toBe(before.caCurrentJson);
    expect(after.caPeakJson).toBe(before.caPeakJson);
    expect(after.statsFetchedAt?.getTime()).toBe(before.statsFetchedAt?.getTime());
  });

  it("stamps fetched-at even when every source returns nothing", async () => {
    const signup = seedSignup();
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", {
      womClient: fakeWomClient(null),
      runeProfileClient: fakeRuneProfileClient(null),
      tectonicClient: null,
    });

    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(updated.womDataJson).toBeNull();
    expect(updated.runeProfileDataJson).toBeNull();
    expect(updated.caCurrentJson).toBeNull();
    expect(updated.caPeakJson).toBeNull();
    expect(updated.statsFetchedAt).not.toBeNull();
  });

  it("takes Peak CA from other currently linked RSNs without naming them", async () => {
    const signup = seedSignup();
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", {
      womClient: fakeWomClient({ ehb: 1, type: "regular" }),
      runeProfileClient: fakeRuneProfileByRsn({ "C osmic": EASY_RP, AltOne: GM_RP }),
      linkedRsns: ["C osmic", "AltOne"],
    });

    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(parseStoredCaStats(updated.caCurrentJson)).toEqual({ tier: "easy", points: 41 });
    expect(parseStoredCaStats(updated.caPeakJson)).toEqual({ tier: "grandmaster", points: 2760 });
    expect(updated.runeProfileDataJson).not.toContain("AltOne");
  });

  it("keeps Current Unknown when the signed-up RSN has no RuneProfile, while Peak can still come from an alt", async () => {
    const signup = seedSignup();
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", {
      womClient: fakeWomClient({ ehb: 1, type: "regular" }),
      runeProfileClient: fakeRuneProfileByRsn({ "C osmic": null, AltOne: GM_RP }),
      linkedRsns: ["C osmic", "AltOne"],
    });

    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(updated.caCurrentJson).toBeNull();
    expect(parseStoredCaStats(updated.caPeakJson)).toEqual({ tier: "grandmaster", points: 2760 });
  });

  it("sets Peak equal to Current when Tectonic is off", async () => {
    const signup = seedSignup();
    const rp = fakeRuneProfileByRsn({ "C osmic": EASY_RP, AltOne: GM_RP });
    const spy = vi.spyOn(rp, "getAccountFull");
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", {
      womClient: fakeWomClient({ ehb: 1, type: "regular" }),
      runeProfileClient: rp,
      tectonicClient: null,
    });

    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(parseStoredCaStats(updated.caCurrentJson)).toEqual({ tier: "easy", points: 41 });
    expect(parseStoredCaStats(updated.caPeakJson)).toEqual({ tier: "easy", points: 41 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("skips the fetch entirely when PLAYER_STATS_FETCH_DISABLED=true (E2E test hook)", async () => {
    vi.stubEnv("PLAYER_STATS_FETCH_DISABLED", "true");
    const signup = seedSignup();
    const client = fakeWomClient({ ehb: 1, type: "regular" });
    const rpClient = fakeRuneProfileClient({ accountType: { key: "normal" } });
    const clientSpy = vi.spyOn(client, "getPlayerByUsername");
    const rpClientSpy = vi.spyOn(rpClient, "getAccountFull");

    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", { womClient: client, runeProfileClient: rpClient, tectonicClient: null });

    expect(clientSpy).not.toHaveBeenCalled();
    expect(rpClientSpy).not.toHaveBeenCalled();
    const updated = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
    expect(updated.womDataJson).toBeNull();
    expect(updated.runeProfileDataJson).toBeNull();
    expect(updated.statsFetchedAt).toBeNull();
  });
});

describe("audit trail", () => {
  it("records signup.stats_fetched as a system actor on success", async () => {
    const signup = seedSignup();
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", {
      womClient: fakeWomClient({ ehb: 1, type: "regular" }),
      runeProfileClient: fakeRuneProfileClient(null),
      tectonicClient: null,
    });

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.stats_fetched")).get()!;
    expect(row.actorType).toBe("system");
    expect(row.bingoId).toBe(signup.bingoId);
    expect(JSON.parse(row.details)).toEqual({ womFound: true, runeProfileFound: false });
  });

  it("records signup.stats_fetch_failed when both sources throw", async () => {
    const signup = seedSignup();
    const throwingClient = { getPlayerByUsername: async () => { throw new Error("boom"); } } as unknown as WomClient;
    const throwingRpClient = { getAccountFull: async () => { throw new Error("boom"); } } as unknown as RuneProfileClient;

    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", { womClient: throwingClient, runeProfileClient: throwingRpClient, tectonicClient: null });

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.stats_fetch_failed")).get()!;
    expect(row.actorType).toBe("system");
    expect(JSON.parse(row.details)).toEqual({ message: "boom" });
  });
});

describe("getSignupStats", () => {
  it("parses the stored blobs, preferring RuneProfile's account type", async () => {
    const signup = seedSignup();
    await fetchAndPersistPlayerStats(db, signup.id, "C osmic", {
      womClient: fakeWomClient({ ehb: 42.4, type: "ironman" }),
      runeProfileClient: fakeRuneProfileClient({ accountType: { key: "group_ironman" }, combatAchievements: EASY_RP.combatAchievements }),
      tectonicClient: null,
    });

    const stats = getSignupStats(db, signup.bingoId, signup.userId)!;
    expect(stats.rsn).toBe("C osmic");
    expect(stats.womStats).toEqual({ ehb: 42.4, ehp: 0 });
    expect(stats.accountType).toBe("group_ironman");
    expect(stats.caCurrent).toEqual({ tier: "easy", points: 41 });
    expect(stats.caPeak).toEqual({ tier: "easy", points: 41 });
    expect(stats.answers).toEqual([]);
  });

  it("returns null for withdrawn signups and players who never signed up", () => {
    const signup = seedSignup();
    expect(getSignupStats(db, signup.bingoId, "nobody")).toBeNull();
    db.update(schema.signups).set({ status: "withdrawn" }).where(eq(schema.signups.id, signup.id)).run();
    expect(getSignupStats(db, signup.bingoId, signup.userId)).toBeNull();
  });
});
