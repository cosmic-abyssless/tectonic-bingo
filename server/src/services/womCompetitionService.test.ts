import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { WomCompetitionClient, WomCompetitionError, syncWomCompetitionAfterDraft, syncWomTeamRename } from "./womCompetitionService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingoWithTeam(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const bingo = db
    .insert(schema.bingos)
    .values({
      slug: "test",
      name: "Test Bingo",
      boardRows: 3,
      boardCols: 3,
      createdByUserId: admin.id,
      stage: "reveal",
      womEnabled: true,
      womGroupId: "123",
      womGroupVerificationCode: "secret-code",
      ...overrides,
    })
    .returning()
    .get();

  const [captain] = db.insert(schema.users).values({ discordId: "captain", discordUsername: "captain" }).returning().all();
  db.insert(schema.signups).values({ bingoId: bingo.id, userId: captain.id, rsn: "CaptainRsn" }).run();
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team One", codeword: "azure-wolf" }).returning().get();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: captain.id, isCaptain: true }).run();

  return { bingo, team, captain };
}

function mockFetch(responses: { status?: number; body?: unknown }[]) {
  let call = 0;
  return vi.fn(async () => {
    const { status = 200, body = null } = responses[call] ?? responses[responses.length - 1]!;
    call++;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
  vi.unstubAllEnvs();
});

describe("WomCompetitionClient", () => {
  it("creates a competition and returns its id", async () => {
    const fetchImpl = mockFetch([{ body: { competition: { id: 555 } } }]);
    const client = new WomCompetitionClient(fetchImpl);

    const result = await client.createCompetition({
      title: "Test",
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-01-15"),
      groupId: "123",
      groupVerificationCode: "secret",
      teams: [{ name: "Team One", participants: ["Rsn"] }],
    });

    expect(result).toEqual({ id: 555 });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("https://api.wiseoldman.net/v2/competitions");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body);
    expect(body.groupId).toBe(123);
    expect(body.groupVerificationCode).toBe("secret");
    expect(body.teams).toEqual([{ name: "Team One", participants: ["Rsn"] }]);
    expect((call[1].headers as Record<string, string>)["x-api-key"]).toBeUndefined();
  });

  it("sends the x-api-key header when an api key is configured", async () => {
    const fetchImpl = mockFetch([{ body: { competition: { id: 1 } } }]);
    const client = new WomCompetitionClient(fetchImpl, "wom-secret");
    await client.createCompetition({
      title: "Test",
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-01-15"),
      groupId: "123",
      groupVerificationCode: "secret",
      teams: [],
    });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((call[1].headers as Record<string, string>)["x-api-key"]).toBe("wom-secret");
  });

  it("throws WomCompetitionError when WOM doesn't return a competition id", async () => {
    const fetchImpl = mockFetch([{ body: {} }]);
    const client = new WomCompetitionClient(fetchImpl);
    await expect(
      client.createCompetition({ title: "Test", startsAt: new Date(), endsAt: new Date(), groupId: "1", groupVerificationCode: "x", teams: [] }),
    ).rejects.toBeInstanceOf(WomCompetitionError);
  });

  it("throws WomCompetitionError on a non-2xx response", async () => {
    const fetchImpl = mockFetch([{ status: 403, body: { message: "invalid verification code" } }]);
    const client = new WomCompetitionClient(fetchImpl);
    await expect(client.editCompetition({ competitionId: 1, groupVerificationCode: "wrong", teams: [] })).rejects.toBeInstanceOf(WomCompetitionError);
  });

  it("drops an HTML error body (e.g. a Cloudflare error page) instead of surfacing it", async () => {
    const html = "<!DOCTYPE html><html><body>524: A timeout occurred</body></html>";
    const fetchImpl = vi.fn(async () => new Response(html, { status: 524 })) as unknown as typeof fetch;
    const client = new WomCompetitionClient(fetchImpl);
    await expect(client.getCompetition(1)).rejects.toMatchObject({ message: "GET /competitions/1: HTTP 524" });
  });

  it("truncates an overly long (but non-HTML) error body", async () => {
    const long = "x".repeat(500);
    const fetchImpl = vi.fn(async () => new Response(long, { status: 500 })) as unknown as typeof fetch;
    const client = new WomCompetitionClient(fetchImpl);
    const err = (await client.getCompetition(1).catch((e: unknown) => e)) as WomCompetitionError;
    expect(err.message.length).toBeLessThan(400);
    expect(err.message).toMatch(/…$/);
  });

  it("throws WomCompetitionError on a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new WomCompetitionClient(fetchImpl);
    await expect(client.editCompetition({ competitionId: 1, groupVerificationCode: "x", teams: [] })).rejects.toBeInstanceOf(WomCompetitionError);
  });

  it("PUTs to the competition-specific edit endpoint", async () => {
    const fetchImpl = mockFetch([{ body: {} }]);
    const client = new WomCompetitionClient(fetchImpl);
    await client.editCompetition({ competitionId: 42, groupVerificationCode: "secret", teams: [{ name: "A", participants: ["x"] }] });

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("https://api.wiseoldman.net/v2/competitions/42");
    expect(call[1].method).toBe("PUT");
    const body = JSON.parse(call[1].body);
    // The edit endpoint's field is `verificationCode` (accepts either the
    // competition's own code or its host group's), not `groupVerificationCode`
    // — that's only a create-competition field. Sending the wrong name here
    // previously made every team-rename sync fail WOM's own validation.
    expect(body.verificationCode).toBe("secret");
    expect(body.groupVerificationCode).toBeUndefined();
    expect(body.teams).toEqual([{ name: "A", participants: ["x"] }]);
  });
});

