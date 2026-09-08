import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoLineTiles, bingoLines, claims, submissions, teamTaskProgress, tiles, tileWildcards } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, type CreateTaskParams } from "./boardService";
import { evaluateNode, getRequirementTree, leafIds, type ApprovedClaim, type EvaluableNode } from "./requirementService";
import { approveSubmission, rejectSubmission } from "./scoringService";

// --- Pure evaluation ---

let nextId = 0;
function node(partial: Partial<EvaluableNode> & { kind: EvaluableNode["kind"] }): EvaluableNode {
  return { id: `n${nextId++}`, minCount: null, quantity: null, distinctItems: false, acceptedItemNames: [], children: [], ...partial };
}
function claim(nodeId: string, itemName: string, quantity = 1, wildcardId: string | null = null): ApprovedClaim {
  return { nodeId, itemName, quantity, wildcardId };
}

describe("evaluateNode (pure)", () => {
  it("ITEM sums claimed quantity against the target, matching names case-insensitively", () => {
    const torch = node({ kind: "ITEM", acceptedItemNames: ["Bruma torch"], quantity: 2 });
    expect(evaluateNode(torch, [claim(torch.id, "bruma torch", 1)])).toBe(false);
    expect(evaluateNode(torch, [claim(torch.id, "bruma torch", 1), claim(torch.id, "Bruma torch", 1)])).toBe(true);
    expect(evaluateNode(torch, [claim(torch.id, "Bruma torch", 2)])).toBe(true);
  });

  it("ITEM ignores claims allocated to other leaves or naming unaccepted items", () => {
    const torch = node({ kind: "ITEM", acceptedItemNames: ["Bruma torch"] });
    expect(evaluateNode(torch, [claim("other", "Bruma torch")])).toBe(false);
    expect(evaluateNode(torch, [claim(torch.id, "Phoenix")])).toBe(false);
  });

  it("ITEM accepts wildcard claims regardless of item name", () => {
    const torch = node({ kind: "ITEM", acceptedItemNames: ["Bruma torch"] });
    expect(evaluateNode(torch, [claim(torch.id, "Cerberus jar", 1, "wc1")])).toBe(true);
  });

  it("ITEM with distinctItems counts unique names instead of quantity", () => {
    const kril = node({ kind: "ITEM", acceptedItemNames: ["Steam battlestaff", "Zamorak hilt"], quantity: 2, distinctItems: true });
    expect(evaluateNode(kril, [claim(kril.id, "Zamorak hilt", 2)])).toBe(false);
    expect(evaluateNode(kril, [claim(kril.id, "Zamorak hilt"), claim(kril.id, "Steam battlestaff")])).toBe(true);
  });

  it("ALL / ANY / COUNT fold their children", () => {
    const a = node({ kind: "ITEM", acceptedItemNames: ["A"] });
    const b = node({ kind: "ITEM", acceptedItemNames: ["B"] });
    const c = node({ kind: "ITEM", acceptedItemNames: ["C"] });
    const onlyA = [claim(a.id, "A")];
    const aAndB = [claim(a.id, "A"), claim(b.id, "B")];

    expect(evaluateNode(node({ kind: "ALL", children: [a, b] }), onlyA)).toBe(false);
    expect(evaluateNode(node({ kind: "ALL", children: [a, b] }), aAndB)).toBe(true);
    expect(evaluateNode(node({ kind: "ANY", children: [a, b] }), onlyA)).toBe(true);
    expect(evaluateNode(node({ kind: "ANY", children: [a, b] }), [])).toBe(false);
    expect(evaluateNode(node({ kind: "COUNT", minCount: 2, children: [a, b, c] }), onlyA)).toBe(false);
    expect(evaluateNode(node({ kind: "COUNT", minCount: 2, children: [a, b, c] }), aAndB)).toBe(true);
  });

  it("nests: ANY of complete sets (Barrows)", () => {
    const hood = node({ kind: "ITEM", acceptedItemNames: ["Ahrim's hood"] });
    const staff = node({ kind: "ITEM", acceptedItemNames: ["Ahrim's staff"] });
    const helm = node({ kind: "ITEM", acceptedItemNames: ["Dharok's helm"] });
    const axe = node({ kind: "ITEM", acceptedItemNames: ["Dharok's greataxe"] });
    const root = node({ kind: "ANY", children: [node({ kind: "ALL", children: [hood, staff] }), node({ kind: "ALL", children: [helm, axe] })] });
    expect(evaluateNode(root, [claim(hood.id, "Ahrim's hood"), claim(helm.id, "Dharok's helm")])).toBe(false);
    expect(evaluateNode(root, [claim(hood.id, "Ahrim's hood"), claim(staff.id, "Ahrim's staff")])).toBe(true);
  });

  it("MANUAL is decided by the mod", () => {
    const manual = node({ kind: "MANUAL" });
    expect(evaluateNode(manual, [])).toBe(false);
    expect(evaluateNode(manual, [], true)).toBe(true);
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

// Creates a task and returns it with its leaf node ids (in tree order).
function addTask(tileId: string, opts: Partial<CreateTaskParams> & { sortOrder: number; points: number }) {
  const task = createTask(db, { tileId, label: `Task ${opts.sortOrder}`, description: "desc", ...opts });
  const leaves = leafIds(getRequirementTree(db, task.id)!);
  return { ...task, leaves };
}

function itemTask(tileId: string, opts: Partial<CreateTaskParams> & { sortOrder: number; points: number }, itemName: string, quantity = 1) {
  return addTask(tileId, { ...opts, requirement: { kind: "ITEM", itemNames: [itemName], quantity } });
}

function submitAndReturn(teamId: string, submittedByUserId: string, claimRows: { nodeId: string; itemName?: string; quantity?: number; wildcardId?: string }[]) {
  const [submission] = db.insert(submissions).values({ teamId, submittedByUserId }).returning().all();
  for (const c of claimRows) {
    db.insert(claims).values({ submissionId: submission.id, nodeId: c.nodeId, itemName: c.itemName ?? null, quantity: c.quantity ?? 1, wildcardId: c.wildcardId ?? null }).run();
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
    const task = itemTask(fx.tileId, { sortOrder: 0, points: 20 }, "Bruma torch");
    const submission = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Bruma torch" }]);

    const result = approveSubmission(db, { submissionId: submission.id, reviewedByUserId: fx.modUserId });

    expect(result.taskIds).toEqual([task.id]);
    expect(result.completedTaskIds).toEqual([task.id]);
    expect(result.pointsAwarded).toBe(20);
    expect(result.submission.status).toBe("approved");

    const progress = findProgress(fx.teamId, task.id);
    expect(progress?.status).toBe("completed");
    expect(progress?.pointsAwarded).toBe(20);
  });

  it("one submission can complete several tasks when its claims span them", () => {
    const fx = seedBaseFixture();
    const task1 = itemTask(fx.tileId, { sortOrder: 0, points: 25 }, "Vorki");
    const task2 = itemTask(fx.tileId, { sortOrder: 1, points: 35 }, "Draconic visage");

    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [
      { nodeId: task1.leaves[0], itemName: "Vorki" },
      { nodeId: task2.leaves[0], itemName: "Draconic visage" },
    ]);
    const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });

    expect(result.completedTaskIds.sort()).toEqual([task1.id, task2.id].sort());
    expect(result.pointsAwarded).toBe(60);
  });

  it("withholds points on a pointsRequirePrevious task until the previous task completes, then releases them", () => {
    const fx = seedBaseFixture();
    const task1 = itemTask(fx.tileId, { sortOrder: 0, points: 25 }, "Vorki");
    const task2 = itemTask(fx.tileId, { sortOrder: 1, points: 35, pointsRequirePrevious: true }, "Draconic visage");

    // Complete task 2 first (out of order) — should complete but withhold points.
    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task2.leaves[0], itemName: "Draconic visage" }]);
    const result2 = approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(result2.completedTaskIds).toEqual([task2.id]);
    expect(result2.pointsAwarded).toBe(0);

    // Now complete task 1 — cascade should release task 2's points.
    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task1.leaves[0], itemName: "Vorki" }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    const progress = findProgress(fx.teamId, task2.id)!;
    expect(progress.status).toBe("completed");
    expect(progress.pointsAwarded).toBe(35);
  });

  it("accumulates claims across submissions and only completes once the target is met", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { sortOrder: 0, points: 40 }, "Cerberus drop", 2);

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Cerberus drop" }]);
    const r1 = approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });
    expect(r1.completedTaskIds).toEqual([]);
    expect(findProgress(fx.teamId, task.id)?.status).toBe("in_progress");

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Cerberus drop" }]);
    const r2 = approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(r2.completedTaskIds).toEqual([task.id]);
    expect(findProgress(fx.teamId, task.id)?.pointsAwarded).toBe(40);
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

    const tasks = tileIds.map((tid) => itemTask(tid, { sortOrder: 0, points: 10 }, "Proof"));

    for (let i = 0; i < tasks.length; i++) {
      const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: tasks[i].leaves[0], itemName: "Proof" }]);
      const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
      if (i < tasks.length - 1) {
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
    const task = itemTask(fx.tileId, { sortOrder: 0, points: 25 }, "Cerberus drop", 2);
    const [wildcard] = db.insert(tileWildcards).values({ tileId: fx.tileId, itemName: "Cerberus jar", maxRedemptionsPerTeam: 1 }).returning().all();

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Cerberus jar", wildcardId: wildcard.id }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Cerberus jar", wildcardId: wildcard.id }]);
    expect(() => approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId })).toThrow(/maximum number of times/);
  });

  it("does not burn a wildcard redemption on a rejected submission", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { sortOrder: 0, points: 25 }, "Cerberus drop");
    const [wildcard] = db.insert(tileWildcards).values({ tileId: fx.tileId, itemName: "Cerberus jar", maxRedemptionsPerTeam: 1 }).returning().all();

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Cerberus jar", wildcardId: wildcard.id }]);
    rejectSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId, reviewerNotes: "not valid" });

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Cerberus jar", wildcardId: wildcard.id }]);
    expect(() => approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId })).not.toThrow();
  });

  it("recomputes progress status on rejection from what remains for each touched task", () => {
    const fx = seedBaseFixture();
    const task1 = itemTask(fx.tileId, { sortOrder: 0, points: 25 }, "Drop", 2);
    const task2 = itemTask(fx.tileId, { sortOrder: 1, points: 25 }, "Other");

    // task1 has an approved claim (in_progress); task2 has nothing else.
    const approved = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task1.leaves[0], itemName: "Drop" }]);
    approveSubmission(db, { submissionId: approved.id, reviewedByUserId: fx.modUserId });
    // Simulate submissionService having marked both tasks under review.
    db.update(teamTaskProgress).set({ status: "pending_approval" }).run();
    db.insert(teamTaskProgress).values({ teamId: fx.teamId, taskId: task2.id, status: "pending_approval" }).run();

    const rejected = submitAndReturn(fx.teamId, fx.memberUserId, [
      { nodeId: task1.leaves[0], itemName: "Drop" },
      { nodeId: task2.leaves[0], itemName: "Other" },
    ]);
    const result = rejectSubmission(db, { submissionId: rejected.id, reviewedByUserId: fx.modUserId });

    expect(result.taskIds.sort()).toEqual([task1.id, task2.id].sort());
    expect(findProgress(fx.teamId, task1.id)?.status).toBe("in_progress");
    expect(findProgress(fx.teamId, task2.id)?.status).toBe("not_started");
  });

  it("keeps a task pending_approval on rejection while another submission for it is still pending", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { sortOrder: 0, points: 25 }, "Drop");
    db.insert(teamTaskProgress).values({ teamId: fx.teamId, taskId: task.id, status: "pending_approval" }).run();

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Drop" }]);
    submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Drop" }]);
    rejectSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    expect(findProgress(fx.teamId, task.id)?.status).toBe("pending_approval");
  });

  it("does not allow reviewing the same submission twice", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { sortOrder: 0, points: 25 }, "Bruma torch");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0], itemName: "Bruma torch" }]);
    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
    expect(() => approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId })).toThrow(/already been reviewed/);
  });

  it("requires an explicit taskCompleted decision when approving a manual-scoring task", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 50, scoringMode: "manual" });
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0] }]);
    expect(() => approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId })).toThrow(/taskCompleted is required/);
  });

  it("lets a mod directly decide completion and points on a manual-scoring task", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 50, scoringMode: "manual" });
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0] }]);

    const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId, taskCompleted: true, pointsAwardedOverride: 35 });
    expect(result.completedTaskIds).toEqual([task.id]);
    expect(result.pointsAwarded).toBe(35);

    const progress = findProgress(fx.teamId, task.id)!;
    expect(progress.status).toBe("completed");
    expect(progress.pointsAwarded).toBe(35);
  });

  it("approves a manual-scoring submission without completing the task when the mod says it's not done yet", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { sortOrder: 0, points: 50, scoringMode: "manual" });
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.leaves[0] }]);

    const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId, taskCompleted: false });
    expect(result.submission.status).toBe("approved");
    expect(result.completedTaskIds).toEqual([]);

    const progress = findProgress(fx.teamId, task.id)!;
    expect(progress.status).toBe("in_progress");
  });

  it("still withholds and releases points on a manual task chained with pointsRequirePrevious", () => {
    const fx = seedBaseFixture();
    const task1 = itemTask(fx.tileId, { sortOrder: 0, points: 25 }, "Bruma torch");
    const task2 = addTask(fx.tileId, { sortOrder: 1, points: 50, scoringMode: "manual", pointsRequirePrevious: true });

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task2.leaves[0] }]);
    const result2 = approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId, taskCompleted: true });
    expect(result2.pointsAwarded).toBe(0);

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task1.leaves[0], itemName: "Bruma torch" }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    const progress2 = findProgress(fx.teamId, task2.id)!;
    expect(progress2.status).toBe("completed");
    expect(progress2.pointsAwarded).toBe(50);
  });
});
