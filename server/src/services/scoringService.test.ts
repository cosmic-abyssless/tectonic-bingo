import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNodeInput } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, submissions } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTile, createTask, deleteLine, deleteTask, deleteTile, generateLines, updateLinePoints, updateNode, updateTileBonusPoints } from "./boardService";
import { approveSubmission, rejectSubmission, rescoreBingo, undoSubmissionReview } from "./scoringService";
import { ServiceError } from "./errors";

// Pure engine evaluation (evaluateGraph/awardedPoints) is covered by
// engine.test.ts. These are integration tests against a real migrated
// in-memory DB, exercising approveSubmission/rejectSubmission end to end.

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

interface Fixture {
  teamId: string;
  modUserId: string;
  memberUserId: string;
  tileId: string;
  tileNodeId: string;
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
  const tile = createTile(db, { bingoId: bingo.id, name: "Test Tile", boardRow: 0, boardCol: 0 });
  return { teamId: team.id, modUserId: admin.id, memberUserId: member.id, tileId: tile.id, tileNodeId: tile.nodeId };
}

// A task that's a bare leaf, so its own node id is the leaf id.
function addTask(tileId: string, input: GraphNodeInput) {
  return createTask(db, tileId, { label: "Task", description: "desc", ...input });
}
function itemTask(tileId: string, opts: { points: number; pointsGateNodeId?: string; submitGateNodeId?: string }, itemName: string) {
  return addTask(tileId, { kind: "ITEM", itemName, ...opts });
}
// A SUM(quantity) over one named leaf — for "N of one exact item" cases.
// Returns the task tree; submit claims against `.children[0].id`, not the
// task's own id (which is the SUM node).
function sumTask(tileId: string, opts: { points: number; pointsGateNodeId?: string; submitGateNodeId?: string }, itemName: string, quantity: number) {
  return addTask(tileId, { kind: "SUM", quantity, children: [{ kind: "ITEM", itemName }], ...opts });
}
function manualTask(tileId: string, opts: { points: number; pointsGateNodeId?: string; submitGateNodeId?: string }) {
  return addTask(tileId, { kind: "MANUAL", ...opts });
}

// Bypasses submissionService's validation to insert a raw submission/claims
// directly — these tests target scoringService in isolation.
function submitAndReturn(teamId: string, submittedByUserId: string, claimRows: { nodeId: string; itemName?: string; quantity?: number }[]) {
  const [submission] = db.insert(submissions).values({ teamId, submittedByUserId }).returning().all();
  for (const c of claimRows) {
    db.insert(claims).values({ submissionId: submission.id, nodeId: c.nodeId, itemName: c.itemName ?? null, quantity: c.quantity ?? 1 }).run();
  }
  return submission;
}

function findState(teamId: string, nodeId: string) {
  return db.select().from(schema.teamNodeState).all().find((s) => s.teamId === teamId && s.nodeId === nodeId);
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});

afterEach(() => {
  sqlite.close();
});