describe("syncWomCompetitionAfterDraft", () => {
  it("never makes a competition for a test data bingo, however WOM is configured", async () => {
    const { bingo } = seedBingoWithTeam({ slug: "testdata-20260923-0900" });
    const fetchImpl = mockFetch([{ body: { competition: { id: 999 } } }]);
    await syncWomCompetitionAfterDraft(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!.womCompetitionId).toBeNull();
  });

  it("creates a competition and persists its id", async () => {
    const { bingo } = seedBingoWithTeam();
    const client = new WomCompetitionClient(mockFetch([{ body: { competition: { id: 999 } } }]));

    await syncWomCompetitionAfterDraft(db, bingo.id, client);

    const updated = db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!;
    expect(updated.womCompetitionId).toBe(999);
    expect(updated.womSyncError).toBeNull();
  });

  it("does nothing when the integration is disabled", async () => {
    const { bingo } = seedBingoWithTeam({ womEnabled: false });
    const fetchImpl = mockFetch([{ body: { competition: { id: 1 } } }]);
    await syncWomCompetitionAfterDraft(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("does nothing when the credentials are incomplete", async () => {
    const { bingo } = seedBingoWithTeam({ womGroupVerificationCode: null });
    const fetchImpl = mockFetch([{ body: { competition: { id: 1 } } }]);
    await syncWomCompetitionAfterDraft(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("does not create a second competition once one already exists", async () => {
    const { bingo } = seedBingoWithTeam({ womCompetitionId: 111 });
    const fetchImpl = mockFetch([{ body: { competition: { id: 999 } } }]);
    await syncWomCompetitionAfterDraft(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("skips teams with no signed-up members and no-ops if that leaves nothing to sync", async () => {
    const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
    const bingo = db
      .insert(schema.bingos)
      .values({ slug: "empty", name: "Empty", boardRows: 3, boardCols: 3, createdByUserId: admin.id, womEnabled: true, womGroupId: "1", womGroupVerificationCode: "x" })
      .returning()
      .get();
    const fetchImpl = mockFetch([{ body: { competition: { id: 1 } } }]);
    await syncWomCompetitionAfterDraft(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("never throws, and persists the failure reason on the bingo row", async () => {
    const { bingo } = seedBingoWithTeam();
    const fetchImpl = mockFetch([{ status: 401, body: { message: "bad verification code" } }]);

    await expect(syncWomCompetitionAfterDraft(db, bingo.id, new WomCompetitionClient(fetchImpl))).resolves.toBeUndefined();

    const updated = db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!;
    expect(updated.womCompetitionId).toBeNull();
    expect(updated.womSyncError).toContain("bad verification code");
  });

  it("skips the WOM call entirely when WOM_COMPETITION_SYNC_DISABLED=true (E2E test hook)", async () => {
    vi.stubEnv("WOM_COMPETITION_SYNC_DISABLED", "true");
    const { bingo } = seedBingoWithTeam();
    const fetchImpl = mockFetch([{ body: { competition: { id: 1 } } }]);
    await syncWomCompetitionAfterDraft(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

describe("audit trail", () => {
  it("syncWomCompetitionAfterDraft records wom.competition_created as system on success", async () => {
    const { bingo } = seedBingoWithTeam();
    await syncWomCompetitionAfterDraft(db, bingo.id, new WomCompetitionClient(mockFetch([{ body: { competition: { id: 999 } } }])));
    const created = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "wom.competition_created")).get()!;
    expect(created.actorType).toBe("system");
    expect(JSON.parse(created.details)).toEqual({ competitionId: 999 });
  });

  it("syncWomCompetitionAfterDraft records wom.sync_failed on error", async () => {
    const { bingo } = seedBingoWithTeam();
    await syncWomCompetitionAfterDraft(db, bingo.id, new WomCompetitionClient(mockFetch([{ status: 401, body: { message: "bad code" } }])));
    const failed = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "wom.sync_failed")).get()!;
    expect(JSON.parse(failed.details)).toMatchObject({ operation: "create" });
  });

  it("syncWomTeamRename records wom.roster_synced", async () => {
    const { bingo } = seedBingoWithTeam({ womCompetitionId: 42 });
    await syncWomTeamRename(db, bingo.id, new WomCompetitionClient(mockFetch([{ body: {} }])));
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "wom.roster_synced")).get()!;
    expect(row.actorType).toBe("system");
  });
});

describe("syncWomTeamRename", () => {
  it("edits the existing competition with the current roster", async () => {
    const { bingo, team } = seedBingoWithTeam({ womCompetitionId: 42 });
    db.update(schema.teams).set({ name: "Renamed Team" }).where(eq(schema.teams.id, team.id)).run();
    const fetchImpl = mockFetch([{ body: {} }]);

    await syncWomTeamRename(db, bingo.id, new WomCompetitionClient(fetchImpl));

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("https://api.wiseoldman.net/v2/competitions/42");
    const body = JSON.parse(call[1].body);
    expect(body.teams).toEqual([{ name: "Renamed Team", participants: ["CaptainRsn"] }]);
  });

  it("never touches WOM for a test data bingo", async () => {
    const { bingo } = seedBingoWithTeam({ slug: "testdata-20260923-0900", womCompetitionId: 42 });
    const fetchImpl = mockFetch([{ body: {} }]);
    await syncWomTeamRename(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("does nothing when no competition has been created yet", async () => {
    const { bingo } = seedBingoWithTeam();
    const fetchImpl = mockFetch([{ body: {} }]);
    await syncWomTeamRename(db, bingo.id, new WomCompetitionClient(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("never throws, and persists the failure reason on the bingo row", async () => {
    const { bingo } = seedBingoWithTeam({ womCompetitionId: 42 });
    const fetchImpl = mockFetch([{ status: 500 }]);

    await expect(syncWomTeamRename(db, bingo.id, new WomCompetitionClient(fetchImpl))).resolves.toBeUndefined();

    const updated = db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!;
    expect(updated.womSyncError).toContain("HTTP 500");
  });
});
