import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoLineTiles, bingoLines, submissionItemClaims, submissions, teamTaskProgress, tileTaskItems, tileTasks, tiles, tileWildcards } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { approveSubmission, evaluateTaskCompletion, rejectSubmission } from "./scoringService";

describe("evaluateTaskCompletion (pure)", () => {
  it("requires cumulative claimed quantity to meet an ungrouped item's target", () => {
    const items = [{ itemName: "Bruma torch", quantity: 2, optionsGroup: null }];
    expect(evaluateTaskCompletion(items, [{ itemName: "Bruma torch", quantity: 1 }], { minSubmissions: 1, requiresCompleteSet: false, approvedSubmissionCount: 1 })).toBe(false);
    expect(evaluateTaskCompletion(items, [{ itemName: "Bruma torch", quantity: 2 }], { minSubmissions: 1, requiresCompleteSet: false, approvedSubmissionCount: 1 })).toBe(true);
    expect(
      evaluateTaskCompletion(
        items,
        [{ itemName: "Bruma torch", quantity: 1 }, { itemName: "Bruma torch", quantity: 1 }],
        { minSubmissions: 1, requiresCompleteSet: false, approvedSubmissionCount: 2 },
      ),
    ).toBe(true);
  });

  it("matches item names case-insensitively", () => {
    const items = [{ itemName: "Draconic Visage", quantity: 1, optionsGroup: null }];
    expect(evaluateTaskCompletion(items, [{ itemName: "draconic visage", quantity: 1 }], { minSubmissions: 1, requiresCompleteSet: false, approvedSubmissionCount: 1 })).toBe(true);
  });

  it("requires all groups to have at least one satisfied item by default", () => {
    const items = [
      { itemName: "Steam battlestaff", quantity: 1, optionsGroup: "drop" },
      { itemName: "Zamorak hilt", quantity: 1, optionsGroup: "drop" },
    ];
    expect(evaluateTaskCompletion(items, [], { minSubmissions: 1, requiresCompleteSet: false, approvedSubmissionCount: 1 })).toBe(false);
    expect(evaluateTaskCompletion(items, [{ itemName: "Zamorak hilt", quantity: 1 }], { minSubmissions: 1, requiresCompleteSet: false, approvedSubmissionCount: 1 })).toBe(true);
  });

  it("gates on minSubmissions even when the item tally is already satisfied", () => {
    const items = [
      { itemName: "Steam battlestaff", quantity: 1, optionsGroup: "drop" },
      { itemName: "Zamorak hilt", quantity: 1, optionsGroup: "drop" },
    ];
    // K'ril: item tally satisfied by a single approved submission, but two
    // *different* drops (two approved submissions) are required.
    expect(evaluateTaskCompletion(items, [{ itemName: "Zamorak hilt", quantity: 1 }], { minSubmissions: 2, requiresCompleteSet: false, approvedSubmissionCount: 1 })).toBe(false);
    expect(
      evaluateTaskCompletion(
        items,
        [{ itemName: "Zamorak hilt", quantity: 1 }, { itemName: "Steam battlestaff", quantity: 1 }],
        { minSubmissions: 2, requiresCompleteSet: false, approvedSubmissionCount: 2 },
      ),
    ).toBe(true);
  });

  it("requiresCompleteSet needs every item in one whole group, not one item per group", () => {
    const items = [
      { itemName: "Ahrim's hood", quantity: 1, optionsGroup: "ahrim" },
      { itemName: "Ahrim's staff", quantity: 1, optionsGroup: "ahrim" },
      { itemName: "Dharok's helm", quantity: 1, optionsGroup: "dharok" },
      { itemName: "Dharok's greataxe", quantity: 1, optionsGroup: "dharok" },
    ];
    const partial = [{ itemName: "Ahrim's hood", quantity: 1 }, { itemName: "Dharok's helm", quantity: 1 }];
    expect(evaluateTaskCompletion(items, partial, { minSubmissions: 1, requiresCompleteSet: true, approvedSubmissionCount: 2 })).toBe(false);

    const oneFullSet = [{ itemName: "Ahrim's hood", quantity: 1 }, { itemName: "Ahrim's staff", quantity: 1 }];
    expect(evaluateTaskCompletion(items, oneFullSet, { minSubmissions: 1, requiresCompleteSet: true, approvedSubmissionCount: 2 })).toBe(true);
  });

  it("treats a task with no items as complete once minSubmissions is met", () => {
    expect(evaluateTaskCompletion([], [], { minSubmissions: 1, requiresCompleteSet: false, approvedSubmissionCount: 1 })).toBe(true);
    expect(evaluateTaskCompletion([], [], { minSubmissions: 1, requiresCompleteSet: false, approvedSubmissionCount: 0 })).toBe(false);
  });
});

