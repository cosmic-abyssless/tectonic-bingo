// The historical import bundle's checks (shared/src/historicalBundle.ts plus the server's own) and the importer
// (historicalImportService), over the sample bundle checked in at testUtils/fixtures/sample-historical-bundle.json.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { validateHistoricalBundle, type HistoricalBundle } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { checkHistoricalBundle, HistoricalBundleError, importHistoricalBundle } from "./historicalImportService";
import { getHistoricalBingo } from "./historicalService";
import { deleteBingo } from "./bingoService";
import { endedAt } from "./bingoStart";

const failAudit = vi.hoisted(() => ({ on: false }));
vi.mock("../audit/record", async (importOriginal) => {
  const real = await importOriginal<typeof import("../audit/record")>();
  return {
    ...real,
    audit: ((...args: Parameters<typeof real.audit>) => {
      if (failAudit.on) throw new Error("the database went away");
      return real.audit(...args);
    }) as typeof real.audit,
  };
});
vi.mock("../ws", () => ({ broadcast: vi.fn() }));

const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, "../testUtils/fixtures/sample-historical-bundle.json"), "utf8")) as HistoricalBundle;
const sample = (): HistoricalBundle => structuredClone(SAMPLE);

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let admin: typeof schema.users.$inferSelect;
let uploadsDir: string;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "historical-import-"));
  failAudit.on = false;
});
afterEach(() => {
  sqlite.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

function uploadedFiles(): string[] {
  const dir = path.join(uploadsDir, "tiles");
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

async function problemsOf(input: unknown): Promise<string[]> {
  try {
    await checkHistoricalBundle(db, input);
    return [];
  } catch (err) {
    if (err instanceof HistoricalBundleError) return err.problems;
    throw err;
  }
}

describe("checking a bundle", () => {
  it("passes the sample bundle", async () => {
    expect(validateHistoricalBundle(sample())).toMatchObject({ ok: true, problems: [] });
    expect(await problemsOf(sample())).toEqual([]);
  });

  it("refuses a Team with no Captain", async () => {
    const b = sample();
    (b.teams[0] as { captain: string | null }).captain = null;
    expect(await problemsOf(b)).toEqual(['Team "Lava Dragons": no Captain']);
  });

  it("refuses a Captain who isn't on their Team", async () => {
    const b = sample();
    b.teams[0]!.captain = b.teams[1]!.players[2]!;
    expect(await problemsOf(b)).toEqual([`Team "Lava Dragons": its Captain "${b.teams[1]!.players[2]}" isn't one of its players`]);
  });

  it("refuses a Tile whose image isn't in the bundle, and an image that isn't one", async () => {
    const b = sample();
    delete b.images["r1c1.png"];
    b.images["r1c2.png"] = { contentType: "image/png", data: Buffer.from("not a picture").toString("base64") };
    expect(await problemsOf(b)).toEqual(['tiles[0] "Vorkath": its image "r1c1.png" isn\'t in the bundle', 'images["r1c2.png"]: can\'t be read as an image']);
  });

  it("refuses an unknown version, and anything that isn't a bundle", async () => {
    expect(await problemsOf({ ...sample(), version: 3 })).toEqual(["Unknown bundle version 3: this site reads versions 1 and 2"]);
    expect(await problemsOf({ ...sample(), format: "tectonic-bingo-export" })).toEqual(['This isn\'t a historical Bingo bundle (its format isn\'t "tectonic-bingo-historical")']);
  });

  it("refuses a slug that's taken", async () => {
    db.insert(schema.bingos).values({ slug: "sample-historical-2024", name: "Taken", boardRows: 3, boardCols: 3, createdByUserId: admin.id }).run();
    expect(await problemsOf(sample())).toEqual(['bingo.slug: "sample-historical-2024" is taken. To import it again, delete that Bingo first']);
  });

  it("refuses made-up Discord ids, pointing unmapped Players at unknownPlayers", async () => {
    const b = sample();
    b.players[0]!.discordId = "unknown";
    b.players[1]!.discordId = "testdata-abc-1";
    const problems = await problemsOf(b);
    expect(problems).toEqual(
      expect.arrayContaining(['players[0] "Magma Mike": a Player without a Discord id goes in unknownPlayers', 'players[1] "Cinder": discordId must be a Discord user id']),
    );
  });

  it("reports every problem at once", async () => {
    db.insert(schema.bingos).values({ slug: "sample-historical-2024", name: "Taken", boardRows: 3, boardCols: 3, createdByUserId: admin.id }).run();
    const b = sample();
    (b.teams[0] as { captain: string | null }).captain = null;
    b.teams[1]!.captain = "999999999999999999";
    delete b.images["r3c3.png"];
    b.standings.push({ team: "Nobody", place: 4, points: null });
    b.tiles.pop();
    const err = await checkHistoricalBundle(db, b).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HistoricalBundleError);
    expect((err as HistoricalBundleError).problems).toEqual([
      "tiles: 1 of the 9 board cells have no Tile",
      'Team "Lava Dragons": no Captain',
      'Team "Sea Snakes": its Captain "999999999999999999" isn\'t one of its players',
      'standings[3]: "Nobody" isn\'t one of the Teams',
      'bingo.slug: "sample-historical-2024" is taken. To import it again, delete that Bingo first',
    ]);
    expect((err as HistoricalBundleError).message).toMatch(/^The bundle has 5 problems:\n- tiles:/);
  });

  it("refuses a Wise Old Man competition that already belongs to a Bingo", async () => {
    const other = db.insert(schema.bingos).values({ slug: "other", name: "Other", boardRows: 3, boardCols: 3, createdByUserId: admin.id }).returning().get();
    db.insert(schema.womPastCompetitions).values({ guildId: process.env.DISCORD_GUILD_ID ?? "", womId: 424242, bingoId: other.id, title: "x", metric: "ehb", startsAt: new Date(), endsAt: new Date(), dataJson: "{}" }).run();
    expect(await problemsOf(sample())).toEqual(['wom.competitionId: Wise Old Man competition 424242 already belongs to the Bingo "Other"']);
  });
});

describe("importing a bundle", () => {
  it("creates the whole Historical Bingo", async () => {
    const { bingo, usersCreated } = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    expect(bingo).toMatchObject({ slug: "sample-historical-2024", name: "Spring Bingo 2024 (sample)", stage: "complete", historical: true, achievementsEnabled: false, boardRows: 3, boardCols: 3 });
    expect(bingo.startsAt?.toISOString()).toBe("2024-03-01T18:00:00.000Z");
    expect(usersCreated).toBe(9);
  });

  it("ended at its end date, though it never moved to Finished here (On Fire's window, Wrapped, Rewind)", async () => {
    const { bingo } = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    expect(endedAt(db, bingo)).toEqual(bingo.endsAt);
    expect(bingo.endsAt?.toISOString()).toBe(new Date(SAMPLE.bingo.endsAt).toISOString());
  });

  it("creates new users: clan members from the clan's records, others by RSN and locked out", async () => {
    await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    const byDiscordId = (id: string) => db.select().from(schema.users).where(eq(schema.users.discordId, id)).get()!;
    expect(byDiscordId("100000000000000001")).toMatchObject({ discordUsername: "Magma Mike", inGuild: true, isAdmin: false });
    expect(byDiscordId("100000000000000003")).toMatchObject({ discordUsername: "Old Flame", inGuild: false });
  });

  it("leaves existing users as they are", async () => {
    const existing = db.insert(schema.users).values({ discordId: "100000000000000011", discordUsername: "tide", discordGlobalName: "Tide Now", inGuild: true }).returning().get();
    const { usersCreated } = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    expect(usersCreated).toBe(8);
    expect(db.select().from(schema.users).where(eq(schema.users.id, existing.id)).get()).toEqual(existing);
    // ...and the history is theirs.
    expect(db.select().from(schema.signups).where(eq(schema.signups.userId, existing.id)).get()?.rsn).toBe("Tidecaller");
  });

  it("gives every Player a Signup under the RSN they played as", async () => {
    const { bingo } = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    const rsns = db.select({ rsn: schema.signups.rsn }).from(schema.signups).where(eq(schema.signups.bingoId, bingo.id)).all().map((s) => s.rsn);
    expect(rsns.sort()).toEqual(["Boulder", "Brine", "Cinder", "Kelp Lord", "Magma Mike", "Old Flame", "Pebble", "Shellshock", "Tidecaller"]);
  });

  it("makes the Teams, with the Captain and co-captain leading", async () => {
    const { bingo } = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    const rows = db
      .select({ team: schema.teams.name, color: schema.teams.color, captainUserId: schema.teams.captainUserId, userId: schema.teamMembers.userId, discordId: schema.users.discordId, isCaptain: schema.teamMembers.isCaptain, isCoCaptain: schema.teamMembers.isCoCaptain })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
      .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
      .where(eq(schema.teams.bingoId, bingo.id))
      .orderBy(schema.users.discordId)
      .all();
    expect(rows).toHaveLength(9);
    const snakes = rows.filter((r) => r.team === "Sea Snakes");
    expect(snakes.map((r) => [r.discordId, r.isCaptain, r.isCoCaptain])).toEqual([
      ["100000000000000011", true, false],
      ["100000000000000012", false, true],
      ["100000000000000013", false, false],
    ]);
    expect(snakes[0]!.captainUserId).toBe(snakes[0]!.userId);
    expect(snakes[0]!.color).toBe("#3498db");
    // A Team with no colour gets the next one free.
    expect(rows.find((r) => r.team === "Rock Crabs")!.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("stores each Tile's picture like any Tile upload, thumbnails included, with its points and rules", async () => {
    const { bingo } = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    const rows = db.select().from(schema.tiles).innerJoin(schema.nodes, eq(schema.tiles.nodeId, schema.nodes.id)).where(eq(schema.tiles.bingoId, bingo.id)).all();
    expect(rows).toHaveLength(9);
    const vorkath = rows.find((r) => r.tiles.name === "Vorkath")!;
    expect(vorkath.tiles).toMatchObject({ boardRow: 0, boardCol: 0, rulesText: "Any unique drop from Vorkath." });
    expect(vorkath.nodes.points).toBe(5);
    expect(vorkath.tiles.imageUrl).toMatch(/^\/uploads\/tiles\/[A-Za-z0-9._-]+\.png$/);
    const cox = rows.find((r) => r.tiles.name === "Chambers of Xeric")!;
    expect([cox.nodes.points, cox.tiles.rulesText]).toEqual([0, null]);
    // The original, its thumbnail and its full-size variant, for each of the 9.
    expect(uploadedFiles()).toHaveLength(27);
  });

  it("records the standings and links the Wise Old Man competition", async () => {
    const { bingo } = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    const shown = getHistoricalBingo(db, bingo);
    expect(shown.standings.map((s) => [s.teamName, s.place, s.points])).toEqual([
      ["Sea Snakes", 1, 145],
      ["Lava Dragons", 2, 120],
      ["Rock Crabs", 3, null],
    ]);
    const wom = db.select().from(schema.womPastCompetitions).where(eq(schema.womPastCompetitions.womId, 424242)).get()!;
    expect(wom).toMatchObject({ bingoId: bingo.id, title: "Spring Bingo 2024", metric: "ehb", participantCount: 10, addedByUserId: admin.id });
    expect(shown.wom?.players.find((p) => p.rsn === "Ghost Rider")).toMatchObject({ user: null, teamName: "Rock Crabs" });
  });

  it("finds a Player on the Wise Old Man leaderboard by their account, even one renamed since", async () => {
    const bundle = sample();
    const player = bundle.players[0]!;
    player.womId = 777;
    // The competition lists the account under the name it has now, not the one it had in the Bingo.
    const row = (bundle.wom!.data as { participations: { player: { id?: number; username: string; displayName: string } }[] }).participations.find(
      (p) => p.player.displayName.toLowerCase() === player.rsn.toLowerCase(),
    )!;
    row.player = { id: 777, username: "renamed_since", displayName: "Renamed Since" };
    const { bingo } = await importHistoricalBundle(db, bundle, { createdByUserId: admin.id, uploadsDir });

    const signup = db.select().from(schema.signups).where(eq(schema.signups.rsn, player.rsn)).get()!;
    expect(signup.womId).toBe("777");
    const shown = getHistoricalBingo(db, bingo).wom!.players;
    expect(shown.find((p) => p.rsn === player.rsn)).toMatchObject({ user: expect.objectContaining({ rsn: player.rsn }) });
    expect(shown.some((p) => p.rsn === "Renamed Since")).toBe(false);
  });

  it("refuses a Wise Old Man account id that isn't one, or that two Players share", async () => {
    const bundle = sample();
    bundle.players[0]!.womId = 1.5;
    bundle.players[1]!.womId = 5;
    bundle.players[2]!.womId = 5;
    const problems = await problemsOf(bundle);
    expect(problems.some((p) => p.includes("womId must be a Wise Old Man player id"))).toBe(true);
    expect(problems.some((p) => p.includes("Wise Old Man player 5 is"))).toBe(true);
  });

  it("re-links the Wise Old Man competition when a deleted import is imported again", async () => {
    const first = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    deleteBingo(db, first.bingo.id);
    const again = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    const rows = db.select().from(schema.womPastCompetitions).where(eq(schema.womPastCompetitions.womId, 424242)).all();
    expect(rows.map((r) => r.bingoId)).toEqual([again.bingo.id]);
    expect(again.usersCreated).toBe(0);
  });

  it("audits the import", async () => {
    const { bingo } = await importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir });
    const entries = db.select().from(schema.auditLog).all();
    expect(entries.map((e) => e.action)).toEqual(["bingo.historical_imported"]);
    expect(entries[0]).toMatchObject({ bingoId: bingo.id, entityType: "bingo", entityId: bingo.id });
    expect(JSON.parse(entries[0]!.details)).toEqual({
      slug: "sample-historical-2024",
      name: "Spring Bingo 2024 (sample)",
      source: "sample-spring-2024",
      counts: { tiles: 9, teams: 3, players: 9, usersCreated: 9, unknownPlayers: 1, standings: 3, womCompetition: true },
    });
  });

  it("rolls everything back when it fails part-way, pictures included", async () => {
    failAudit.on = true;
    await expect(importHistoricalBundle(db, sample(), { createdByUserId: admin.id, uploadsDir })).rejects.toThrow("the database went away");
    for (const table of [schema.bingos, schema.signups, schema.teams, schema.teamMembers, schema.tiles, schema.nodes, schema.historicalStandings, schema.womPastCompetitions, schema.auditLog]) {
      expect(db.select().from(table).all()).toEqual([]);
    }
    expect(db.select().from(schema.users).all().map((u) => u.id)).toEqual([admin.id]);
    expect(uploadedFiles()).toEqual([]);
  });

  it("writes nothing for a bundle that fails its checks", async () => {
    const b = sample();
    b.teams[0]!.captain = b.teams[1]!.players[0]!;
    await expect(importHistoricalBundle(db, b, { createdByUserId: admin.id, uploadsDir })).rejects.toBeInstanceOf(HistoricalBundleError);
    expect(db.select().from(schema.bingos).all()).toEqual([]);
    expect(uploadedFiles()).toEqual([]);
  });
});
