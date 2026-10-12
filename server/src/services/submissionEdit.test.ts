import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { renderAuditLabel, type AuditEntry, type EditSubmissionInput, type GraphNode } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, claims, submissions, submissionScreenshots, teamNodeState } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile, generateLines, updateTileBonusPoints } from "./boardService";
import { completedPartNotes, createSubmission, getAllSubmissionsForBingo, getTeamSubmissions, utcLabel } from "./submissionService";
import { approveSubmission, rejectSubmission } from "./scoringService";
import { editSubmission, EditWarningsError } from "./submissionEdit";
import { queryAuditLog } from "../audit/query";
import { ServiceError } from "./errors";

vi.mock("../ws", () => ({ broadcast: vi.fn() }));
// Today's prices: per unit, by item name. Anything missing has no price right now.
const PRICES = vi.hoisted(() => new Map<string, number>([["tanzanite fang", 2_000_000], ["onyx", 3_000_000], ["draconic visage", 5_000_000]]));
vi.mock("./gePriceService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gePriceService")>();
  const table = { unitPrice: (name: string) => PRICES.get(name.toLowerCase()) ?? null, refreshIfStale: async () => false };
  return { ...actual, getGePriceTable: () => table };
});

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

const MIN = 60_000;
// Whole seconds: that is what the database keeps.
const T0 = new Date(Math.floor((Date.now() - 48 * 60 * MIN) / 1000) * 1000);
const t = (minutes: number) => new Date(T0.getTime() + minutes * MIN);

const user = (name: string) => db.insert(schema.users).values({ discordId: name, discordUsername: name }).returning().get();

/**
 * A live Bingo started at T0. Team A: alice (captain) and bob; Team B: cara. mod reviews.
 * ZULRAH: Fang (10) and Onyx, a SUM of 3 (30). VORKATH: Visage (25), and Head (35), which can't be submitted before
 * Visage is done. WINTERTODT needs a Proof screenshot Tile-wide. COX is frozen for its first two hours.
 */
function seed() {
  const [mod, alice, bob, cara] = [user("mod"), user("alice"), user("bob"), user("cara")];
  const bingo = db.insert(bingos).values({ slug: "ed", name: "Edit Bingo", boardRows: 2, boardCols: 3, createdByUserId: mod.id, stage: "live", startsAt: T0 }).returning().get();
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: alice.id, name: "Team A", codeword: "a" }).returning().get();
  db.insert(schema.teamMembers).values([{ teamId: team.id, userId: alice.id, isCaptain: true }, { teamId: team.id, userId: bob.id }]).run();
  const teamB = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: cara.id, name: "Team B", codeword: "b" }).returning().get();
  db.insert(schema.teamMembers).values({ teamId: teamB.id, userId: cara.id, isCaptain: true }).run();

  const zul = createTile(db, { bingoId: bingo.id, name: "ZULRAH", boardRow: 0, boardCol: 0 });
  const fang = createTask(db, zul.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  const onyxTask = createTask(db, zul.id, { kind: "SUM", quantity: 3, label: "Onyx", points: 30, children: [{ kind: "ITEM", itemName: "Onyx" }] });
  const onyx = onyxTask.children[0]!;
  const vork = createTile(db, { bingoId: bingo.id, name: "VORKATH", boardRow: 0, boardCol: 1 });
  const visage = createTask(db, vork.id, { kind: "ITEM", itemName: "Draconic visage", label: "Visage", points: 25 });
  const head = createTask(db, vork.id, { kind: "ITEM", itemName: "Vorkath's head", label: "Head", points: 35, submitGateNodeId: visage.id });
  const wt = createTile(db, { bingoId: bingo.id, name: "WINTERTODT", boardRow: 1, boardCol: 0, requiresProof: true, proofNote: "an empty cart" });
  const tome = createTask(db, wt.id, { kind: "ITEM", itemName: "Tome of fire", label: "Tome", points: 10 });
  const cox = createTile(db, { bingoId: bingo.id, name: "COX", boardRow: 1, boardCol: 1, hasFreezePeriod: true, freezeDurationMinutes: 120 });
  const bow = createTask(db, cox.id, { kind: "ITEM", itemName: "Twisted bow", label: "Bow", points: 50 });
  return { bingo, mod, alice, bob, cara, team, teamB, zul, fang, onyxTask, onyx, vork, visage, head, wt, tome, cox, bow };
}
type Fx = ReturnType<typeof seed>;

const getBingo = (fx: Fx) => db.select().from(bingos).where(eq(bingos.id, fx.bingo.id)).get()!;
const row = (id: string) => db.select().from(submissions).where(eq(submissions.id, id)).get()!;
const claimRows = (id: string) => db.select().from(claims).where(eq(claims.submissionId, id)).all();

