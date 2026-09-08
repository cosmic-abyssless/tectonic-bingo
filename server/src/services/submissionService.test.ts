import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { teamTaskProgress, tiles } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, type CreateTaskParams } from "./boardService";
import { getRequirementTree, leafIds } from "./requirementService";
import { createSubmission, getAllSubmissionsForBingo, getTeamSubmissions } from "./submissionService";
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

// Creates a task with a single-leaf requirement ("x" item, or MANUAL) and returns its leaf id.
function addTask(tileId: string, opts: Partial<CreateTaskParams> & { sortOrder: number; points: number }) {
  const requirement: CreateTaskParams["requirement"] = opts.scoringMode === "manual" ? undefined : { kind: "ITEM", itemNames: ["x"] };
  const task = createTask(db, { tileId, label: `Task ${opts.sortOrder}`, description: "desc", requirement, ...opts });
  const [leafId] = leafIds(getRequirementTree(db, task.id)!);
  return { ...task, leafId };
}

const base = { screenshotUrl: "/x.png", now: NOW };

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

    const submission = createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], ...base,
    });

    expect(submission.status).toBe("pending");
    const progress = db.select().from(teamTaskProgress).all().find((p) => p.taskId === task.id);
    expect(progress?.status).toBe("pending_approval");
  });

  it("requires at least one claim, and an itemName on ITEM claims but not MANUAL ones", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const manualTask = addTask(tile.id, { sortOrder: 0, points: 20, scoringMode: "manual" });
    const autoTask = addTask(tile.id, { sortOrder: 1, points: 20 });

    expect(() => createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [], ...base })).toThrow(/At least one claim/);
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: manualTask.leafId }], ...base }),
    ).not.toThrow();
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: autoTask.leafId }], ...base }),
    ).toThrow(/itemName is required/);
  });

  it("rejects claims that do not target a requirement leaf", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = createTask(db, {
      tileId: tile.id, label: "T", description: "d", sortOrder: 0, points: 20,
      requirement: { kind: "ALL", children: [{ kind: "ITEM", itemNames: ["x"] }] },
    });
    const rootId = getRequirementTree(db, task.id)!.id;

    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: rootId, itemName: "x" }], ...base }),
    ).toThrow(/requirement leaves/);
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: "missing", itemName: "x" }], ...base }),
    ).toThrow(/requirement leaves/);
  });

  it("rejects claims spanning more than one tile, and marks every touched task pending", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const otherTile = addTile(bingo.id, { boardCol: 1 });
    const task1 = addTask(tile.id, { sortOrder: 0, points: 20 });
    const task2 = addTask(tile.id, { sortOrder: 1, points: 20 });
    const otherTask = addTask(otherTile.id, { sortOrder: 0, points: 20 });

    expect(() =>
      createSubmission(db, bingo, {
        teamId, submittedByUserId: memberUserId, ...base,
        claims: [{ nodeId: task1.leafId, itemName: "x" }, { nodeId: otherTask.leafId, itemName: "x" }],
      }),
    ).toThrow(/same tile/);

    createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, ...base,
      claims: [{ nodeId: task1.leafId, itemName: "x" }, { nodeId: task2.leafId, itemName: "x" }],
    });
    const statuses = db.select().from(teamTaskProgress).all().map((p) => [p.taskId, p.status]);
    expect(statuses.sort()).toEqual([[task1.id, "pending_approval"], [task2.id, "pending_approval"]].sort());
  });

  it("rejects when the bingo is not live", () => {
    const { bingo, teamId, memberUserId } = seed({ stage: "reveal" });
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], ...base }),
    ).toThrow(ServiceError);
  });

  it("rejects before the bingo has started", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    const before = new Date(STARTS_AT.getTime() - 1000);
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], screenshotUrl: "/x.png", now: before }),
    ).toThrow(/has not started/);
  });

  it("rejects a frozen tile until the freeze window elapses, then accepts", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id, { hasFreezePeriod: true, freezeDurationMinutes: 120 });
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    const claims = [{ nodeId: task.leafId, itemName: "x" }];

    const stillFrozen = new Date(STARTS_AT.getTime() + 60 * 60_000); // +1h, freeze is 2h
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, screenshotUrl: "/x.png", now: stillFrozen }),
    ).toThrow(/frozen/);

    const unfrozen = new Date(STARTS_AT.getTime() + 121 * 60_000); // +2h1m
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, screenshotUrl: "/x.png", now: unfrozen }),
    ).not.toThrow();
  });

  it("rejects submitRequiresPrevious until the previous task is completed, then accepts", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task1 = addTask(tile.id, { sortOrder: 0, points: 20 });
    const task2 = addTask(tile.id, { sortOrder: 1, points: 20, submitRequiresPrevious: true });
    const claims = [{ nodeId: task2.leafId, itemName: "x" }];

    expect(() => createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, ...base })).toThrow(/previous task/);

    db.insert(teamTaskProgress).values({ teamId, taskId: task1.id, status: "completed", pointsAwarded: 20 }).run();

    expect(() => createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, ...base })).not.toThrow();
  });

  it("rejects a wildcard that doesn't belong to the tile, or isn't applicable to the claimed leaf", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const otherTile = addTile(bingo.id, { boardRow: 0, boardCol: 1 });
    const task1 = addTask(tile.id, { sortOrder: 0, points: 20 });
    const task2 = addTask(tile.id, { sortOrder: 1, points: 20 });
    const [foreign] = db.insert(schema.tileWildcards).values({ tileId: otherTile.id, itemName: "Some jar" }).returning().all();
    const [scoped] = db.insert(schema.tileWildcards).values({ tileId: tile.id, itemName: "Jar", applicableNodeId: task1.leafId }).returning().all();

    expect(() =>
      createSubmission(db, bingo, {
        teamId, submittedByUserId: memberUserId, ...base,
        claims: [{ nodeId: task1.leafId, itemName: "Some jar", wildcardId: foreign.id }],
      }),
    ).toThrow(/does not belong/);
    expect(() =>
      createSubmission(db, bingo, {
        teamId, submittedByUserId: memberUserId, ...base,
        claims: [{ nodeId: task2.leafId, itemName: "Jar", wildcardId: scoped.id }],
      }),
    ).toThrow(/not applicable/);
    expect(() =>
      createSubmission(db, bingo, {
        teamId, submittedByUserId: memberUserId, ...base,
        claims: [{ nodeId: task1.leafId, itemName: "Jar", wildcardId: scoped.id }],
      }),
    ).not.toThrow();
  });
});

describe("getTeamSubmissions / getAllSubmissionsForBingo", () => {
  it("attaches screenshots, claims (with their task), and the submitter's user row", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x", quantity: 2 }], screenshotUrl: "/uploads/x.png", now: NOW,
    });

    const [detail] = getTeamSubmissions(db, teamId);
    expect(detail.screenshots).toHaveLength(1);
    expect(detail.screenshots[0].storageUrl).toBe("/uploads/x.png");
    expect(detail.claims).toEqual([expect.objectContaining({ nodeId: task.leafId, taskId: task.id, itemName: "x", quantity: 2 })]);
    expect(detail.submittedByUser?.discordUsername).toBe("member");
  });

  it("includes touched tasks, tile, and team info scoped to the bingo", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id, { name: "Wintertodt" });
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], screenshotUrl: "/uploads/x.png", now: NOW,
    });

    const [row] = getAllSubmissionsForBingo(db, bingo.id);
    expect(row.tile.name).toBe("Wintertodt");
    expect(row.tasks.map((t) => t.id)).toEqual([task.id]);
    expect(row.team).toEqual(expect.objectContaining({ id: teamId, name: "Team A" }));
    expect(row.screenshots).toHaveLength(1);
  });
});