describe("approveSubmission", () => {
  it("completes a simple single-task tile and awards points — completing the only task also completes the tile", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 20 }, "Bruma torch");
    const submission = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]);

    const result = approveSubmission(db, { submissionId: submission.id, reviewedByUserId: fx.modUserId });

    expect(result.nodeIds).toEqual([task.id]);
    expect(result.newlyCompletedNodeIds.sort()).toEqual([task.id, fx.tileNodeId].sort());
    expect(result.pointsDelta).toBe(20); // the tile's own ALL node carries 0 points
    expect(result.submission.status).toBe("approved");

    const state = findState(fx.teamId, task.id);
    expect(state?.pointsAwarded).toBe(20);
  });

  it("one submission can complete several tasks when its claims span them", () => {
    const fx = seedBaseFixture();
    const task1 = itemTask(fx.tileId, { points: 25 }, "Vorki");
    const task2 = itemTask(fx.tileId, { points: 35 }, "Draconic visage");

    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [
      { nodeId: task1.id, itemName: "Vorki" },
      { nodeId: task2.id, itemName: "Draconic visage" },
    ]);
    const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });

    expect(result.newlyCompletedNodeIds.sort()).toEqual([task1.id, task2.id, fx.tileNodeId].sort());
    expect(result.pointsDelta).toBe(60);
  });

  it("awards a full-tile bonus once every task completes, the same generic way a line does", () => {
    const fx = seedBaseFixture();
    updateTileBonusPoints(db, fx.tileId, 50);
    const task1 = itemTask(fx.tileId, { points: 25 }, "Vorki");
    const task2 = itemTask(fx.tileId, { points: 35 }, "Draconic visage");

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task1.id, itemName: "Vorki" }]);
    const first = approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });
    expect(first.newlyCompletedNodeIds).toEqual([task1.id]); // tile still incomplete — bonus withheld
    expect(first.pointsDelta).toBe(25);

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task2.id, itemName: "Draconic visage" }]);
    const second = approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(second.newlyCompletedNodeIds.sort()).toEqual([task2.id, fx.tileNodeId].sort());
    expect(second.pointsDelta).toBe(35 + 50);

    expect(findState(fx.teamId, fx.tileNodeId)?.pointsAwarded).toBe(50);
  });

  it("withholds points on a pointsGateNodeId task until the gate completes, then releases them with no special-case code", () => {
    const fx = seedBaseFixture();
    const task1 = itemTask(fx.tileId, { points: 25 }, "Vorki");
    const task2 = itemTask(fx.tileId, { points: 35, pointsGateNodeId: task1.id }, "Draconic visage");

    // Complete task 2 first (out of order) — it completes but its points are withheld.
    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task2.id, itemName: "Draconic visage" }]);
    const result2 = approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(result2.newlyCompletedNodeIds).toEqual([task2.id]); // tile isn't complete yet (task1 still incomplete)
    expect(result2.pointsDelta).toBe(0);
    expect(findState(fx.teamId, task2.id)?.pointsAwarded).toBe(0);

    // Completing task1 completes the tile too, and releases task2's points —
    // a plain recompute, not a "release the next task" special case.
    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task1.id, itemName: "Vorki" }]);
    const result1 = approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });
    expect(result1.pointsDelta).toBe(60); // task1's 25 + task2's newly-released 35

    expect(findState(fx.teamId, task2.id)?.pointsAwarded).toBe(35);
  });

  it("accumulates claims across submissions and only completes once the SUM's target is met", () => {
    const fx = seedBaseFixture();
    const task = sumTask(fx.tileId, { points: 40 }, "Cerberus drop", 2);
    const leafId = task.children[0]!.id;

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: leafId, itemName: "Cerberus drop" }]);
    const r1 = approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });
    // The leaf itself completes on any claim (pure presence) — it's the
    // wrapping SUM whose own target (2) isn't met yet.
    expect(r1.newlyCompletedNodeIds).toEqual([leafId]);
    expect(findState(fx.teamId, task.id)).toBeUndefined();

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: leafId, itemName: "Cerberus drop" }]);
    const r2 = approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(r2.newlyCompletedNodeIds).toContain(task.id);
    expect(findState(fx.teamId, task.id)?.pointsAwarded).toBe(40);
  });

  it("records a completed line once every tile in it is complete, using the line's own points", () => {
    const fx = seedBaseFixture();
    const bingo = db.select().from(schema.bingos).all()[0]!;
    const tileIds: string[] = [fx.tileId];
    for (let col = 1; col < 3; col++) {
      tileIds.push(createTile(db, { bingoId: bingo.id, name: `Tile ${col}`, boardRow: 0, boardCol: col }).id);
    }
    const line = generateLines(db, bingo, 42).find((l) => l.lineType === "row" && l.lineIndex === 0)!;
    const tasks = tileIds.map((tid) => itemTask(tid, { points: 10 }, "Proof"));

    for (let i = 0; i < tasks.length; i++) {
      const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: tasks[i]!.id, itemName: "Proof" }]);
      const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
      if (i < tasks.length - 1) {
        expect(result.newlyCompletedNodeIds).not.toContain(line.nodeId);
      } else {
        expect(result.newlyCompletedNodeIds).toContain(line.nodeId);
      }
    }

    expect(findState(fx.teamId, line.nodeId)?.pointsAwarded).toBe(42);
  });

  it("does not allow reviewing the same submission twice", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 25 }, "Bruma torch");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]);
    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
    expect(() => approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId })).toThrow(/already been reviewed/);
    expect(() => rejectSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId })).toThrow(/already been reviewed/);
  });
});

describe("rejectSubmission", () => {
  it("flips status to rejected without touching teamNodeState — a pending submission's claims never counted", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 25 }, "Drop");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Drop" }]);

    const result = rejectSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId, reviewerNotes: "nope" });

    expect(result.submission.status).toBe("rejected");
    expect(result.nodeIds).toEqual([task.id]);
    expect(db.select().from(schema.teamNodeState).all()).toHaveLength(0);
  });
});