function drop(fx: Fx, items: { nodeId: string; itemName: string; quantity?: number }[], opts: { by?: string; postedBy?: string; at?: number; teamId?: string } = {}) {
  return createSubmission(db, getBingo(fx), {
    teamId: opts.teamId ?? fx.team.id,
    submittedByUserId: opts.by ?? fx.alice.id,
    postedByUserId: opts.postedBy,
    claims: items,
    screenshotUrl: "/drop.png",
    now: t(opts.at ?? 180),
  });
}
const approve = (fx: Fx, id: string, notes?: string) => approveSubmission(db, { submissionId: id, reviewedByUserId: fx.mod.id, reviewerNotes: notes });
const reject = (fx: Fx, id: string, notes = "no codeword") => rejectSubmission(db, { submissionId: id, reviewedByUserId: fx.mod.id, reviewerNotes: notes });

/** The Edit form as the mod queue opens it: the submission as it is now. */
function formOf(id: string): EditSubmissionInput {
  const s = row(id);
  const common = { expectedUpdatedAt: s.updatedAt.toISOString(), submittedByUserId: s.submittedByUserId, submittedAt: s.submittedAt.toISOString(), status: s.status, reviewerNotes: s.reviewerNotes };
  if (s.kind === "proof") return { ...common, kind: "proof", proofTileId: s.proofTileId!, proofTaskId: s.proofTaskId };
  return { ...common, kind: "drop", claims: claimRows(id).map((c) => ({ nodeId: c.nodeId, quantity: c.quantity })) };
}
const edit = (fx: Fx, id: string, changes: Partial<EditSubmissionInput>, by = fx.mod.id) =>
  editSubmission(db, getBingo(fx), { submissionId: id, editedByUserId: by, input: { ...formOf(id), ...changes } });

function fail(fn: () => unknown): ServiceError {
  try {
    fn();
  } catch (e) {
    return e as ServiceError;
  }
  throw new Error("expected it to throw");
}

const teamPoints = (teamId: string) => db.select().from(teamNodeState).where(eq(teamNodeState.teamId, teamId)).all().reduce((sum, s) => sum + s.pointsAwarded, 0);
const findState = (teamId: string, nodeId: string) => db.select().from(teamNodeState).all().find((s) => s.teamId === teamId && s.nodeId === nodeId);
const auditRows = () => db.select().from(schema.auditLog).all().sort((a, b) => a.id - b.id);
const entries = (fx: Fx, action: AuditEntry["action"]) => queryAuditLog(db, { bingoId: fx.bingo.id }, { action: [action] }).entries as AuditEntry[];

describe("the credited Player", () => {
  it("moves to a teammate, and the original uploader stays the poster", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }], { by: fx.bob.id }); // bob forgot to pick alice
    expect(edit(fx, sub.id, { submittedByUserId: fx.alice.id }).submission).toMatchObject({ submittedByUserId: fx.alice.id, postedByUserId: fx.bob.id });
  });

  it("shows up in the lists the client reads", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }], { by: fx.bob.id });
    edit(fx, sub.id, { submittedByUserId: fx.alice.id });
    const [detail] = getTeamSubmissions(db, fx.team.id);
    expect([detail!.submittedByUser?.id, detail!.postedByUser?.id]).toEqual([fx.alice.id, fx.bob.id]);
    expect(getAllSubmissionsForBingo(db, fx.bingo.id)[0]!.submittedByUser?.id).toBe(fx.alice.id);
  });

  it("keeps the same poster when it moves again, and clears it when it moves back to the poster", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }], { by: fx.alice.id, postedBy: fx.bob.id });
    expect(edit(fx, sub.id, { submittedByUserId: fx.bob.id }).submission).toMatchObject({ submittedByUserId: fx.bob.id, postedByUserId: null });
  });

  it("only moves the credit: the review, the Team and the points stay", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    approve(fx, sub.id, "gg");
    const reviewed = row(sub.id);
    const result = edit(fx, sub.id, { submittedByUserId: fx.bob.id });
    expect(result.submission).toMatchObject({ teamId: fx.team.id, status: "approved", reviewedAt: reviewed.reviewedAt, reviewedByUserId: fx.mod.id, reviewerNotes: "gg" });
    expect(result.pointsDelta).toBe(0);
    expect(teamPoints(fx.team.id)).toBe(10);
    expect(auditRows().filter((r) => r.action.startsWith("points."))).toHaveLength(1); // the approval's own
    const [entry] = entries(fx, "submission.edited");
    expect(entry!.details).toMatchObject({ changes: [{ field: "player", before: "alice", after: "bob" }] });
    expect(entry!.details).not.toHaveProperty("pointsDelta");
    expect(entry!.label).toBe('mod edited a submission for "ZULRAH" (player: alice → bob)');
  });

  it("must be on the submission's Team, unless it isn't changing (a removed Player's drop can still be edited)", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }], { by: fx.bob.id });
    expect(fail(() => edit(fx, sub.id, { submittedByUserId: fx.cara.id })).status).toBe(400);
    db.delete(schema.teamMembers).where(eq(schema.teamMembers.userId, fx.bob.id)).run();
    expect(edit(fx, sub.id, { status: "rejected", reviewerNotes: "left the team" }).submission.status).toBe("rejected");
  });
});

