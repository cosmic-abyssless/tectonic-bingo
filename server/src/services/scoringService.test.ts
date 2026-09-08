import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNodeInput } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, submissions, tileWildcards } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTile, createTask, generateLines } from "./boardService";
import { approveSubmission, rejectSubmission } from "./scoringService";

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
function itemTask(tileId: string, opts: { points: number; pointsGateNodeId?: string; submitGateNodeId?: string }, itemName: string, quantity = 1) {
  return addTask(tileId, { kind: "ITEM", itemNames: [itemName], quantity, ...opts });
}
function manualTask(tileId: string, opts: { points: number; pointsGateNodeId?: string; submitGateNodeId?: string }) {
  return addTask(tileId, { kind: "MANUAL", ...opts });
}

// Bypasses submissionService's validation to insert a raw submission/claims
// directly — these tests target scoringService in isolation.
function submitAndReturn(teamId: string, submittedByUserId: string, claimRows: { nodeId: string; itemName?: string; quantity?: number; wildcardId?: string }[]) {
  const [submission] = db.insert(submissions).values({ teamId, submittedByUserId }).returning().all();
  for (const c of claimRows) {
    db.insert(claims).values({ submissionId: submission.id, nodeId: c.nodeId, itemName: c.itemName ?? null, quantity: c.quantity ?? 1, wildcardId: c.wildcardId ?? null }).run();
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

  it("accumulates claims across submissions and only completes once the target is met", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 40 }, "Cerberus drop", 2);

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Cerberus drop" }]);
    const r1 = approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });
    expect(r1.newlyCompletedNodeIds).toEqual([]);
    expect(findState(fx.teamId, task.id)).toBeUndefined();

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Cerberus drop" }]);
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

  it("enforces a wildcard's per-team redemption cap at approval time", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 25 }, "Cerberus drop", 2);
    const [wildcard] = db.insert(tileWildcards).values({ tileId: fx.tileId, itemName: "Cerberus jar", maxRedemptionsPerTeam: 1 }).returning().all();

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Cerberus jar", wildcardId: wildcard.id }]);
    approveSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId });

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Cerberus jar", wildcardId: wildcard.id }]);
    expect(() => approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId })).toThrow(/maximum number of times/);
  });

  it("does not burn a wildcard redemption on a rejected submission", () => {
    const fx = seedBaseFixture();
    const task = itemTask(fx.tileId, { points: 25 }, "Cerberus drop");
    const [wildcard] = db.insert(tileWildcards).values({ tileId: fx.tileId, itemName: "Cerberus jar", maxRedemptionsPerTeam: 1 }).returning().all();

    const sub1 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Cerberus jar", wildcardId: wildcard.id }]);
    rejectSubmission(db, { submissionId: sub1.id, reviewedByUserId: fx.modUserId, reviewerNotes: "not valid" });

    const sub2 = submitAndReturn(fx.teamId, fx.memberUserId, [{ nodeId: task.id, itemName: "Cerberus jar", wildcardId: wildcard.id }]);
    expect(() => approveSubmission(db, { submissionId: sub2.id, reviewedByUserId: fx.modUserId })).not.toThrow();
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
