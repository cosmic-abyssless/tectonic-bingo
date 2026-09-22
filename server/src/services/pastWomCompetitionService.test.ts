import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { WomCompetitionClient } from "./womCompetitionService";
import { addPastCompetition, archiveBingoCompetition, deletePastCompetition, getPastParticipationsForUser, listPastCompetitions, mockPastCompetition } from "./pastWomCompetitionService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedUser() {
  const id = crypto.randomUUID();
  return db.insert(schema.users).values({ discordId: id, discordUsername: `admin-${id.slice(0, 8)}` }).returning().get();
}

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const admin = seedUser();
  return db
    .insert(schema.bingos)
    .values({ slug: "test", name: "Test Bingo", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "live", ...overrides })
    .returning()
    .get();
}

function mockFetch(responses: { status?: number; body?: unknown }[]) {
  let call = 0;
  return vi.fn(async () => {
    const { status = 200, body = null } = responses[call] ?? responses[responses.length - 1]!;
    call++;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

const competitionBody = { title: "Winter Bingo", metric: "ehp", startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2026-01-15T00:00:00.000Z", participations: [{ player: { username: "a" } }, { player: { username: "b" } }] };

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  vi.stubEnv("DISCORD_GUILD_ID", "guild-1");
});
afterEach(() => {
  sqlite.close();
  vi.unstubAllEnvs();
});

describe("addPastCompetition", () => {
  it("fetches, parses, and stores a competition", async () => {
    const admin = seedUser();
    const client = new WomCompetitionClient(mockFetch([{ body: competitionBody }]));

    const result = await addPastCompetition(db, { womId: 42, addedByUserId: admin.id }, client);

    expect(result.womId).toBe(42);
    expect(result.guildId).toBe("guild-1");
    expect(result.title).toBe("Winter Bingo");
    expect(result.metric).toBe("ehp");
    expect(result.participantCount).toBe(2);
    expect(result.bingoId).toBeNull();
    expect(result.addedByUserId).toBe(admin.id);

    const row = db.select().from(schema.womPastCompetitions).where(eq(schema.womPastCompetitions.womId, 42)).get()!;
    expect(JSON.parse(row.dataJson)).toEqual(competitionBody);
  });

  it("rejects a competition that's already been added for this guild", async () => {
    const admin = seedUser();
    const client = new WomCompetitionClient(mockFetch([{ body: competitionBody }]));
    await addPastCompetition(db, { womId: 42, addedByUserId: admin.id }, client);
    await expect(addPastCompetition(db, { womId: 42, addedByUserId: admin.id }, new WomCompetitionClient(mockFetch([{ body: competitionBody }])))).rejects.toMatchObject({ status: 409 });
  });

  it("surfaces a WOM API failure as a ServiceError instead of throwing raw", async () => {
    const admin = seedUser();
    const client = new WomCompetitionClient(mockFetch([{ status: 404, body: { message: "not found" } }]));
    await expect(addPastCompetition(db, { womId: 999, addedByUserId: admin.id }, client)).rejects.toMatchObject({ status: 502 });
  });

  it("records wom_past_competition.added as the acting admin", async () => {
    const admin = seedUser();
    await addPastCompetition(db, { womId: 42, addedByUserId: admin.id }, new WomCompetitionClient(mockFetch([{ body: competitionBody }])));
    const entry = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "wom_past_competition.added")).get()!;
    expect(entry.actorUserId).toBe(admin.id);
    expect(JSON.parse(entry.details)).toMatchObject({ womId: 42, source: "manual" });
  });
});

describe("listPastCompetitions", () => {
  it("only returns rows for the current guild", async () => {
    const admin = seedUser();
    await addPastCompetition(db, { womId: 1, addedByUserId: admin.id }, new WomCompetitionClient(mockFetch([{ body: competitionBody }])));
    vi.stubEnv("DISCORD_GUILD_ID", "other-guild");
    const results = listPastCompetitions(db);
    expect(results).toHaveLength(0);
  });
});

describe("deletePastCompetition", () => {
  it("removes the row and audits it", async () => {
    const admin = seedUser();
    const added = await addPastCompetition(db, { womId: 42, addedByUserId: admin.id }, new WomCompetitionClient(mockFetch([{ body: competitionBody }])));
    deletePastCompetition(db, added.id);
    expect(db.select().from(schema.womPastCompetitions).where(eq(schema.womPastCompetitions.id, added.id)).get()).toBeUndefined();
    const entry = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "wom_past_competition.deleted")).get()!;
    expect(JSON.parse(entry.details)).toMatchObject({ womId: 42 });
  });

  it("throws ServiceError 404 for an unknown id", () => {
    expect(() => deletePastCompetition(db, "missing")).toThrow(/not found/i);
  });
});

