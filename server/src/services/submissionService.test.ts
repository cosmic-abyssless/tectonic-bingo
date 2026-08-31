import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { teamTaskProgress, tileTaskItems, tileTasks, tiles } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createSubmission } from "./submissionService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const NOW = new Date("2026-03-01T12:00:00Z");
const STARTS_AT = new Date("2026-03-01T10:00:00Z");

function seed(bingoOverrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "mod", discordUsername: "mod" }).returning().all();
  const [member] = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().all();
  const [captain] = db.insert(schema.users).values({ discordId: "captain", discordUsername: "captain" }).returning().all();
  const [bingo] = db
    .insert(schema.bingos)
    .values({
      slug: "test", name: "Test Bingo", boardRows: 3, boardCols: 3, createdByUserId: admin.id,
      stage: "live", startsAt: STARTS_AT, ...bingoOverrides,
    })
    .returning()
    .all();
  const [team] = db
    .insert(schema.teams)
    .values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team A", codeword: "test-word" })
    .returning()
    .all();
  return { bingo, teamId: team.id, memberUserId: member.id };
}

function addTile(bingoId: string, opts: Partial<typeof tiles.$inferInsert> = {}) {
  return db.insert(tiles).values({ bingoId, name: "Tile", boardRow: 0, boardCol: 0, ...opts }).returning().get();
}

function addTask(tileId: string, opts: Partial<typeof tileTasks.$inferInsert> & { sortOrder: number; points: number }) {
  return db.insert(tileTasks).values({ tileId, label: `Task ${opts.sortOrder}`, description: "desc", ...opts }).returning().get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});

afterEach(() => {
  sqlite.close();
});

describe("createSubmission", () => {
  it("succeeds on a plain task and marks progress pending_approval", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    db.insert(tileTaskItems).values({ taskId: task.id, itemName: "Bruma torch" }).run();

    const submission = createSubmission(db, bingo, {
      teamId, taskId: task.id, submittedByUserId: memberUserId,
      itemClaims: [{ itemName: "Bruma torch" }], screenshotUrl: "/uploads/x.png", now: NOW,
    });

    expect(submission.status).toBe("pending");
    const progress = db.select().from(teamTaskProgress).all().find((p) => p.taskId === task.id);
    expect(progress?.status).toBe("pending_approval");
  });

  it("rejects when the bingo is not live", () => {
    const { bingo, teamId, memberUserId } = seed({ stage: "reveal" });
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    expect(() =>
      createSubmission(db, bingo, { teamId, taskId: task.id, submittedByUserId: memberUserId, itemClaims: [{ itemName: "x" }], screenshotUrl: "/x.png", now: NOW }),
    ).toThrow(ServiceError);
  });

  it("rejects before the bingo has started", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    const before = new Date(STARTS_AT.getTime() - 1000);
    expect(() =>
      createSubmission(db, bingo, { teamId, taskId: task.id, submittedByUserId: memberUserId, itemClaims: [{ itemName: "x" }], screenshotUrl: "/x.png", now: before }),
    ).toThrow(/has not started/);
  });

  it("rejects a frozen tile until the freeze window elapses, then accepts", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id, { hasFreezePeriod: true, freezeDurationMinutes: 120 });
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });

    const stillFrozen = new Date(STARTS_AT.getTime() + 60 * 60_000); // +1h, freeze is 2h
    expect(() =>
      createSubmission(db, bingo, { teamId, taskId: task.id, submittedByUserId: memberUserId, itemClaims: [{ itemName: "x" }], screenshotUrl: "/x.png", now: stillFrozen }),
    ).toThrow(/frozen/);

    const unfrozen = new Date(STARTS_AT.getTime() + 121 * 60_000); // +2h1m
    expect(() =>
      createSubmission(db, bingo, { teamId, taskId: task.id, submittedByUserId: memberUserId, itemClaims: [{ itemName: "x" }], screenshotUrl: "/x.png", now: unfrozen }),
    ).not.toThrow();
  });

  it("rejects submitRequiresPrevious until the previous task is completed, then accepts", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task1 = addTask(tile.id, { sortOrder: 0, points: 20 });
    const task2 = addTask(tile.id, { sortOrder: 1, points: 20, submitRequiresPrevious: true });

    expect(() =>
      createSubmission(db, bingo, { teamId, taskId: task2.id, submittedByUserId: memberUserId, itemClaims: [{ itemName: "x" }], screenshotUrl: "/x.png", now: NOW }),
    ).toThrow(/previous task/);

    db.insert(teamTaskProgress).values({ teamId, taskId: task1.id, status: "completed", pointsAwarded: 20 }).run();

    expect(() =>
      createSubmission(db, bingo, { teamId, taskId: task2.id, submittedByUserId: memberUserId, itemClaims: [{ itemName: "x" }], screenshotUrl: "/x.png", now: NOW }),
    ).not.toThrow();
  });

  it("rejects a wildcard that doesn't belong to the tile being submitted", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const otherTile = addTile(bingo.id, { boardRow: 0, boardCol: 1 });
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    const [wildcard] = db.insert(schema.tileWildcards).values({ tileId: otherTile.id, itemName: "Some jar" }).returning().all();

    expect(() =>
      createSubmission(db, bingo, {
        teamId, taskId: task.id, submittedByUserId: memberUserId, itemClaims: [{ itemName: "x" }],
        screenshotUrl: "/x.png", now: NOW, isWildcardRedemption: true, wildcardId: wildcard.id,
      }),
    ).toThrow(/does not belong/);
  });
});