// --- Integration tests against a real migrated in-memory DB ---

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

interface Fixture {
  teamId: string;
  modUserId: string;
  memberUserId: string;
  tileId: string;
}

function seedBaseFixture(): Fixture {
  const [admin] = db.insert(schema.users).values({ discordId: "mod", discordUsername: "mod" }).returning().all();
  const [member] = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().all();
  const [captain] = db.insert(schema.users).values({ discordId: "captain", discordUsername: "captain" }).returning().all();
  const [bingo] = db
    .insert(schema.bingos)
    .values({ slug: "test", name: "Test Bingo", boardRows: 3, boardCols: 3, createdByUserId: admin.id })
    .returning()
    .all();
  const [team] = db
    .insert(schema.teams)
    .values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team A", codeword: "test-word" })
    .returning()
    .all();
  const [tile] = db
    .insert(tiles)
    .values({ bingoId: bingo.id, name: "Test Tile", boardRow: 0, boardCol: 0 })
    .returning()
    .all();
  return { teamId: team.id, modUserId: admin.id, memberUserId: member.id, tileId: tile.id };
}

function addTask(tileId: string, opts: Partial<typeof tileTasks.$inferInsert> & { sortOrder: number; points: number }) {
  return db.insert(tileTasks).values({ tileId, label: `Task ${opts.sortOrder}`, description: "desc", ...opts }).returning().get();
}

function addItem(taskId: string, itemName: string, opts: Partial<typeof tileTaskItems.$inferInsert> = {}) {
  db.insert(tileTaskItems).values({ taskId, itemName, ...opts }).run();
}

function submitAndReturn(teamId: string, taskId: string, submittedByUserId: string, claims: { itemName: string; quantity?: number }[]) {
  const [submission] = db.insert(submissions).values({ teamId, taskId, submittedByUserId }).returning().all();
  for (const c of claims) {
    db.insert(submissionItemClaims).values({ submissionId: submission.id, itemName: c.itemName, quantity: c.quantity ?? 1 }).run();
  }
  return submission;
}

function findProgress(teamId: string, taskId: string) {
  return db.select().from(teamTaskProgress).all().find((p) => p.teamId === teamId && p.taskId === taskId);
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});

afterEach(() => {
  sqlite.close();
});