describe("the status", () => {
  it("back to pending from approved clears the review and takes the points back, as a review_undone entry", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    approve(fx, sub.id, "looks good");
    expect(teamPoints(fx.team.id)).toBe(10);

    const result = edit(fx, sub.id, { status: "pending", reviewerNotes: "looks good" });

    expect(result.submission).toMatchObject({ status: "pending", reviewedAt: null, reviewedByUserId: null, reviewerNotes: null });
    expect(result.pointsDelta).toBe(-10);
    expect(teamPoints(fx.team.id)).toBe(0);
    const [undone] = entries(fx, "submission.review_undone");
    expect(undone!.details).toMatchObject({ previousStatus: "approved", previousReviewerNotes: "looks good", previousReviewedByUserId: fx.mod.id, pointsDelta: -10, nodeIds: [fx.fang.id] });
    expect((undone!.details as { uncompletedNodeIds: string[] }).uncompletedNodeIds).toContain(fx.fang.id);
    expect(entries(fx, "submission.edited")).toHaveLength(0); // nothing else changed
    expect(entries(fx, "points.lost").map((e) => (e.details as { points: number }).points)).toEqual([10]);
  });

  it("back to pending from rejected changes no points", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    reject(fx, sub.id);
    const result = edit(fx, sub.id, { status: "pending" });
    expect(result.submission).toMatchObject({ status: "pending", reviewerNotes: null });
    expect(result.pointsDelta).toBe(0);
    expect(entries(fx, "submission.review_undone")[0]!.details).toMatchObject({ previousStatus: "rejected", uncompletedNodeIds: [], pointsDelta: 0 });
    expect(auditRows().filter((r) => r.action.startsWith("points."))).toHaveLength(0);
  });

  it("left unchanged with nothing else changed writes nothing (sending a pending one back to pending again)", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    const before = auditRows().length;
    const result = edit(fx, sub.id, { status: "pending" });
    expect(result.submission).toEqual(row(sub.id));
    expect(row(sub.id).updatedAt).toEqual(sub.updatedAt);
    expect(auditRows()).toHaveLength(before);
  });

  it("from rejected to approved awards the points, as the approval it is (with the note)", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    reject(fx, sub.id);
    const result = edit(fx, sub.id, { status: "approved", reviewerNotes: "Codeword was there after all" });
    expect(result.submission).toMatchObject({ status: "approved", reviewedByUserId: fx.mod.id, reviewerNotes: "Codeword was there after all" });
    expect(result.reviewed).toBe(false); // it had been reviewed already
    expect(result.pointsDelta).toBe(10);
    const approved = entries(fx, "submission.approved");
    expect(approved).toHaveLength(1);
    expect(approved[0]!.details).toMatchObject({ pointsDelta: 10, reviewerNotes: "Codeword was there after all", submittedByUserId: fx.alice.id });
    expect((approved[0]!.details as { newlyCompletedNodeIds: string[] }).newlyCompletedNodeIds).toContain(fx.fang.id);
    expect(entries(fx, "submission.edited")).toHaveLength(0); // the note goes with the review
  });

  it("from approved to rejected takes the points back", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    approve(fx, sub.id);
    expect(edit(fx, sub.id, { status: "rejected", reviewerNotes: "Wrong item" }).pointsDelta).toBe(-10);
    expect(entries(fx, "submission.rejected")[0]!.details).toMatchObject({ reviewerNotes: "Wrong item" });
  });

  it("from pending is a review: by the editor, now, and reported as reviewed", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    const result = edit(fx, sub.id, { status: "approved" }, fx.alice.id);
    expect(result.reviewed).toBe(true);
    expect(result.submission.reviewedByUserId).toBe(fx.alice.id);
    expect(result.submission.reviewedAt!.getTime()).toBeGreaterThan(sub.submittedAt.getTime());
  });

  it("changing only the notes keeps the reviewer and is an edit", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    reject(fx, sub.id, "no codeword");
    const reviewed = row(sub.id);
    const result = edit(fx, sub.id, { reviewerNotes: "No codeword in the screenshot" }, fx.bob.id);
    expect(result.submission).toMatchObject({ reviewerNotes: "No codeword in the screenshot", reviewedByUserId: fx.mod.id, reviewedAt: reviewed.reviewedAt });
    expect(entries(fx, "submission.edited")[0]!.label).toBe('bob edited a submission for "ZULRAH" (notes: "no codeword" → "No codeword in the screenshot")');
  });
});

