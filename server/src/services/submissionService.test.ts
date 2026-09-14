import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { GraphNodeInput } from "@bingo/shared";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTile, createTask } from "./boardService";
import { getTeamNodeStatuses } from "./boardService";
import { createSubmission, getAllSubmissionsForBingo, getTeamSubmissions, markScreenshotAnalysisFailed, recordScreenshotAnalysis } from "./submissionService";
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

function addTile(bingoId: string, opts: Partial<Parameters<typeof createTile>[1]> = {}) {
  return createTile(db, { bingoId, name: "Tile", boardRow: 0, boardCol: 0, ...opts });
}

// Creates a task that's a bare leaf ("x" item, or MANUAL) so its own node id is the leaf id.
function addTask(tileId: string, opts: { sortOrder?: number; points: number; scoringMode?: "automatic" | "manual"; submitRequiresPrevious?: boolean; pointsRequirePrevious?: boolean }) {
  const base: GraphNodeInput = opts.scoringMode === "manual" ? { kind: "MANUAL" } : { kind: "ITEM", itemName: "x" };
  const task = createTask(db, tileId, { ...base, label: `Task ${opts.sortOrder ?? 0}`, description: "desc", points: opts.points }, opts.sortOrder);
  return { ...task, leafId: task.id };
}

const base = { screenshotUrl: "/x.png", now: NOW };

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});

afterEach(() => {
  sqlite.close();
});

describe("createSubmission", () => {
  it("succeeds on a plain task and marks it pending_approval", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });

    const submission = createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], ...base,
    });

    expect(submission.status).toBe("pending");
    const statuses = getTeamNodeStatuses(db, teamId, bingo.id);
    expect(statuses.get(task.id)).toBe("pending_approval");
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

  it("rejects an itemName that doesn't match the target leaf's own name", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 }); // leaf's itemName is "x"

    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "not x" }], ...base }),
    ).toThrow(/does not match/);
    // Case-insensitive match still succeeds.
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "X" }], ...base }),
    ).not.toThrow();
  });

  it("rejects a submission that claims the same node twice", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });

    expect(() =>
      createSubmission(db, bingo, {
        teamId, submittedByUserId: memberUserId, ...base,
        claims: [{ nodeId: task.leafId, itemName: "x", quantity: 1 }, { nodeId: task.leafId, itemName: "x", quantity: 2 }],
      }),
    ).toThrow(/same requirement twice/);
  });

  it("rejects claims that do not target a requirement leaf", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = createTask(db, tile.id, { kind: "ALL", label: "T", description: "d", points: 20, children: [{ kind: "ITEM", itemName: "x" }] });

    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.id, itemName: "x" }], ...base }),
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
    const statuses = getTeamNodeStatuses(db, teamId, bingo.id);
    expect(statuses.get(task1.id)).toBe("pending_approval");
    expect(statuses.get(task2.id)).toBe("pending_approval");
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

  it("rejects submitGateNodeId until the gate is completed for the team, then accepts", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task1 = addTask(tile.id, { sortOrder: 0, points: 20 });
    const task2 = createTask(db, tile.id, { kind: "ITEM", itemName: "x", label: "Task 1", description: "desc", points: 20, submitGateNodeId: task1.leafId }, 1);
    const claims = [{ nodeId: task2.id, itemName: "x" }];

    expect(() => createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, ...base })).toThrow(/must be completed first/);

    db.insert(schema.teamNodeState).values({ teamId, nodeId: task1.leafId, completedAt: NOW, pointsAwarded: 20 }).run();

    expect(() => createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, ...base })).not.toThrow();
  });

});

describe("audit trail", () => {
  it("createSubmission records submission.created scoped to the team, with the claims and screenshot", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });

    const submission = createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], ...base });

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "submission.created")).get()!;
    expect(row.teamId).toBe(teamId);
    expect(row.visibility).toBe("team");
    const details = JSON.parse(row.details);
    expect(details.tileName).toBe("Tile");
    expect(details.taskLabels).toEqual(["Task 0"]);
    expect(details.claims).toEqual([{ nodeId: task.leafId, itemName: "x", quantity: 1 }]);
    expect(details.screenshotUrl).toBe("/x.png");
    expect(row.requestId).toBeNull();
    expect(submission.status).toBe("pending");
  });

  it("recordScreenshotAnalysis / markScreenshotAnalysisFailed record system-actor entries scoped to the submission's team", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    const submission = createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], ...base });

    recordScreenshotAnalysis(db, submission.id, { extractedText: ["codeword"], codewordFound: true, detectedItemName: "x" });
    const analyzed = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "submission.screenshot_analyzed")).get()!;
    expect(analyzed.actorType).toBe("system");
    expect(analyzed.teamId).toBe(teamId);
    expect(JSON.parse(analyzed.details)).toMatchObject({ codewordVerified: true, detectedItemName: "x" });

    markScreenshotAnalysisFailed(db, submission.id);
    const failed = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "submission.screenshot_analysis_failed")).get()!;
    expect(failed.actorType).toBe("system");
    expect(failed.teamId).toBe(teamId);
  });
});

describe("getTeamSubmissions / getAllSubmissionsForBingo", () => {
  it("attaches screenshots, claims, and the submitter's user row", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x", quantity: 2 }], screenshotUrl: "/uploads/x.png", now: NOW,
    });

    const [detail] = getTeamSubmissions(db, teamId);
    expect(detail!.screenshots).toHaveLength(1);
    expect(detail!.screenshots[0]!.storageUrl).toBe("/uploads/x.png");
    expect(detail!.claims).toEqual([expect.objectContaining({ nodeId: task.leafId, itemName: "x", quantity: 2 })]);
    expect(detail!.submittedByUser?.discordUsername).toBe("member");
  });

  it("includes touched leaves, tile, and team info scoped to the bingo", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id, { name: "Wintertodt" });
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], screenshotUrl: "/uploads/x.png", now: NOW,
    });

    const [row] = getAllSubmissionsForBingo(db, bingo.id);
    expect(row!.tile.name).toBe("Wintertodt");
    expect(row!.leaves.map((l) => l.id)).toEqual([task.leafId]);
    expect(row!.team).toEqual(expect.objectContaining({ id: teamId, name: "Team A" }));
    expect(row!.screenshots).toHaveLength(1);
  });
});
