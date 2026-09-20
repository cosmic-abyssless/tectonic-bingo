import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createBingo } from "./bingoService";
import { createTile, createTask } from "./boardService";
import { ServiceError } from "./errors";
import { createTestUser, fillFakeStats, listTestDataBingos, removeUploads, teardownTestBingo, uploadFilePaths } from "./devTestDataService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

const user = (discordId: string) => db.insert(schema.users).values({ discordId, discordUsername: discordId }).returning().get();

// A bingo with a tile (and an uploaded tile image), a team of the given users, and one submission with a screenshot.
function seedBingo(slug: string, admin: typeof schema.users.$inferSelect, members: (typeof schema.users.$inferSelect)[]) {
  const bingo = createBingo(db, { slug, name: slug, boardRows: 2, boardCols: 2, createdByUserId: admin.id });
  const tile = createTile(db, { bingoId: bingo.id, name: "Tile", boardRow: 0, boardCol: 0, imageUrl: `/uploads/tiles/${slug}.png` });
  const task = createTask(db, tile.id, { kind: "ITEM", itemName: "x", label: "Part", description: "d", points: 10 });
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: members[0]!.id, name: "T", codeword: `${slug}-word` }).returning().get();
  for (const m of members) {
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: m.id, rsn: m.discordUsername }).run();
    db.insert(schema.teamMembers).values({ teamId: team.id, userId: m.id, isCaptain: m === members[0] }).run();
  }
  const submission = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: members[0]!.id }).returning().get();
  db.insert(schema.submissionScreenshots).values({ submissionId: submission.id, storageUrl: `/uploads/${slug}-shot.png` }).run();
  db.insert(schema.claims).values({ submissionId: submission.id, nodeId: task.id, itemName: "x", quantity: 1 }).run();
  return bingo;
}

describe("createTestUser", () => {
  it("makes a testdata- user, and refuses other ids and duplicates", () => {
    const created = createTestUser(db, { discordId: "testdata-a-1", discordUsername: " Cool_Player " });
    expect(created.discordUsername).toBe("Cool_Player");
    expect(created.isAdmin).toBe(false);
    expect(created.inGuild).toBe(true);

    expect(() => createTestUser(db, { discordId: "real-123", discordUsername: "x" })).toThrow(/must start with/);
    expect(() => createTestUser(db, { discordId: "testdata-a-2", discordUsername: " " })).toThrow(ServiceError);
    expect(() => createTestUser(db, { discordId: "testdata-a-1", discordUsername: "again" })).toThrow(/already exists/);
  });
});

describe("teardownTestBingo", () => {
  it("refuses a slug without the testdata- prefix, and an unknown one", () => {
    const admin = user("admin");
    seedBingo("real-bingo", admin, [user("p1")]);
    expect(() => teardownTestBingo(db, "real-bingo")).toThrow(/starts with/);
    expect(db.select().from(schema.bingos).all()).toHaveLength(1); // untouched
    expect(() => teardownTestBingo(db, "testdata-nope")).toThrow(/not found/i);
  });

  it("removes the bingo, everything under it and its audit rows, and reports the uploads to unlink", () => {
    const admin = user("admin");
    const a = user("testdata-a-1");
    const b = user("testdata-a-2");
    seedBingo("testdata-one", admin, [a, b]);
    const bingoId = db.select().from(schema.bingos).get()!.id;
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.bingoId, bingoId)).all().length).toBeGreaterThan(0);

    const result = teardownTestBingo(db, "testdata-one");

    expect(result.urls.sort()).toEqual(["/uploads/tiles/testdata-one.png", "/uploads/testdata-one-shot.png"].sort());
    expect(result.usersDeleted).toBe(2);
    for (const table of [schema.bingos, schema.tiles, schema.teams, schema.teamMembers, schema.signups, schema.submissions, schema.submissionScreenshots, schema.claims, schema.nodes]) {
      expect(db.select().from(table).all(), `rows left in ${table}`).toHaveLength(0);
    }
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.bingoId, bingoId)).all()).toHaveLength(0);
    // The site admin (a real account) is not a test user and stays.
    expect(db.select().from(schema.users).all().map((u) => u.discordId)).toEqual(["admin"]);
  });

  it("keeps a test user who is on another bingo, a real player who signed up, and another bingo's log", () => {
    const admin = user("admin");
    const shared = user("testdata-shared");
    const onlyHere = user("testdata-only-here");
    const real = user("real-player");
    seedBingo("testdata-one", admin, [shared, onlyHere, real]);
    const two = seedBingo("testdata-two", admin, [shared]);

    const result = teardownTestBingo(db, "testdata-one");

    expect(result.usersDeleted).toBe(1); // only "only-here"
    expect(db.select().from(schema.users).all().map((u) => u.discordId).sort()).toEqual(["admin", "real-player", "testdata-shared"]);
    expect(db.select().from(schema.bingos).all().map((b) => b.slug)).toEqual(["testdata-two"]);
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.bingoId, two.id)).all().length).toBeGreaterThan(0);
    expect(db.select().from(schema.tiles).all()).toHaveLength(1);
  });
});