// The re-scoring is the full rebuild a review does, so gated points, SUM totals, lines and tile bonuses all settle.
describe("re-scoring", () => {
  it("one of two SUM contributions going back to pending drops the SUM below its target, while the other still counts", () => {
    const fx = seed();
    const a = drop(fx, [{ nodeId: fx.onyx.id, itemName: "Onyx", quantity: 2 }]);
    const b = drop(fx, [{ nodeId: fx.onyx.id, itemName: "Onyx" }]);
    approve(fx, a.id);
    approve(fx, b.id);
    expect(findState(fx.team.id, fx.onyxTask.id)?.pointsAwarded).toBe(30);
    expect(edit(fx, a.id, { status: "pending" }).pointsDelta).toBe(-30);
    expect(findState(fx.team.id, fx.onyxTask.id)).toBeUndefined();
    expect(findState(fx.team.id, fx.onyx.id)).toBeDefined();
  });

  it("a quantity fixed on an approved drop moves the points both ways, with the points entries after the edit's", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.onyx.id, itemName: "Onyx", quantity: 3 }]);
    approve(fx, sub.id);
    expect(teamPoints(fx.team.id)).toBe(30);

    const down = edit(fx, sub.id, { claims: [{ nodeId: fx.onyx.id, quantity: 2 }] });
    expect(down.pointsDelta).toBe(-30);
    expect(teamPoints(fx.team.id)).toBe(0);
    const [edited] = entries(fx, "submission.edited");
    expect(edited!.details).toMatchObject({ pointsDelta: -30, changes: [{ field: "items", before: "3× Onyx", after: "2× Onyx" }] });
    const lost = auditRows().filter((r) => r.action === "points.lost");
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.every((r) => r.id > edited!.id)).toBe(true);

    expect(edit(fx, sub.id, { claims: [{ nodeId: fx.onyx.id, quantity: 3 }] }).pointsDelta).toBe(30);
  });

  it("settles a tile bonus and a line when a claim moves to another tile", () => {
    const fx = seed();
    updateTileBonusPoints(db, fx.zul.id, 50);
    const fang = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    const onyx = drop(fx, [{ nodeId: fx.onyx.id, itemName: "Onyx", quantity: 3 }]);
    approve(fx, fang.id);
    approve(fx, onyx.id);
    expect(findState(fx.team.id, fx.zul.nodeId)?.pointsAwarded).toBe(50);

    const result = edit(fx, fang.id, { claims: [{ nodeId: fx.visage.id, quantity: 1 }] });

    expect(result.pointsDelta).toBe(-10 - 50 + 25);
    expect(findState(fx.team.id, fx.zul.nodeId)).toBeUndefined();
    expect(result.nodeIds.sort()).toEqual([fx.fang.id, fx.visage.id].sort());
    expect(entries(fx, "submission.edited")[0]!.details).toMatchObject({
      tileName: "VORKATH",
      changes: [
        { field: "tile", before: "ZULRAH", after: "VORKATH" },
        { field: "items", before: "1 Tanzanite fang", after: "1 Draconic visage" },
      ],
    });
  });

  it("breaking a line takes its bonus back", () => {
    const fx = seed();
    const lines = generateLines(db, getBingo(fx), 15);
    const rowLine = lines.find((l) => l.lineType === "row" && l.lineIndex === 0)!;
    const fang = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    const onyx = drop(fx, [{ nodeId: fx.onyx.id, itemName: "Onyx", quantity: 3 }]);
    const visage = drop(fx, [{ nodeId: fx.visage.id, itemName: "Draconic visage" }]);
    for (const s of [fang, onyx, visage]) approve(fx, s.id);
    approve(fx, drop(fx, [{ nodeId: fx.head.id, itemName: "Vorkath's head" }], { at: 200 }).id);
    expect(findState(fx.team.id, rowLine.nodeId)?.pointsAwarded).toBe(15);

    edit(fx, onyx.id, { status: "rejected", reviewerNotes: "Only two in the screenshot" });
    expect(findState(fx.team.id, rowLine.nodeId)).toBeUndefined();
  });

  it("the gate's approval going back to pending withholds the gated task's points again, without un-completing it", () => {
    const fx = seed();
    const gated = createTask(db, fx.zul.id, { kind: "ITEM", itemName: "Magic fang", label: "Magic fang", points: 35, pointsGateNodeId: fx.fang.id });
    const gate = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    approve(fx, gate.id);
    approve(fx, drop(fx, [{ nodeId: gated.id, itemName: "Magic fang" }]).id);
    expect(teamPoints(fx.team.id)).toBe(45);

    expect(edit(fx, gate.id, { status: "pending" }).pointsDelta).toBe(-45);
    expect(findState(fx.team.id, gated.id)?.pointsAwarded).toBe(0);
  });

  it("a submission sent back to pending can be approved again, for its points exactly once", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    approve(fx, sub.id);
    edit(fx, sub.id, { status: "pending" });
    expect(approve(fx, sub.id).pointsDelta).toBe(10);
    expect(teamPoints(fx.team.id)).toBe(10);
  });

  it("only re-scores the submission's own Team", () => {
    const fx = seed();
    const a = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    const b = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }], { teamId: fx.teamB.id, by: fx.cara.id });
    approve(fx, a.id);
    approve(fx, b.id);
    edit(fx, a.id, { status: "pending" });
    expect(teamPoints(fx.team.id)).toBe(0);
    expect(teamPoints(fx.teamB.id)).toBe(10);
  });

  it("leaves points alone when a pending or rejected submission's claims change", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    reject(fx, sub.id);
    expect(edit(fx, sub.id, { claims: [{ nodeId: fx.visage.id, quantity: 1 }] }).pointsDelta).toBe(0);
    expect(auditRows().filter((r) => r.action.startsWith("points."))).toHaveLength(0);
  });
});