describe("audit trail", () => {
  it("approveSubmission records submission.approved with the tile/task labels and pointsDelta", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 20 }, "Bruma torch");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]);

    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });

    const row = db.select().from(schema.auditLog).all().find((r) => r.action === "submission.approved")!;
    expect(row.teamId).toBe(fx.teamId);
    const details = JSON.parse(row.details);
    expect(details.tileName).toBe("Test Tile");
    expect(details.taskLabels).toEqual(["Task"]);
    expect(details.pointsDelta).toBe(20);
    expect(details.submittedByUserId).toBe(fx.memberUserId);
  });

  it("rejectSubmission records submission.rejected with the reviewer's notes", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 25 }, "Drop");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Drop" }]);

    rejectSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId, reviewerNotes: "not visible" });

    const rows = db.select().from(schema.auditLog).all().filter((r) => r.action === "submission.rejected");
    expect(rows).toHaveLength(1);
    const details = JSON.parse(rows[0]!.details);
    expect(details.reviewerNotes).toBe("not visible");
    expect(details).not.toHaveProperty("pointsDelta");
  });
});

describe("undoSubmissionReview", () => {
  function teamPoints(teamId: string) {
    return db
      .select()
      .from(schema.teamNodeState)
      .all()
      .filter((s) => s.teamId === teamId)
      .reduce((sum, s) => sum + s.pointsAwarded, 0);
  }

  it("sends an approved submission back to pending, clears the review, and takes the points back", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 20 }, "Bruma torch");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]);
    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId, reviewerNotes: "gg" });
    expect(teamPoints(fx.teamId)).toBe(20);

    const result = undoSubmissionReview(db, { submissionId: sub.id, undoneByUserId: fx.modUserId });

    expect(result.previousStatus).toBe("approved");
    expect(result.submission.status).toBe("pending");
    expect(result.submission.reviewedAt).toBeNull();
    expect(result.submission.reviewedByUserId).toBeNull();
    expect(result.submission.reviewerNotes).toBeNull();
    expect(result.nodeIds).toEqual([task.id]);
    // Both the task and the tile's own ALL node were complete; neither is now.
    expect(result.uncompletedNodeIds.sort()).toEqual([task.id, fx.tileNodeId].sort());
    expect(result.pointsDelta).toBe(-20);
    expect(db.select().from(schema.teamNodeState).all()).toHaveLength(0);
  });

  it("undoing a rejection is a pure status flip — nothing was ever scored", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 20 }, "Drop");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Drop" }]);
    rejectSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId, reviewerNotes: "no codeword" });

    const result = undoSubmissionReview(db, { submissionId: sub.id, undoneByUserId: fx.modUserId });

    expect(result.previousStatus).toBe("rejected");
    expect(result.submission.status).toBe("pending");
    expect(result.submission.reviewerNotes).toBeNull();
    expect(result.uncompletedNodeIds).toEqual([]);
    expect(result.pointsDelta).toBe(0);
    expect(db.select().from(schema.teamNodeState).all()).toHaveLength(0);
  });

  it("refuses a submission that is still pending, including one already undone", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 20 }, "Drop");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Drop" }]);
    expect(() => undoSubmissionReview(db, { submissionId: sub.id, undoneByUserId: fx.modUserId })).toThrow(/not been reviewed/);

    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
    undoSubmissionReview(db, { submissionId: sub.id, undoneByUserId: fx.modUserId });
    expect(() => undoSubmissionReview(db, { submissionId: sub.id, undoneByUserId: fx.modUserId })).toThrow(/not been reviewed/);
    expect(() => undoSubmissionReview(db, { submissionId: "nope", undoneByUserId: fx.modUserId })).toThrow(/not found/);
  });

  it("an undone submission can be reviewed again, and re-approving awards the points again exactly once", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 20 }, "Drop");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Drop" }]);
    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
    undoSubmissionReview(db, { submissionId: sub.id, undoneByUserId: fx.modUserId });

    const rejected = rejectSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
    expect(rejected.submission.status).toBe("rejected");
    expect(teamPoints(fx.teamId)).toBe(0);

    undoSubmissionReview(db, { submissionId: sub.id, undoneByUserId: fx.modUserId });
    const approved = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
    expect(approved.pointsDelta).toBe(20);
    expect(approved.newlyCompletedNodeIds).toContain(task.id);
    expect(teamPoints(fx.teamId)).toBe(20);
  });

  it("undoing one of two SUM contributions drops the SUM below target while the other claim still counts", () => {
    const fx = seedBaseFixture();
    const task = sumTask(fx.tileId, { points: 40 }, "Cerberus drop", 2);
    const leafId = task.children[0]!.id;
    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: leafId, itemName: "Cerberus drop" }]);
    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: leafId, itemName: "Cerberus drop" }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });
    approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(findState(fx.teamId, task.id)?.pointsAwarded).toBe(40);

    const result = undoSubmissionReview(db, { submissionId: sub1.id, undoneByUserId: fx.modUserId });

    expect(result.pointsDelta).toBe(-40);
    expect(result.uncompletedNodeIds).toContain(task.id);
    expect(result.uncompletedNodeIds).not.toContain(leafId); // sub2's claim keeps the leaf itself complete
    expect(findState(fx.teamId, task.id)).toBeUndefined();
    expect(findState(fx.teamId, leafId)).toBeDefined();
  });

  it("undoing the gate's approval withholds the gated task's points again without un-completing it", () => {
    const fx = seedBaseFixture();
    const task1 = itemTask(fx.tileId, { points: 25 }, "Vorki");
    const task2 = itemTask(fx.tileId, { points: 35, pointsGateNodeId: task1.id }, "Draconic visage");
    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task1.id, itemName: "Vorki" }]);
    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task2.id, itemName: "Draconic visage" }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });
    approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(teamPoints(fx.teamId)).toBe(60);

    const result = undoSubmissionReview(db, { submissionId: sub1.id, undoneByUserId: fx.modUserId });

    expect(result.uncompletedNodeIds.sort()).toEqual([task1.id, fx.tileNodeId].sort());
    expect(result.pointsDelta).toBe(-60); // task1's 25 plus task2's now-withheld 35
    expect(findState(fx.teamId, task2.id)?.pointsAwarded).toBe(0);
    expect(teamPoints(fx.teamId)).toBe(0);
  });

  it("breaking a completed line takes the line bonus back along with the task", () => {
    const fx = seedBaseFixture();
    const bingo = db.select().from(schema.bingos).all()[0]!;
    const tileIds = [fx.tileId, ...[1, 2].map((col) => createTile(db, { bingoId: bingo.id, name: `Tile ${col}`, boardRow: 0, boardCol: col }).id)];
    // Only row 0 has tiles, so besides the row line, column 1's line holds
    // just tile 1 and completes/breaks with it — the other columns and both
    // diagonals stay complete throughout.
    const lines = generateLines(db, bingo, 42);
    const row = lines.find((l) => l.lineType === "row" && l.lineIndex === 0)!;
    const column1 = lines.find((l) => l.lineType === "column" && l.lineIndex === 1)!;
    const subs = tileIds.map((tid) => {
      const task = itemTask(tid, { points: 10 }, "Proof");
      return submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Proof" }]);
    });
    for (const sub of subs) approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });
    expect(findState(fx.teamId, row.nodeId)?.pointsAwarded).toBe(42);
    const before = teamPoints(fx.teamId);

    const result = undoSubmissionReview(db, { submissionId: subs[1]!.id, undoneByUserId: fx.modUserId });

    expect(result.uncompletedNodeIds).toContain(row.nodeId);
    expect(result.uncompletedNodeIds).toContain(column1.nodeId);
    expect(result.pointsDelta).toBe(-(10 + 42 + 42));
    expect(findState(fx.teamId, row.nodeId)).toBeUndefined();
    expect(teamPoints(fx.teamId)).toBe(before - 94);
  });

  it("takes a full-tile bonus back when the undo leaves the tile incomplete", () => {
    const fx = seedBaseFixture();
    updateTileBonusPoints(db, fx.tileId, 50);
    const task1 = itemTask(fx.tileId, { points: 25 }, "Vorki");
    const task2 = itemTask(fx.tileId, { points: 35 }, "Draconic visage");
    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task1.id, itemName: "Vorki" }]);
    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task2.id, itemName: "Draconic visage" }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });
    approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(teamPoints(fx.teamId)).toBe(25 + 35 + 50);

    const result = undoSubmissionReview(db, { submissionId: sub2.id, undoneByUserId: fx.modUserId });

    expect(result.uncompletedNodeIds.sort()).toEqual([task2.id, fx.tileNodeId].sort());
    expect(result.pointsDelta).toBe(-(35 + 50));
    expect(findState(fx.teamId, fx.tileNodeId)).toBeUndefined();
    expect(findState(fx.teamId, task1.id)?.pointsAwarded).toBe(25);
  });

  it("only recomputes the submitting team — another team's state is untouched", () => {
    const fx = seedBaseFixture();
    const bingo = db.select().from(schema.bingos).all()[0]!;
    const [captainB] = db.insert(schema.users).values({ discordId: "captain-b", discordUsername: "captain_b" }).returning().all();
    const [teamB] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captainB.id, name: "Team B", codeword: "other-word" }).returning().all();
    const task = itemTask(fx.tileId, { points: 20 }, "Drop");
    const subA = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Drop" }]);
    const subB = submitAndReturn(teamB.id, captainB.id, [{ nodeId: task.id, itemName: "Drop" }]);
    approveSubmission(db, { submissionId: subA.id, reviewedByUserId: fx.modUserId });
    approveSubmission(db, { submissionId: subB.id, reviewedByUserId: fx.modUserId });

    undoSubmissionReview(db, { submissionId: subA.id, undoneByUserId: fx.modUserId });

    expect(teamPoints(fx.teamId)).toBe(0);
    expect(teamPoints(teamB.id)).toBe(20);
    expect(findState(teamB.id, task.id)?.pointsAwarded).toBe(20);
  });

  it("records submission.review_undone with the previous decision, what got un-completed, and the points lost", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 20 }, "Bruma torch");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]);
    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId, reviewerNotes: "looks good" });

    undoSubmissionReview(db, { submissionId: sub.id, undoneByUserId: fx.modUserId });

    const rows = db.select().from(schema.auditLog).all().filter((r) => r.action === "submission.review_undone");
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.teamId).toBe(fx.teamId);
    expect(row.actorUserId).toBe(fx.modUserId);
    expect(row.entityId).toBe(sub.id);
    const details = JSON.parse(row.details);
    expect(details).toMatchObject({
      tileName: "Test Tile",
      taskLabels: ["Task"],
      nodeIds: [task.id],
      previousStatus: "approved",
      previousReviewerNotes: "looks good",
      previousReviewedByUserId: fx.modUserId,
      pointsDelta: -20,
      submittedByUserId: fx.memberUserId,
    });
    expect(details.uncompletedNodeIds.sort()).toEqual([task.id, fx.tileNodeId].sort());
  });
});

