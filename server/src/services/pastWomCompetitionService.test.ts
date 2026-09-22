import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { WomCompetitionClient } from "./womCompetitionService";
import { addPastCompetition, archiveBingoCompetition, deletePastCompetition, listPastCompetitions } from "./pastWomCompetitionService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedUser() {
  return db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().get();
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