describe("the claims", () => {
  it("keep an unchanged claim's Drop value, and price a changed or new one at today's prices", () => {
    const fx = seed();
    const sub = drop(fx, [
      { nodeId: fx.fang.id, itemName: "Tanzanite fang" },
      { nodeId: fx.onyx.id, itemName: "Onyx" },
    ]);
    // Priced when it was posted, at the prices of the day.
    db.update(claims).set({ gpValue: 1_234 }).where(eq(claims.submissionId, sub.id)).run();
    const [fangClaim] = claimRows(sub.id).filter((c) => c.nodeId === fx.fang.id);

    const result = edit(fx, sub.id, { claims: [{ nodeId: fx.fang.id, quantity: 1 }, { nodeId: fx.onyx.id, quantity: 2 }] });

    const after = claimRows(sub.id);
    expect(after.find((c) => c.nodeId === fx.fang.id)).toEqual(fangClaim);
    expect(after.find((c) => c.nodeId === fx.onyx.id)).toMatchObject({ quantity: 2, itemName: "Onyx", gpValue: 6_000_000 });
    expect(result.unpriced).toBe(false);
  });

  it("take their item name from the leaf, drop a leaf no longer claimed, and leave one without a price for the fill", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.visage.id, itemName: "Draconic visage" }]);
    const result = edit(fx, sub.id, { claims: [{ nodeId: fx.head.id, quantity: 1 }], force: true }); // Head's gate isn't done
    expect(claimRows(sub.id)).toEqual([expect.objectContaining({ nodeId: fx.head.id, itemName: "Vorkath's head", quantity: 1, gpValue: null })]);
    expect(result.unpriced).toBe(true);
  });

  it("are refused when they can't make a submission", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    const refuse = (c: EditSubmissionInput["claims"]) => fail(() => edit(fx, sub.id, { claims: c }));
    expect(refuse([]).message).toMatch(/At least one claim/);
    expect(refuse([{ nodeId: fx.fang.id, quantity: 0 }]).status).toBe(400);
    expect(refuse([{ nodeId: fx.fang.id, quantity: 1.5 }]).status).toBe(400);
    expect(refuse([{ nodeId: fx.fang.id, quantity: 1 }, { nodeId: fx.fang.id, quantity: 2 }]).message).toMatch(/twice/);
    expect(refuse([{ nodeId: fx.fang.id, quantity: 1 }, { nodeId: fx.visage.id, quantity: 1 }]).message).toMatch(/same tile/);
    expect(refuse([{ nodeId: fx.onyxTask.id, quantity: 1 }]).message).toMatch(/requirement leaves/); // the SUM, not its item
    expect(refuse([{ nodeId: "nope", quantity: 1 }]).status).toBe(400);
    expect(claimRows(sub.id)).toHaveLength(1);
  });
});

describe("the kind", () => {
  it("drop to Proof screenshot: its claims and points go, and its screenshot becomes the proof", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.tome.id, itemName: "Tome of fire" }]);
    approve(fx, sub.id);
    expect(teamPoints(fx.team.id)).toBe(10);

    const result = edit(fx, sub.id, { kind: "proof", proofTileId: fx.wt.id, proofTaskId: fx.tome.id });

    expect(result.submission).toMatchObject({ kind: "proof", proofTileId: fx.wt.id, proofTaskId: null }); // a Tile-wide requirement takes no Task
    expect(claimRows(sub.id)).toEqual([]);
    expect(teamPoints(fx.team.id)).toBe(0);
    expect(db.select().from(submissionScreenshots).where(eq(submissionScreenshots.submissionId, sub.id)).get()!.screenshotType).toBe("proof");
    expect(entries(fx, "submission.edited")[0]!.details).toMatchObject({
      kind: "proof",
      pointsDelta: -10,
      changes: [
        { field: "kind", before: "Drop", after: "Proof screenshot" },
        { field: "items", before: "1 Tome of fire", after: null },
      ],
    });
  });

  it("Proof screenshot to drop: it gets its claims, and its screenshot is a drop's again", () => {
    const fx = seed();
    const proof = createSubmission(db, getBingo(fx), { kind: "proof", teamId: fx.team.id, submittedByUserId: fx.alice.id, tileId: fx.wt.id, screenshotUrl: "/p.png", now: t(30) });
    const result = edit(fx, proof.id, { kind: "drop", claims: [{ nodeId: fx.tome.id, quantity: 1 }], proofTileId: undefined });
    expect(result.submission).toMatchObject({ kind: "drop", proofTileId: null, proofTaskId: null });
    expect(claimRows(proof.id)).toEqual([expect.objectContaining({ nodeId: fx.tome.id, itemName: "Tome of fire", quantity: 1 })]);
    expect(db.select().from(submissionScreenshots).where(eq(submissionScreenshots.submissionId, proof.id)).get()!.screenshotType).toBe("main");
  });

  it("a proof's Tile has to be this Bingo's, and its Task on that Tile", () => {
    const fx = seed();
    const proof = createSubmission(db, getBingo(fx), { kind: "proof", teamId: fx.team.id, submittedByUserId: fx.alice.id, tileId: fx.wt.id, screenshotUrl: "/p.png", now: t(30) });
    expect(fail(() => edit(fx, proof.id, { proofTileId: "nope" })).message).toBe("Tile not found");
    expect(fail(() => edit(fx, proof.id, { proofTileId: fx.wt.id, proofTaskId: fx.fang.id })).message).toMatch(/isn't on this tile/);
  });
});

