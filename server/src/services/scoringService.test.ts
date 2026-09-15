import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNodeInput } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, submissions } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTile, createTask, generateLines } from "./boardService";
import { approveSubmission, rejectSubmission, undoSubmissionReview } from "./scoringService";

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