describe("MANUAL leaves — approving IS the completion decision, no separate flag", () => {
  it("completes once its claim is approved", () => {
    const fx = seedBaseFixture();
    const task = manualTask(fx.tileId, { points: 50 });
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id }]);

    const result = approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });

    expect(result.newlyCompletedNodeIds).toContain(task.id);
    expect(findState(fx.teamId, task.id)?.pointsAwarded).toBe(50);
  });

  it("rejecting a submission that touches a MANUAL leaf does not complete it — that IS the 'not done' decision", () => {
    const fx = seedBaseFixture();
    const task = manualTask(fx.tileId, { points: 50 });
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id }]);

    rejectSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });

    expect(findState(fx.teamId, task.id)).toBeUndefined();
  });

  it("still withholds and releases points on a manual leaf chained with a points gate", () => {
    const fx = seedBaseFixture();
    const task1 = itemTask(fx.tileId, { points: 25 }, "Bruma torch");
    const task2 = manualTask(fx.tileId, { points: 50, pointsGateNodeId: task1.id });

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task2.id }]);
    const result2 = approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId });
    expect(result2.pointsDelta).toBe(0);

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task1.id, itemName: "Bruma torch" }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    expect(findState(fx.teamId, task2.id)?.pointsAwarded).toBe(50);
  });
});