describe("the submitted time", () => {
  it("can be corrected, but not into the future", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }], { at: 300 });
    const result = edit(fx, sub.id, { submittedAt: t(240).toISOString() });
    expect(result.submission.submittedAt).toEqual(t(240));
    expect(entries(fx, "submission.edited")[0]!.details).toMatchObject({ changes: [{ field: "submittedAt", before: t(300).toISOString(), after: t(240).toISOString() }] });
    expect(fail(() => edit(fx, sub.id, { submittedAt: new Date(Date.now() + 60 * MIN).toISOString() })).status).toBe(400);
    expect(fail(() => edit(fx, sub.id, { submittedAt: "yesterday" })).status).toBe(400);
  });
});

// Fang (ZULRAH) and Visage (VORKATH) count as one Exclusive Item: a Team uses it on one Tile only.
function useRareGroup(fx: Fx) {
  const rules = [{ id: "r1", label: "Rare", itemNames: ["Tanzanite fang", "Draconic visage"], scope: "tile", groups: [{ label: "Rare drop", itemNames: ["Tanzanite fang", "Draconic visage"] }] }];
  db.update(bingos).set({ exclusivityRulesJson: JSON.stringify(rules) }).where(eq(bingos.id, fx.bingo.id)).run();
}

describe("warnings", () => {
  const warningsOf = (fn: () => unknown) => {
    const err = fail(fn);
    expect(err).toBeInstanceOf(EditWarningsError);
    expect(err.status).toBe(422);
    return (err as EditWarningsError).warnings;
  };

  it("refuse the save until it's forced, then save it and record what it was saved over", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.bow.id, itemName: "Twisted bow" }], { at: 180 });
    const early = t(30).toISOString();
    const warnings = warningsOf(() => edit(fx, sub.id, { submittedAt: early }));
    expect(warnings).toEqual([{ code: "frozen", message: `This tile is frozen until ${utcLabel(t(120))}` }]);
    expect(row(sub.id).submittedAt).toEqual(t(180)); // nothing was saved

    const result = edit(fx, sub.id, { submittedAt: early, force: true });
    expect(result.warnings).toEqual(warnings);
    expect(result.submission.submittedAt).toEqual(t(30));
    expect(entries(fx, "submission.edited")[0]!.details).toMatchObject({ warnings: [warnings[0]!.message] });
  });

  it("for a time before the Bingo started, or after it ended", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    expect(warningsOf(() => edit(fx, sub.id, { submittedAt: t(-10).toISOString() })).map((w) => w.code)).toEqual(["before_start"]);
    db.update(bingos).set({ stage: "complete" }).where(eq(bingos.id, fx.bingo.id)).run();
    db.insert(schema.stageTransitions).values({ bingoId: fx.bingo.id, fromStage: "live", toStage: "complete", changedByUserId: fx.mod.id, createdAt: t(600) }).run();
    expect(warningsOf(() => edit(fx, sub.id, { submittedAt: t(700).toISOString() })).map((w) => w.code)).toEqual(["after_end"]);
  });

  it("for a claim behind a submit gate the Team hasn't completed, judged without the submission itself", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.visage.id, itemName: "Draconic visage" }]);
    approve(fx, sub.id);
    // Its own Visage doesn't open the gate for its own Head.
    expect(warningsOf(() => edit(fx, sub.id, { claims: [{ nodeId: fx.head.id, quantity: 1 }] }))).toEqual([{ code: "gate", message: "Head: the previous requirement must be completed first" }]);
    // Another approved Visage does.
    approve(fx, drop(fx, [{ nodeId: fx.visage.id, itemName: "Draconic visage" }], { by: fx.bob.id }).id);
    expect(edit(fx, sub.id, { claims: [{ nodeId: fx.head.id, quantity: 1 }] }).warnings).toEqual([]);
  });

  it("for an Exclusive Item the Team used elsewhere, not counting the submission's own claim", () => {
    const fx = seed();
    useRareGroup(fx);
    const visage = drop(fx, [{ nodeId: fx.visage.id, itemName: "Draconic visage" }]);
    expect(edit(fx, visage.id, { claims: [{ nodeId: fx.visage.id, quantity: 2 }] }).warnings).toEqual([]); // its own claim locks nothing for it
    const onyx = drop(fx, [{ nodeId: fx.onyx.id, itemName: "Onyx" }]);
    expect(warningsOf(() => edit(fx, onyx.id, { claims: [{ nodeId: fx.fang.id, quantity: 1 }] }))).toEqual([
      { code: "exclusive", message: expect.stringContaining("already used on VORKATH") },
    ]);
  });

  it("only for what the edit brings, not for what was already so", () => {
    const fx = seed();
    const a = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    const b = drop(fx, [{ nodeId: fx.visage.id, itemName: "Draconic visage" }]);
    useRareGroup(fx); // published after both were posted
    expect(edit(fx, b.id, { reviewerNotes: null, submittedByUserId: fx.bob.id }).warnings).toEqual([]);
    // Bringing a rejected one back to life does bring the conflict.
    reject(fx, a.id);
    expect(warningsOf(() => edit(fx, a.id, { status: "approved" })).map((w) => w.code)).toEqual(["exclusive"]);
    // Saved over it, the approval is the review entry, and the warning still has an entry of its own.
    edit(fx, a.id, { status: "approved", force: true });
    expect(entries(fx, "submission.approved")).toHaveLength(1);
    const [edited] = entries(fx, "submission.edited").filter((e) => e.entityId === a.id);
    expect(edited!.label).toMatch(/^mod edited a submission for "ZULRAH", over a warning: Tanzanite fang is in Rare drop, already used on VORKATH/);
  });

  it("for a Proof screenshot where none is needed", () => {
    const fx = seed();
    const proof = createSubmission(db, getBingo(fx), { kind: "proof", teamId: fx.team.id, submittedByUserId: fx.alice.id, tileId: fx.wt.id, screenshotUrl: "/p.png", now: t(30) });
    expect(warningsOf(() => edit(fx, proof.id, { proofTileId: fx.zul.id }))).toEqual([{ code: "proof_not_required", message: "This tile doesn't need a Proof screenshot" }]);
  });

  it("aren't given for a rejected submission, which counts for nothing", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    reject(fx, sub.id);
    expect(edit(fx, sub.id, { submittedAt: t(-10).toISOString() }).warnings).toEqual([]);
  });

  // BLOOD SHARDS: Page 1 and Page 2 each take a Blood shard, on their own lists.
  function shards(fx: Fx) {
    const tile = createTile(db, { bingoId: fx.bingo.id, name: "BLOOD SHARDS", boardRow: 0, boardCol: 2 });
    const page = (label: string) => createTask(db, tile.id, { kind: "ANY", label, points: 40, children: [{ kind: "ITEM", itemName: "Blood shard" }] }).children[0]!;
    return { page1: page("Page 1"), page2: page("Page 2") };
  }

  it("for approving Items on a Part the Team had already completed without it, naming the Part that also takes them", () => {
    const fx = seed();
    const { page1, page2 } = shards(fx);
    approve(fx, drop(fx, [{ nodeId: page1.id, itemName: "Blood shard" }]).id);
    const second = drop(fx, [{ nodeId: page1.id, itemName: "Blood shard" }], { by: fx.bob.id });
    expect(getAllSubmissionsForBingo(db, fx.bingo.id, "pending")[0]!.alreadyComplete).toEqual([
      '"Blood shard" adds nothing: Page 1 of BLOOD SHARDS is already complete. Page 2 also takes it.',
    ]);
    expect(warningsOf(() => edit(fx, second.id, { status: "approved" }))).toEqual([
      { code: "already_complete", message: '"Blood shard" adds nothing: Page 1 of BLOOD SHARDS is already complete. Page 2 also takes it.' },
    ]);
    // Moved to Page 2, it counts.
    expect(edit(fx, second.id, { status: "approved", claims: [{ nodeId: page2.id, quantity: 1 }] }).warnings).toEqual([]);
    expect(findState(fx.team.id, page2.id)).toBeDefined();
  });

  it("not for the submission that completed the Part, nor while it's pending", () => {
    const fx = seed();
    const { page1 } = shards(fx);
    const first = drop(fx, [{ nodeId: page1.id, itemName: "Blood shard" }]);
    expect(getAllSubmissionsForBingo(db, fx.bingo.id, "pending")[0]!.alreadyComplete).toEqual([]);
    approve(fx, first.id);
    expect(edit(fx, first.id, { reviewerNotes: "nice" }).warnings).toEqual([]);
    expect(getAllSubmissionsForBingo(db, fx.bingo.id)[0]!.alreadyComplete).toEqual([]); // only a pending row has the line
    const second = drop(fx, [{ nodeId: page1.id, itemName: "Blood shard" }]);
    expect(edit(fx, second.id, { submittedAt: t(200).toISOString() }).warnings).toEqual([]);
  });
});