describe("fillFakeStats", () => {
  it("fills every signup of a testdata- bingo with stats, and refuses any other bingo", () => {
    const admin = user("testdata-admin");
    const bingo = seedBingo("testdata-stats", admin, [user("testdata-a"), user("testdata-b")]);
    expect(fillFakeStats(db, "testdata-stats")).toEqual({ signups: 2 });
    for (const s of db.select().from(schema.signups).where(eq(schema.signups.bingoId, bingo.id)).all()) {
      expect(JSON.parse(s.womDataJson!)).toHaveProperty("ehb");
      expect(JSON.parse(s.runeProfileDataJson!)).toHaveProperty("username", s.rsn);
      expect(s.statsFetchedAt).toBeInstanceOf(Date);
    }
    createBingo(db, { slug: "real-bingo", name: "Real", boardRows: 2, boardCols: 2, createdByUserId: admin.id });
    expect(() => fillFakeStats(db, "real-bingo")).toThrow(ServiceError);
    expect(() => fillFakeStats(db, "testdata-missing")).toThrow(ServiceError);
  });
});

describe("listTestDataBingos", () => {
  it("lists only testdata- bingos", () => {
    const admin = user("admin");
    seedBingo("real-bingo", admin, [user("p1")]);
    seedBingo("testdata-x", admin, [user("testdata-p2")]);
    expect(listTestDataBingos(db).map((b) => b.slug)).toEqual(["testdata-x"]);
  });
});

describe("upload files", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("maps an upload URL to the original and its two variants, and ignores anything that isn't an upload URL", () => {
    const files = uploadFilePaths(dir, ["/uploads/tiles/a.png", "/somewhere/else.png", "/uploads/b.jpg"]);
    expect(files.map((f) => path.relative(dir, f).replace(/\\/g, "/"))).toEqual([
      "tiles/a.png", "tiles/a-thumb.webp", "tiles/a-full.webp",
      "b.jpg", "b-thumb.webp", "b-full.webp",
    ]);
  });

  it("cannot be pointed outside the uploads folder", () => {
    const files = uploadFilePaths(dir, ["/uploads/../secret.png", "/uploads/tiles/../../../etc/passwd.png"]);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.startsWith(path.resolve(dir) + path.sep))).toBe(true);
  });

  it("removes what is there and counts it, tolerating files that are already gone", () => {
    fs.mkdirSync(path.join(dir, "tiles"));
    for (const name of ["a.png", "a-thumb.webp"]) fs.writeFileSync(path.join(dir, "tiles", name), "x");
    fs.writeFileSync(path.join(dir, "keep.png"), "x");

    expect(removeUploads(dir, ["/uploads/tiles/a.png"])).toBe(2); // the full variant never existed
    expect(fs.readdirSync(path.join(dir, "tiles"))).toEqual([]);
    expect(fs.existsSync(path.join(dir, "keep.png"))).toBe(true);
  });
});