// The board can be edited while the bingo is live (issue #84). A team's score is a snapshot taken when a
// submission is reviewed, so every such edit is followed by rescoreBingo, and what teams have already
// submitted proof for can't be removed out from under them.
describe("editing the board after teams have progress", () => {
  const totalPoints = (teamId: string) =>
    db.select().from(schema.teamNodeState).all().filter((s) => s.teamId === teamId).reduce((sum, s) => sum + s.pointsAwarded, 0);

  function completedTask(points = 20) {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points }, "Bruma torch");
    approveSubmission(db, { submissionId: submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]).id, reviewedByUserId: fx.modUserId });
    return { fx, task };
  }

  it("re-scores every team when a task's points change", () => {
    const { fx, task } = completedTask(20);
    const [other] = db.insert(schema.teams).values({ bingoId: db.select().from(schema.bingos).get()!.id, captainUserId: fx.memberUserId, name: "Team B", codeword: "b-word" }).returning().all();
    approveSubmission(db, { submissionId: submitAndReturn(other.id, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]).id, reviewedByUserId: fx.modUserId });
    expect(totalPoints(fx.teamId)).toBe(20);

    updateNode(db, task.id, { kind: "ITEM", itemName: "Bruma torch", label: "Task", description: "desc", points: 35 });
    expect(totalPoints(fx.teamId)).toBe(20); // stale until re-scored: the snapshot is only rebuilt on request
    rescoreBingo(db, db.select().from(schema.bingos).get()!.id);

    expect(totalPoints(fx.teamId)).toBe(35);
    expect(totalPoints(other.id)).toBe(35);
  });

  it("applies a new full-tile bonus or line bonus to teams that already completed the tile", () => {
    const { fx } = completedTask(20);
    const bingoId = db.select().from(schema.bingos).get()!.id;

    updateTileBonusPoints(db, fx.tileId, 50);
    rescoreBingo(db, bingoId);
    expect(totalPoints(fx.teamId)).toBe(70);

    updateTileBonusPoints(db, fx.tileId, 0);
    rescoreBingo(db, bingoId);
    expect(totalPoints(fx.teamId)).toBe(20);
  });

  it("un-completes a tile for a team when a new requirement is added to it", () => {
    const { fx } = completedTask(20);
    const bingoId = db.select().from(schema.bingos).get()!.id;
    expect(findState(fx.teamId, fx.tileNodeId)).toBeDefined();

    itemTask(fx.tileId, { points: 10 }, "Dragon pickaxe");
    rescoreBingo(db, bingoId);

    expect(findState(fx.teamId, fx.tileNodeId)).toBeUndefined();
    expect(totalPoints(fx.teamId)).toBe(20); // what they had earned stays; the new task is open
  });

  it("refuses to delete a task that teams have submitted proof for, and changes nothing", () => {
    const { fx, task } = completedTask(20);

    expect(() => deleteTask(db, task.id)).toThrowError(ServiceError);
    expect(() => deleteTask(db, task.id)).toThrow(/Can't remove/);
    expect(() => deleteTile(db, fx.tileId)).toThrow(/Can't remove/);

    expect(db.select().from(schema.nodes).all().some((n) => n.id === task.id)).toBe(true);
    expect(db.select().from(schema.tiles).all()).toHaveLength(1);
    expect(findState(fx.teamId, task.id)?.pointsAwarded).toBe(20);
  });

  it("refuses an edit that would drop a claimed requirement, and leaves the task as it was", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { kind: "ALL", points: 20, children: [{ kind: "ITEM", itemName: "Vorki" }, { kind: "ITEM", itemName: "Visage" }] });
    const vorki = task.children[0];
    approveSubmission(db, { submissionId: submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: vorki.id, itemName: "Vorki" }]).id, reviewedByUserId: fx.modUserId });

    const visage = task.children[1];
    // Keeping only the other item drops the one teams claimed against.
    expect(() => updateNode(db, task.id, { kind: "ALL", label: "Task", description: "desc", points: 20, children: [{ id: visage.id, kind: "ITEM", itemName: "Visage" }] })).toThrow(/Vorki/);
    expect(db.select().from(schema.nodes).all().some((n) => n.id === vorki.id)).toBe(true);
    expect(db.select().from(schema.claims).all()).toHaveLength(1);

    // Editing it in place (children named by id, as the editor sends them; new points) is fine.
    updateNode(db, task.id, { kind: "ALL", label: "Task", description: "desc", points: 30, children: [{ id: vorki.id, kind: "ITEM", itemName: "Vorki" }, { id: visage.id, kind: "ITEM", itemName: "Visage" }] });
    expect(db.select().from(schema.claims).all()).toHaveLength(1);
  });

  it("refuses to change what a claimed requirement asks for, but allows the same change on an unclaimed one", () => {
    const fx = seedBaseFixture();
    const task = addTask(fx.tileId, { kind: "ALL", points: 20, children: [{ kind: "ITEM", itemName: "Vorki" }, { kind: "ITEM", itemName: "Visage" }] });
    const [vorki, visage] = task.children;
    approveSubmission(db, { submissionId: submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: vorki.id, itemName: "Vorki" }]).id, reviewedByUserId: fx.modUserId });
    const tree = (children: GraphNodeInput[]) => ({ kind: "ALL" as const, label: "Task", description: "desc", points: 20, children });

    // Another item under the claimed id, or another kind: old proof would count toward the new ask.
    expect(() => updateNode(db, task.id, tree([{ id: vorki.id, kind: "ITEM", itemName: "Dragon pickaxe" }, { id: visage.id, kind: "ITEM", itemName: "Visage" }]))).toThrow(/Can't change "Vorki"/);
    expect(() => updateNode(db, task.id, tree([{ id: vorki.id, kind: "MANUAL", label: "Vorki" }, { id: visage.id, kind: "ITEM", itemName: "Visage" }]))).toThrow(/Can't change/);
    expect(db.select().from(schema.nodes).all().find((n) => n.id === vorki.id)?.itemName).toBe("Vorki");

    // The unclaimed sibling can change freely.
    updateNode(db, task.id, tree([{ id: vorki.id, kind: "ITEM", itemName: "Vorki" }, { id: visage.id, kind: "ITEM", itemName: "Dragon pickaxe" }]));
    expect(db.select().from(schema.nodes).all().find((n) => n.id === visage.id)?.itemName).toBe("Dragon pickaxe");
  });

  it("keeps a line from counting as complete once a tile is added to it, and counts it again if that tile goes", () => {
    const fx = seedBaseFixture(); // tile at (0,0) on a 3x3 board
    const bingo = db.select().from(schema.bingos).get()!;
    const t01 = createTile(db, { bingoId: bingo.id, name: "T01", boardRow: 0, boardCol: 1 });
    generateLines(db, bingo, 15);
    for (const [tileId, item] of [[fx.tileId, "Vorki"], [t01.id, "Visage"]] as const) {
      const task = itemTask(tileId, { points: 10 }, item);
      approveSubmission(db, { submissionId: submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: item }]).id, reviewedByUserId: fx.modUserId });
    }
    const row0 = db.select().from(schema.bingoLines).all().find((l) => l.lineType === "row" && l.lineIndex === 0)!;
    expect(findState(fx.teamId, row0.nodeId)?.pointsAwarded).toBe(15);

    const t02 = createTile(db, { bingoId: bingo.id, name: "T02", boardRow: 0, boardCol: 2 });
    itemTask(t02.id, { points: 10 }, "Dragon pickaxe");
    rescoreBingo(db, bingo.id);
    expect(findState(fx.teamId, row0.nodeId)).toBeUndefined();

    deleteTile(db, t02.id);
    rescoreBingo(db, bingo.id);
    expect(findState(fx.teamId, row0.nodeId)?.pointsAwarded).toBe(15);
  });

  it("deletes an unclaimed task, its team state, and the raised hands on it, then re-scores", () => {
    const { fx } = completedTask(20);
    const open = itemTask(fx.tileId, { points: 10 }, "Dragon pickaxe");
    const tile = db.select().from(schema.tiles).get()!;
    db.insert(schema.tileInterests).values({ tileId: tile.id, taskId: open.id, userId: fx.memberUserId, teamId: fx.teamId }).run();
    const bingoId = db.select().from(schema.bingos).get()!.id;

    deleteTask(db, open.id);
    rescoreBingo(db, bingoId);

    expect(db.select().from(schema.tileInterests).all()).toHaveLength(0);
    expect(findState(fx.teamId, open.id)).toBeUndefined();
    expect(findState(fx.teamId, fx.tileNodeId)).toBeDefined(); // the tile is complete again with only the claimed task left
  });

  it("re-scores a line bonus edit and removal", () => {
    const fx = seedBaseFixture();
    const bingo = db.select().from(schema.bingos).get()!;
    const lines = generateLines(db, bingo, 15);
    const task = itemTask(fx.tileId, { points: 20 }, "Bruma torch");
    approveSubmission(db, { submissionId: submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]).id, reviewedByUserId: fx.modUserId });
    // Lines are built from the tiles that exist, so the one tile completes every line that passes through it.
    const done = lines.filter((l) => findState(fx.teamId, l.nodeId));
    expect(done.length).toBeGreaterThan(1);
    const before = totalPoints(fx.teamId);

    updateLinePoints(db, done[0].id, 40);
    rescoreBingo(db, bingo.id);
    expect(totalPoints(fx.teamId)).toBe(before + 25);

    deleteLine(db, done[1].id);
    rescoreBingo(db, bingo.id);
    expect(totalPoints(fx.teamId)).toBe(before + 25 - 15);
  });
});