describe("archiveBingoCompetition", () => {
  it("archives the bingo's linked WOM competition", async () => {
    const bingo = seedBingo({ womCompetitionId: 42, stage: "complete" });
    const client = new WomCompetitionClient(mockFetch([{ body: competitionBody }]));

    await archiveBingoCompetition(db, bingo.id, client);

    const row = db.select().from(schema.womPastCompetitions).where(eq(schema.womPastCompetitions.womId, 42)).get()!;
    expect(row.bingoId).toBe(bingo.id);
    expect(row.addedByUserId).toBeNull();
    const entry = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "wom_past_competition.added")).get()!;
    expect(entry.actorType).toBe("system");
    expect(JSON.parse(entry.details)).toMatchObject({ source: "auto" });
  });

  it("does nothing when the bingo never created a WOM competition", async () => {
    const bingo = seedBingo({ stage: "complete" });
    const fetchImpl = mockFetch([{ body: competitionBody }]);
    await archiveBingoCompetition(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("does not archive a second time once already stored", async () => {
    const bingo = seedBingo({ womCompetitionId: 42, stage: "complete" });
    await archiveBingoCompetition(db, bingo.id, new WomCompetitionClient(mockFetch([{ body: competitionBody }])));
    const fetchImpl = mockFetch([{ body: competitionBody }]);
    await archiveBingoCompetition(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("never throws on a WOM failure", async () => {
    const bingo = seedBingo({ womCompetitionId: 42, stage: "complete" });
    const client = new WomCompetitionClient(mockFetch([{ status: 500 }]));
    await expect(archiveBingoCompetition(db, bingo.id, client)).resolves.toBeUndefined();
    expect(db.select().from(schema.womPastCompetitions).all()).toHaveLength(0);
  });
});

describe("getPastParticipationsForUser", () => {
  const competitionWithGains = {
    title: "Winter Bingo",
    metric: "ehp",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-01-15T00:00:00.000Z",
    participations: [
      { player: { username: "cosmic_abyss" }, progress: { gained: 12.5 } },
      { player: { username: "someone_else" }, progress: { gained: 4 } },
    ],
  };

  function seedPlayerWithRsn(rsn: string) {
    const player = db.insert(schema.users).values({ discordId: `p-${rsn}`, discordUsername: rsn }).returning().get();
    const bingo = seedBingo({ slug: `bingo-${rsn}` });
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: player.id, rsn }).run();
    return player;
  }

  it("matches a stored competition by normalized RSN", async () => {
    const player = seedPlayerWithRsn("Cosmic Abyss");
    const admin = seedUser();
    await addPastCompetition(db, { womId: 42, addedByUserId: admin.id }, new WomCompetitionClient(mockFetch([{ body: competitionWithGains }])));

    const results = getPastParticipationsForUser(db, player.id);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ womId: 42, title: "Winter Bingo", metric: "ehp", gained: 12.5 });
  });

  it("returns nothing for a user with no signups", () => {
    const player = db.insert(schema.users).values({ discordId: "no-signups", discordUsername: "NoSignups" }).returning().get();
    expect(getPastParticipationsForUser(db, player.id)).toEqual([]);
  });

  it("returns nothing when the RSN doesn't appear in any stored competition", async () => {
    const player = seedPlayerWithRsn("Nobody Here");
    const admin = seedUser();
    await addPastCompetition(db, { womId: 42, addedByUserId: admin.id }, new WomCompetitionClient(mockFetch([{ body: competitionWithGains }])));
    expect(getPastParticipationsForUser(db, player.id)).toEqual([]);
  });

  it("only matches competitions for the current guild", async () => {
    const player = seedPlayerWithRsn("Cosmic Abyss");
    const admin = seedUser();
    await addPastCompetition(db, { womId: 42, addedByUserId: admin.id }, new WomCompetitionClient(mockFetch([{ body: competitionWithGains }])));
    vi.stubEnv("DISCORD_GUILD_ID", "other-guild");
    expect(getPastParticipationsForUser(db, player.id)).toEqual([]);
  });
});

describe("mockPastCompetition", () => {
  it("fabricates one participation per signup RSN, no fetch involved", () => {
    const bingo = seedBingo();
    const alice = db.insert(schema.users).values({ discordId: "alice", discordUsername: "alice" }).returning().get();
    const bob = db.insert(schema.users).values({ discordId: "bob", discordUsername: "bob" }).returning().get();
    db.insert(schema.signups).values([
      { bingoId: bingo.id, userId: alice.id, rsn: "Alice Rsn" },
      { bingoId: bingo.id, userId: bob.id, rsn: "Bob Rsn" },
    ]).run();

    const result = mockPastCompetition(db, bingo.id);

    expect(result.bingoId).toBe(bingo.id);
    expect(result.womId).toBeLessThan(0);
    expect(result.participantCount).toBe(2);
    expect(result.addedByUserId).toBeNull();

    // getPastParticipationsForUser is the real consumer — prove the fabricated row actually matches through it.
    expect(getPastParticipationsForUser(db, alice.id)).toMatchObject([{ womId: result.womId }]);
    expect(getPastParticipationsForUser(db, bob.id)).toMatchObject([{ womId: result.womId }]);
  });

  it("honors title/metric/gained overrides", () => {
    const bingo = seedBingo();
    const alice = db.insert(schema.users).values({ discordId: "alice2", discordUsername: "alice2" }).returning().get();
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: alice.id, rsn: "Alice2" }).run();

    const result = mockPastCompetition(db, bingo.id, { title: "Custom Cup", metric: "ehb", gainedMin: 100, gainedMax: 100 });

    expect(result.title).toBe("Custom Cup");
    expect(result.metric).toBe("ehb");
    const participations = getPastParticipationsForUser(db, alice.id);
    expect(participations[0]).toMatchObject({ metric: "ehb", gained: 100 });
  });

  it("throws ServiceError 400 when the bingo has no signups", () => {
    const bingo = seedBingo();
    expect(() => mockPastCompetition(db, bingo.id)).toThrow(/no signups/i);
  });

  it("throws ServiceError 404 for an unknown bingo", () => {
    expect(() => mockPastCompetition(db, "missing")).toThrow(/not found/i);
  });

  it("never collides with an existing womId in the same guild", () => {
    const bingo = seedBingo();
    const alice = db.insert(schema.users).values({ discordId: "alice3", discordUsername: "alice3" }).returning().get();
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: alice.id, rsn: "Alice3" }).run();
    db.insert(schema.womPastCompetitions).values({ guildId: "guild-1", womId: -1, title: "Taken", metric: "ehp", startsAt: new Date(), endsAt: new Date(), dataJson: "{}" }).run();

    const result = mockPastCompetition(db, bingo.id);

    expect(result.womId).not.toBe(-1);
  });
});