describe("completedPartNotes", () => {
  const node = (id: string, kind: GraphNode["kind"], children: GraphNode[] = [], extra: Partial<GraphNode> = {}): GraphNode =>
    ({ id, kind, label: null, itemName: null, children, ...extra }) as GraphNode;
  const item = (id: string, itemName: string) => node(id, "ITEM", [], { itemName });

  it("says nothing for an Item shared by two Parts while either is unfinished", () => {
    const shard = item("shard", "Blood shard");
    const root = node("root", "ALL", [node("p1", "COUNT", [shard], { label: "Page 1" }), node("p2", "COUNT", [shard], { label: "Page 2" })]);
    expect(completedPartNotes("SHARDS", root, ["shard"], new Set(["p1"]))).toEqual([]);
    expect(completedPartNotes("SHARDS", root, ["shard"], new Set(["p1", "p2"]))).toEqual(['"Blood shard" adds nothing: Page 1 and Page 2 of SHARDS are already complete.']);
  });

  it("treats a Tile whose root is a SUM as one Part, so a claimed Item only adds nothing once the total is reached", () => {
    const root = node("root", "SUM", [item("a", "Onyx"), item("b", "Zenyte")]);
    expect(completedPartNotes("GEMS", root, ["a"], new Set(["a"]))).toEqual([]);
    expect(completedPartNotes("GEMS", root, ["a"], new Set(["a", "root"]))).toEqual(['"Onyx" adds nothing: GEMS is already complete.']);
  });
});