// Scoring is recorded apart from the approval itself: one points.earned / points.lost row per node
// whose awarded points changed, naming what kind of points it was.
describe("points audit entries", () => {
  const auditRows = () => db.select().from(schema.auditLog).all().sort((a, b) => a.id - b.id);
  const pointRows = (action: "points.earned" | "points.lost") =>
    auditRows().filter((r) => r.action === action).map((r) => ({ id: r.id, teamId: r.teamId, ...JSON.parse(r.details) }));
  const bingoOf = () => db.select().from(schema.bingos).get()!;

  it("approving records each kind of points as its own entry, after the approval row", () => {
    const fx = seedBaseFixture();
    updateTileBonusPoints(db, fx.tileId, 50);
    generateLines(db, bingoOf(), 15); // on this 3x3 board a lone tile completes row 0, column 0 and one diagonal
    const task = itemTask(fx.tileId, { points: 20 }, "Bruma torch");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]);

    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });

    const earned = pointRows("points.earned");
    expect(earned.map((e) => [e.source, e.nodeLabel, e.points])).toEqual([
      ["task", "Task", 20],
      ["tile_bonus", "Test Tile", 50],
      ["line", "Row 1", 15],
      ["line", "Column 1", 15],
      ["line", "Diagonal 1", 15],
    ]);
    expect(earned[0]).toMatchObject({ tileName: "Test Tile", submissionId: sub.id, teamId: fx.teamId });
    expect(earned[2]!.tileName).toBeNull();
    const approvedId = auditRows().find((r) => r.action === "submission.approved")!.id;
    expect(earned.every((e) => e.id > approvedId)).toBe(true);
    expect(pointRows("points.lost")).toHaveLength(0);
    expect(JSON.parse(auditRows().find((r) => r.action === "submission.approved")!.details).pointsDelta).toBe(20 + 50 + 45);
  });

  it("writes nothing while points are withheld, then a row for both the gate's points and the released ones", () => {
    const fx = seedBaseFixture();
    const gate = itemTask(fx.tileId, { points: 25 }, "Vorki");
    const gated = itemTask(fx.tileId, { points: 35, pointsGateNodeId: gate.id }, "Draconic visage");

    approveSubmission(db, { submissionId: submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: gated.id, itemName: "Draconic visage" }]).id, reviewedByUserId: fx.modUserId });
    expect(pointRows("points.earned")).toHaveLength(0); // completed, but its points are withheld

    approveSubmission(db, { submissionId: submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: gate.id, itemName: "Vorki" }]).id, reviewedByUserId: fx.modUserId });
    // Only the gate newly completed, yet two nodes gained points.
    expect(pointRows("points.earned").map((e) => [e.nodeId, e.points]).sort()).toEqual([[gate.id, 25], [gated.id, 35]].sort());
  });

  it("undoing an approval records what was lost, as positive numbers", () => {
    const fx = seedBaseFixture();
    updateTileBonusPoints(db, fx.tileId, 50);
    const task = itemTask(fx.tileId, { points: 20 }, "Bruma torch");
    const sub = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]);
    approveSubmission(db, { submissionId: sub.id, reviewedByUserId: fx.modUserId });

    undoSubmissionReview(db, { submissionId: sub.id, undoneByUserId: fx.modUserId });

    expect(pointRows("points.lost").map((e) => [e.source, e.points])).toEqual([["task", 20], ["tile_bonus", 50]]);
    const undoId = auditRows().find((r) => r.action === "submission.review_undone")!.id;
    expect(pointRows("points.lost").every((e) => e.id > undoId)).toBe(true);
  });

  it("rejecting writes no points rows", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 20 }, "Bruma torch");
    rejectSubmission(db, { submissionId: submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]).id, reviewedByUserId: fx.modUserId });
    expect(auditRows().filter((r) => r.action.startsWith("points."))).toHaveLength(0);
  });

  it("a board edit records a net points.rescored only for teams whose total changed", () => {
    const fx = seedBaseFixture();
    const bingoId = bingoOf().id;
    const [other] = db.insert(schema.teams).values({ bingoId, captainUserId: fx.memberUserId, name: "Team B", codeword: "b-word" }).returning().all();
    const task = itemTask(fx.tileId, { points: 20 }, "Bruma torch");
    approveSubmission(db, { submissionId: submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Bruma torch" }]).id, reviewedByUserId: fx.modUserId });

    updateTileBonusPoints(db, fx.tileId, 50);
    rescoreBingo(db, bingoId);

    const rows = auditRows().filter((r) => r.action === "points.rescored");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teamId).toBe(fx.teamId);
    expect(JSON.parse(rows[0]!.details)).toEqual({ delta: 50 });
    expect(rows.some((r) => r.teamId === other.id)).toBe(false);

    rescoreBingo(db, bingoId); // nothing changed this time
    expect(auditRows().filter((r) => r.action === "points.rescored")).toHaveLength(1);
  });
});