describe("approveSubmission / rejectSubmission (integration)", () => {
  it("completes a simple single-task tile and awards points", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 20 });
    addItem(task.id, "Bruma torch");
    const submission = submitAndReturn(fx.teamId, task.id, fx.memberUserId, [{ itemName: "Bruma torch" }]);

    const result = approveSubmission(db, { submissionId: submission.id, reviewedByUserId: fx.modUserId });

    expect(result.taskCompleted).toBe(true);
    expect(result.pointsAwarded).toBe(20);
    expect(result.submission.status).toBe("approved");

    const progress = findProgress(fx.teamId, task.id);
    expect(progress?.status).toBe("completed");
    expect(progress?.pointsAwarded).toBe(20);
  });

  it("withholds points on a pointsRequirePrevious task until the previous task completes, then releases them", () => {
    const fx = seedBaseFixture();
    const task1 = addTask(fx.tileId, { sortOrder: 0, points: 25 });
    addItem(task1.id, "Vorki");
    const task2 = addTask(fx.tileId, { sortOrder: 1, points: 35, pointsRequirePrevious: true });
    addItem(task2.id, "Draconic visage");

    // Complete task 2 first (out of order) — should complete but withhold points.
    const sub2 = submitAndReturn(fx.teamId, task2.id, fx.memberUserId, [{ itemName: "Draconic visage" }]);
    const result2 = approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(result2.taskCompleted).toBe(true);
    expect(result2.pointsAwarded).toBe(0);

    // Now complete task 1 — cascade should release task 2's points.
    const sub1 = submitAndReturn(fx.teamId, task1.id, fx.memberUserId, [{ itemName: "Vorki" }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    const progress = findProgress(fx.teamId, task2.id)!;
    expect(progress.status).toBe("completed");
    expect(progress.pointsAwarded).toBe(35);
  });

  it("folds a previous task's claims into an allowsPreviouslyAcquired task, including auto-completion via cascade", () => {
    const fx = seedBaseFixture();
    const task1 = addTask(fx.tileId, { sortOrder: 0, points: 25 });
    addItem(task1.id, "Cerberus drop");
    const task2 = addTask(fx.tileId, { sortOrder: 1, points: 40, allowsPreviouslyAcquired: true });
    addItem(task2.id, "Cerberus drop", { quantity: 2 });

    const sub1 = submitAndReturn(fx.teamId, task1.id, fx.memberUserId, [{ itemName: "Cerberus drop" }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    // Task 2 needs 2 total; task 1's 1 claim folds in, so 1 more completes it —
    // with no task 2 submission of its own, purely via cascade auto-completion.
    const progressBefore = findProgress(fx.teamId, task2.id);
    expect(progressBefore?.status ?? "not_started").not.toBe("completed");

    const sub1b = submitAndReturn(fx.teamId, task1.id, fx.memberUserId, [{ itemName: "Cerberus drop" }]);
    // task1 doesn't need a 2nd approved submission to stay "completed" — this
    // just adds another approved claim to fold from.
    approveSubmission(db, { submissionId: sub1b.id, reviewedByUserId: fx.modUserId });

    const task2Progress = findProgress(fx.teamId, task2.id)!;
    expect(task2Progress.status).toBe("completed");
    expect(task2Progress.pointsAwarded).toBe(40);
  });

  it("records a completed line once every tile in it is complete, using the line's own points", () => {
    const fx = seedBaseFixture();
    const bingo = db.select().from(schema.bingos).all()[0];

    // Build a full 3x3 board's worth of single-task tiles so row 0 can complete.
    const tileIds: string[] = [fx.tileId];
    for (let col = 1; col < 3; col++) {
      const [t] = db.insert(tiles).values({ bingoId: bingo.id, name: `Tile ${col}`, boardRow: 0, boardCol: col }).returning().all();
      tileIds.push(t.id);
    }
    const [line] = db.insert(bingoLines).values({ bingoId: bingo.id, lineType: "row", lineIndex: 0, points: 42 }).returning().all();
    for (const tid of tileIds) {
      db.insert(bingoLineTiles).values({ bingoLineId: line.id, tileId: tid }).run();
    }

    const taskIds = tileIds.map((tid) => addTask(tid, { sortOrder: 0, points: 10 }).id);
    for (const taskId of taskIds) addItem(taskId, "Proof");

    for (let i = 0; i < taskIds.length; i++) {
      const sub = submitAndReturn(fx.teamId, taskIds[i], fx.memberUserId, [{ itemName: "Proof" }]);
      const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
      if (i < taskIds.length - 1) {
        expect(result.completedLineIds).toEqual([]);
      } else {
        expect(result.completedLineIds).toEqual([line.id]);
      }
    }

    const completedLines = db.select().from(schema.teamCompletedLines).all();
    expect(completedLines).toHaveLength(1);
    expect(completedLines[0].bingoLineId).toBe(line.id);
  });

  it("enforces a wildcard's per-team redemption cap at approval time", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 25 });
    addItem(task.id, "Cerberus drop");
    const [wildcard] = db.insert(tileWildcards).values({ tileId: fx.tileId, itemName: "Cerberus jar", maxRedemptionsPerTeam: 1 }).returning().all();

    const [sub1] = db.insert(submissions).values({ teamId: fx.teamId, taskId: task.id, submittedByUserId: fx.memberUserId, isWildcardRedemption: true, wildcardId: wildcard.id }).returning().all();
    db.insert(submissionItemClaims).values({ submissionId: sub1.id, itemName: "Cerberus drop" }).run();
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    const [sub2] = db.insert(submissions).values({ teamId: fx.teamId, taskId: task.id, submittedByUserId: fx.memberUserId, isWildcardRedemption: true, wildcardId: wildcard.id }).returning().all();
    db.insert(submissionItemClaims).values({ submissionId: sub2.id, itemName: "Cerberus drop" }).run();
    expect(() => approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId })).toThrow(/maximum number of times/);
  });

  it("does not burn a wildcard redemption on a rejected submission", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 25 });
    addItem(task.id, "Cerberus drop");
    const [wildcard] = db.insert(tileWildcards).values({ tileId: fx.tileId, itemName: "Cerberus jar", maxRedemptionsPerTeam: 1 }).returning().all();

    const [sub1] = db.insert(submissions).values({ teamId: fx.teamId, taskId: task.id, submittedByUserId: fx.memberUserId, isWildcardRedemption: true, wildcardId: wildcard.id }).returning().all();
    rejectSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId, reviewerNotes: "not valid" });

    const [sub2] = db.insert(submissions).values({ teamId: fx.teamId, taskId: task.id, submittedByUserId: fx.memberUserId, isWildcardRedemption: true, wildcardId: wildcard.id }).returning().all();
    db.insert(submissionItemClaims).values({ submissionId: sub2.id, itemName: "Cerberus drop" }).run();
    expect(() => approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId })).not.toThrow();
  });

  it("reverts progress to in_progress on rejection when no other pending submissions remain", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 25, minSubmissions: 2 });
    addItem(task.id, "Drop", { optionsGroup: "drop" });
    // Simulate submissionService having already marked the task under review.
    db.insert(teamTaskProgress).values({ teamId: fx.teamId, taskId: task.id, status: "pending_approval" }).run();

    const sub = submitAndReturn(fx.teamId, task.id, fx.memberUserId, [{ itemName: "Drop" }]);
    rejectSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });

    const progress = findProgress(fx.teamId, task.id);
    expect(progress?.status).toBe("in_progress");
  });

  it("does not allow reviewing the same submission twice", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 25 });
    addItem(task.id, "Bruma torch");
    const sub = submitAndReturn(fx.teamId, task.id, fx.memberUserId, [{ itemName: "Bruma torch" }]);
    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
    expect(() => approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId })).toThrow(/already been reviewed/);
  });

  it("requires an explicit taskCompleted decision when approving a manual-scoring task", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 50, scoringMode: "manual" });
    const sub = submitAndReturn(fx.teamId, task.id, fx.memberUserId, []);
    expect(() => approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId })).toThrow(/taskCompleted is required/);
  });

  it("lets a mod directly decide completion and points on a manual-scoring task", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 50, scoringMode: "manual" });
    const sub = submitAndReturn(fx.teamId, task.id, fx.memberUserId, []);

    const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId, taskCompleted: true, pointsAwardedOverride: 35 });
    expect(result.taskCompleted).toBe(true);
    expect(result.pointsAwarded).toBe(35);

    const progress = findProgress(fx.teamId, task.id)!;
    expect(progress.status).toBe("completed");
    expect(progress.pointsAwarded).toBe(35);
  });

  it("approves a manual-scoring submission without completing the task when the mod says it's not done yet", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 50, scoringMode: "manual" });
    const sub = submitAndReturn(fx.teamId, task.id, fx.memberUserId, []);

    const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId, taskCompleted: false });
    expect(result.submission.status).toBe("approved");
    expect(result.taskCompleted).toBe(false);

    const progress = findProgress(fx.teamId, task.id)!;
    expect(progress.status).toBe("in_progress");
  });

  it("still withholds and releases points on a manual task chained with pointsRequirePrevious", () => {
    const fx = seedBaseFixture();
    const task1 = addTask(fx.tileId, { sortOrder: 0, points: 25 });
    addItem(task1.id, "Bruma torch");
    const task2 = addTask(fx.tileId, { sortOrder: 1, points: 50, scoringMode: "manual", pointsRequirePrevious: true });

    const sub2 = submitAndReturn(fx.teamId, task2.id, fx.memberUserId, []);
    const result2 = approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId, taskCompleted: true });
    expect(result2.pointsAwarded).toBe(0);

    const sub1 = submitAndReturn(fx.teamId, task1.id, fx.memberUserId, [{ itemName: "Bruma torch" }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    const progress2 = findProgress(fx.teamId, task2.id)!;
    expect(progress2.status).toBe("completed");
    expect(progress2.pointsAwarded).toBe(50);
  });
});