describe("refusals", () => {
  it("409s when the submission changed since the form was opened", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    const opened = formOf(sub.id);
    approve(fx, sub.id); // another mod, meanwhile
    const err = fail(() => editSubmission(db, getBingo(fx), { submissionId: sub.id, editedByUserId: fx.mod.id, input: { ...opened, status: "rejected", reviewerNotes: "no" } }));
    expect(err.status).toBe(409);
    expect(row(sub.id).status).toBe("approved");
  });

  it("doesn't find a submission of another Bingo, and refuses a form that isn't one", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.fang.id, itemName: "Tanzanite fang" }]);
    const other = db.insert(bingos).values({ slug: "other", name: "Other", boardRows: 1, boardCols: 1, createdByUserId: fx.mod.id }).returning().get();
    expect(fail(() => editSubmission(db, other, { submissionId: sub.id, editedByUserId: fx.mod.id, input: formOf(sub.id) })).status).toBe(404);
    expect(fail(() => editSubmission(db, getBingo(fx), { submissionId: "missing", editedByUserId: fx.mod.id, input: formOf(sub.id) })).status).toBe(404);
    expect(fail(() => edit(fx, sub.id, { expectedUpdatedAt: "" })).status).toBe(400);
    expect(fail(() => edit(fx, sub.id, { status: "done" as never })).status).toBe(400);
    expect(fail(() => edit(fx, sub.id, { kind: "other" as never })).status).toBe(400);
  });
});

describe("the audit entry", () => {
  it("lists every change in words, with the status written as its own entry first", () => {
    const fx = seed();
    const sub = drop(fx, [{ nodeId: fx.onyx.id, itemName: "Onyx", quantity: 3 }], { by: fx.bob.id, at: 300 });
    edit(fx, sub.id, { status: "approved", reviewerNotes: "Fixed the quantity", submittedByUserId: fx.alice.id, claims: [{ nodeId: fx.onyx.id, quantity: 2 }], submittedAt: t(290).toISOString() });

    const approved = entries(fx, "submission.approved")[0]!;
    const edited = entries(fx, "submission.edited")[0]!;
    expect(approved.id).toBeLessThan(edited.id);
    expect(approved.details).toMatchObject({ pointsDelta: 0, submittedByUserId: fx.alice.id });
    expect(edited.visibility).toBe("mods");
    expect(edited.details).not.toHaveProperty("pointsDelta"); // the approval carries it
    expect(renderAuditLabel(edited)).toBe(
      `mod edited a submission for "ZULRAH" (player: bob → alice; items: 3× Onyx → 2× Onyx; submitted: ${t(300).toISOString().slice(0, 10)} ${t(300).toISOString().slice(11, 16)} UTC → ${t(290).toISOString().slice(0, 10)} ${t(290).toISOString().slice(11, 16)} UTC)`,
    );
  });

  it("names the Part of an Item that is on two Parts' own lists, so a claim moved between them reads as a change", () => {
    const fx = seed();
    const tile = createTile(db, { bingoId: fx.bingo.id, name: "GEMS", boardRow: 0, boardCol: 2 });
    const page = (label: string) => createTask(db, tile.id, { kind: "COUNT", quantity: 1, label, points: 10, children: [{ kind: "ITEM", itemName: "Onyx" }] }).children[0]!;
    const [one, two] = [page("Page 1"), page("Page 2")];
    const sub = drop(fx, [{ nodeId: one.id, itemName: "Onyx" }]);
    edit(fx, sub.id, { claims: [{ nodeId: two.id, quantity: 1 }] });
    expect(entries(fx, "submission.edited")[0]!.details).toMatchObject({ changes: [{ field: "items", before: "1 Onyx (Page 1)", after: "1 Onyx (Page 2)" }] });
  });
});
