import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { PROOF_FLAG_LABELS, renderAuditLabel, type AuditEntry } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, stageTransitions, submissions } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile, deleteTask, deleteTile, getBoardTiles, updateNode, updateTile } from "./boardService";
import { createSubmission, getAllSubmissionsForBingo, getPendingCount, setSubmissionReaction } from "./submissionService";
import { approveSubmission, rejectSubmission, undoSubmissionReview } from "./scoringService";
import { getContributionCounts, getTeamCredits, getTitleFacts } from "./statsService";
import { getTeamProgress } from "./teamService";
import { getRewind } from "./rewindService";
import { computeWrapped, getWrappedState } from "./wrappedService";
import { exportBingo, importBingo } from "./bingoExportService";
import * as achievementService from "./achievementService";
import { queryAuditLog } from "../audit/query";
import { ServiceError } from "./errors";

vi.mock("../ws", () => ({ broadcast: vi.fn() }));

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

function user(name: string) {
  return db.insert(schema.users).values({ discordId: name, discordUsername: name }).returning().get();
}

/**
 * A live Bingo with one Team (alice captains, bob plays; mod reviews). WINTERTODT requires a Proof screenshot
 * Tile-wide; MINIGAMES has two Tasks, only Tempoross needing one; ZULRAH needs none.
 */
function seed() {
  const mod = user("mod");
  const alice = user("alice");
  const bob = user("bob");
  const bingo = db.insert(bingos).values({ slug: "pf", name: "Proof Bingo", boardRows: 1, boardCols: 3, createdByUserId: mod.id, stage: "live", startsAt: T0 }).returning().get();
  db.transaction((tx) => achievementService.initializeAchievementSettings(tx, bingo.id, T0));
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: alice.id, name: "Team A", codeword: "a" }).returning().get();
  db.insert(schema.teamMembers).values([{ teamId: team.id, userId: alice.id, isCaptain: true }, { teamId: team.id, userId: bob.id }]).run();
  db.insert(stageTransitions).values({ bingoId: bingo.id, fromStage: "reveal", toStage: "live", changedByUserId: mod.id, createdAt: t(0) }).run();

  const wt = createTile(db, { bingoId: bingo.id, name: "WINTERTODT", boardRow: 0, boardCol: 0, requiresProof: true, proofNote: "an empty supply cart" });
  const tome = createTask(db, wt.id, { kind: "ITEM", itemName: "Tome of fire", label: "Tome", points: 10 });
  const mg = createTile(db, { bingoId: bingo.id, name: "MINIGAMES", boardRow: 0, boardCol: 1 });
  const fish = createTask(db, mg.id, { kind: "ITEM", itemName: "Fish barrel", label: "Tempoross", points: 10, requiresProof: true, proofNote: "an empty pool" });
  const gotr = createTask(db, mg.id, { kind: "ITEM", itemName: "Abyssal lantern", label: "Guardians", points: 10 });
  const zul = createTile(db, { bingoId: bingo.id, name: "ZULRAH", boardRow: 0, boardCol: 2 });
  const fang = createTask(db, zul.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  return { bingo: getBingo(bingo.id), mod, alice, bob, team, wt, tome, mg, fish, gotr, zul, fang };
}
type Fx = ReturnType<typeof seed>;

function getBingo(id: string) {
  return db.select().from(bingos).where(eq(bingos.id, id)).get()!;
}

function proof(fx: Fx, tileId: string, opts: { taskId?: string; userId?: string; postedBy?: string; at?: number } = {}) {
  return createSubmission(db, getBingo(fx.bingo.id), {
    kind: "proof",
    teamId: fx.team.id,
    submittedByUserId: opts.userId ?? fx.alice.id,
    postedByUserId: opts.postedBy,
    tileId,
    taskId: opts.taskId,
    screenshotUrl: "/proof.png",
    now: t(opts.at ?? 10),
  });
}

function drop(fx: Fx, nodeId: string, itemName: string, opts: { userId?: string; at?: number } = {}) {
  return createSubmission(db, getBingo(fx.bingo.id), { teamId: fx.team.id, submittedByUserId: opts.userId ?? fx.alice.id, claims: [{ nodeId, itemName }], screenshotUrl: "/drop.png", now: t(opts.at ?? 20) });
}

const approve = (fx: Fx, id: string) => approveSubmission(db, { submissionId: id, reviewedByUserId: fx.mod.id });
const reject = (fx: Fx, id: string) => rejectSubmission(db, { submissionId: id, reviewedByUserId: fx.mod.id, reviewerNotes: "no cart shown" });

function status(fn: () => unknown): number | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof ServiceError ? err.status : -1;
  }
}

const row = (fx: Fx, id: string) => getAllSubmissionsForBingo(db, fx.bingo.id).find((r) => r.submission.id === id)!;

describe("posting a Proof screenshot", () => {
  it("is a proof Submission with no Claims, tied to its Tile (and Task when per-Task), with a proof screenshot", () => {
    const fx = seed();
    const tileWide = proof(fx, fx.wt.id, { taskId: fx.tome.id }); // a Task given for a Tile-wide requirement is ignored
    const perTask = proof(fx, fx.mg.id, { taskId: fx.fish.id });

    expect(tileWide).toMatchObject({ kind: "proof", proofTileId: fx.wt.id, proofTaskId: null, status: "pending" });
    expect(perTask).toMatchObject({ kind: "proof", proofTileId: fx.mg.id, proofTaskId: fx.fish.id });
    expect(db.select().from(schema.claims).all()).toEqual([]);
    const shots = db.select().from(schema.submissionScreenshots).all();
    expect(shots.map((s) => s.screenshotType)).toEqual(["proof", "proof"]);
  });

  it("is only allowed where a requirement exists", () => {
    const fx = seed();
    expect(status(() => proof(fx, fx.zul.id))).toBe(400); // no requirement on the Tile
    expect(status(() => proof(fx, fx.mg.id))).toBe(400); // per-Task: a Task has to be named
    expect(status(() => proof(fx, fx.mg.id, { taskId: fx.gotr.id }))).toBe(400); // that Task needs none
    expect(status(() => proof(fx, "nope"))).toBe(400);
    expect(db.select().from(submissions).all()).toEqual([]);
  });

  it("is only allowed while the Bingo is Live", () => {
    const fx = seed();
    for (const stage of ["reveal", "complete"] as const) {
      db.update(bingos).set({ stage }).where(eq(bingos.id, fx.bingo.id)).run();
      expect(status(() => proof(fx, fx.wt.id))).toBe(400);
    }
  });

  it("can be posted for a teammate, who it's credited to", () => {
    const fx = seed();
    const s = proof(fx, fx.wt.id, { userId: fx.bob.id, postedBy: fx.alice.id });
    expect(s).toMatchObject({ submittedByUserId: fx.bob.id, postedByUserId: fx.alice.id });
  });

  it("is audited with its kind in the label", () => {
    const fx = seed();
    proof(fx, fx.mg.id, { taskId: fx.fish.id });
    const entry = queryAuditLog(db, { bingoId: fx.bingo.id }, {}).entries.find((e) => e.action === "submission.created")! as AuditEntry;
    expect(entry.entityLabel).toBe("Proof screenshot · MINIGAMES");
    expect(renderAuditLabel(entry)).toContain('posted a Proof screenshot for "MINIGAMES" (Tempoross)');
  });
});

describe("reviewing a Proof screenshot", () => {
  it("is in the review queue and approved, rejected and undone like any Submission, with no points", () => {
    const fx = seed();
    const a = proof(fx, fx.wt.id);
    const b = proof(fx, fx.mg.id, { taskId: fx.fish.id });
    expect(getPendingCount(db, fx.bingo.id)).toBe(2);
    const queued = row(fx, b.id);
    expect(queued.tile.id).toBe(fx.mg.id);
    expect(queued.proofTaskLabel).toBe("Tempoross");
    expect(queued.leaves).toEqual([]);

    expect(approve(fx, a.id)).toMatchObject({ nodeIds: [], newlyCompletedNodeIds: [], pointsDelta: 0 });
    reject(fx, b.id);
    expect(getTeamProgress(db, fx.team.id).totalPoints).toBe(0);
    expect(undoSubmissionReview(db, { submissionId: a.id, undoneByUserId: fx.mod.id }).pointsDelta).toBe(0);

    const labels = queryAuditLog(db, { bingoId: fx.bingo.id }, {}).entries.map((e) => renderAuditLabel(e as AuditEntry));
    expect(labels.some((l) => l.includes('approved a Proof screenshot for "WINTERTODT"'))).toBe(true);
    expect(labels.some((l) => l.includes('rejected a Proof screenshot for "MINIGAMES"'))).toBe(true);
    expect(labels.some((l) => l.includes("approved Proof screenshot"))).toBe(true);
  });
});

describe("a drop's Proof screenshot flags", () => {
  it("Tile-wide: missing until one is approved, and before when the drop is earlier than it", () => {
    const fx = seed();
    const early = drop(fx, fx.tome.id, "Tome of fire", { at: 5 });
    expect(row(fx, early.id).proofChecks).toEqual([{ requirement: { tileId: fx.wt.id, taskId: null, label: "WINTERTODT", note: "an empty supply cart" }, proofs: [], flag: "missing" }]);

    const p = proof(fx, fx.wt.id, { at: 10 });
    expect(row(fx, early.id).proofChecks[0]!.flag).toBe("missing"); // pending doesn't count
    expect(row(fx, early.id).proofChecks[0]!.proofs).toEqual([{ submissionId: p.id, status: "pending", submittedAt: t(10).toISOString(), screenshotUrl: "/proof.png" }]);
    approve(fx, p.id);
    expect(row(fx, early.id).proofChecks[0]!.flag).toBe("before");
    const late = drop(fx, fx.tome.id, "Tome of fire", { at: 30 });
    expect(row(fx, late.id).proofChecks[0]!.flag).toBeNull();
    expect(PROOF_FLAG_LABELS).toEqual({ missing: "No approved Proof screenshot", before: "Submitted before the Proof screenshot" });
  });

  it("is per Player: a teammate's proof doesn't count", () => {
    const fx = seed();
    approve(fx, proof(fx, fx.wt.id, { userId: fx.bob.id }).id);
    expect(row(fx, drop(fx, fx.tome.id, "Tome of fire").id).proofChecks[0]!.flag).toBe("missing");
  });

  it("per-Task: only drops on that Task are checked, against that Task's proof", () => {
    const fx = seed();
    approve(fx, proof(fx, fx.mg.id, { taskId: fx.fish.id, at: 10 }).id);
    expect(row(fx, drop(fx, fx.gotr.id, "Abyssal lantern").id).proofChecks).toEqual([]);
    const fish = row(fx, drop(fx, fx.fish.id, "Fish barrel").id).proofChecks;
    expect(fish.map((c) => [c.requirement.taskId, c.flag])).toEqual([[fx.fish.id, null]]);
    expect(row(fx, drop(fx, fx.fang.id, "Tanzanite fang").id).proofChecks).toEqual([]);
  });

  it("any approved proof counts for the whole Bingo, including one posted again after a rejection", () => {
    const fx = seed();
    reject(fx, proof(fx, fx.wt.id, { at: 5 }).id);
    const d = drop(fx, fx.tome.id, "Tome of fire", { at: 30 });
    expect(row(fx, d.id).proofChecks[0]!.flag).toBe("missing");
    approve(fx, proof(fx, fx.wt.id, { at: 20 }).id);
    const check = row(fx, d.id).proofChecks[0]!;
    expect(check.flag).toBeNull();
    expect(check.proofs.map((p) => p.status)).toEqual(["rejected", "approved"]);
    // Flags don't block the review.
    expect(approve(fx, d.id).pointsDelta).toBe(10);
  });
});

describe("a Proof screenshot isn't a drop", () => {
  it("can't be reacted to", () => {
    const fx = seed();
    const p = proof(fx, fx.wt.id);
    expect(status(() => setSubmissionReaction(db, p.id, fx.bob.id, "🔥", true))).toBe(400);
  });

  it("earns no Achievements", () => {
    const fx = seed();
    proof(fx, fx.wt.id);
    const mine = achievementService.getMyAchievements(db, getBingo(fx.bingo.id), fx.alice.id);
    expect(mine.achievements.find((a) => a.key === "strong_start")?.earned).toBe(false);
  });

  it("isn't counted in Stats or Titles", () => {
    const fx = seed();
    approve(fx, proof(fx, fx.wt.id, { userId: fx.bob.id, postedBy: fx.alice.id }).id);
    reject(fx, proof(fx, fx.mg.id, { taskId: fx.fish.id, userId: fx.bob.id }).id);
    approve(fx, drop(fx, fx.fang.id, "Tanzanite fang", { userId: fx.bob.id }).id);

    const counts = getContributionCounts(db, fx.bingo.id);
    expect(counts.find((c) => c.userId === fx.bob.id)?.approvedSubmissions).toBe(1);
    const facts = getTitleFacts(db, fx.bingo.id, counts, getTeamCredits(db, fx.bingo.id));
    const bob = facts.find((f) => f.userId === fx.bob.id)!;
    const alice = facts.find((f) => f.userId === fx.alice.id);
    expect(bob.approvedSubmissions).toBe(1);
    expect(bob.rejectedSubmissions).toBe(0);
    expect(alice?.postedForTeammates ?? 0).toBe(0);
  });

  it("is left out of Rewind and Wrapped, and a pending one doesn't hold Wrapped up", () => {
    const fx = seed();
    const p = proof(fx, fx.wt.id, { at: 5 });
    approve(fx, p.id);
    const d = drop(fx, fx.tome.id, "Tome of fire", { at: 20 });
    approve(fx, d.id);
    proof(fx, fx.mg.id, { taskId: fx.fish.id, at: 30 }); // left pending
    db.update(bingos).set({ stage: "complete" }).where(eq(bingos.id, fx.bingo.id)).run();
    db.insert(stageTransitions).values({ bingoId: fx.bingo.id, fromStage: "live", toStage: "complete", changedByUserId: fx.mod.id, createdAt: t(600) }).run();
    const finished = getBingo(fx.bingo.id);

    expect(getRewind(db, finished).submissions.map((s) => s.id)).toEqual([d.id]);
    const wrapped = computeWrapped(db, finished);
    expect(wrapped.bingo.totalSubmissions).toBe(1);
    expect(wrapped.bingo.moderation?.reviewed ?? 1).toBe(1);
    expect(getWrappedState(db, finished).pendingSubmissions).toBe(0);
  });
});

describe("the requirement in the Board editor", () => {
  it("is Tile-wide or per-Task, never both: turning on the Tile-wide one clears the Tasks' own", () => {
    const fx = seed();
    updateTile(db, fx.mg.id, { requiresProof: true, proofNote: "  an empty rift  " });
    const tile = getBoardTiles(db, fx.bingo.id).find((t) => t.id === fx.mg.id)!;
    expect(tile).toMatchObject({ requiresProof: true, proofNote: "an empty rift" });
    expect(tile.node.children.map((c) => [c.requiresProof, c.proofNote])).toEqual([
      [false, null],
      [false, null],
    ]);
    // …and a Task can't have its own while the Tile has one.
    expect(status(() => updateNode(db, fx.gotr.id, { kind: "ITEM", itemName: "Abyssal lantern", label: "Guardians", requiresProof: true }))).toBe(400);
  });

  it("is only on a Task itself, not deeper in its requirement", () => {
    const fx = seed();
    const nested = { kind: "ALL" as const, label: "Nested", children: [{ kind: "ITEM" as const, itemName: "X", requiresProof: true }] };
    expect(status(() => createTask(db, fx.zul.id, nested))).toBe(400);
  });

  it("turning it off drops its note", () => {
    const fx = seed();
    expect(updateTile(db, fx.wt.id, { requiresProof: false })).toMatchObject({ requiresProof: false, proofNote: null });
  });

  it("keeps a Tile or Task that Proof screenshots were posted for from being deleted", () => {
    const fx = seed();
    proof(fx, fx.wt.id);
    proof(fx, fx.mg.id, { taskId: fx.fish.id });
    expect(status(() => deleteTile(db, fx.wt.id))).toBe(409);
    expect(status(() => deleteTask(db, fx.fish.id))).toBe(409);
  });

  it("round-trips through a Bingo export", () => {
    const fx = seed();
    const doc = exportBingo(db, fx.bingo.id);
    const imported = importBingo(db, doc, { slug: "pf2", createdByUserId: fx.mod.id });
    const tiles = getBoardTiles(db, imported.id);
    expect(tiles.find((t) => t.name === "WINTERTODT")).toMatchObject({ requiresProof: true, proofNote: "an empty supply cart" });
    const fish = tiles.find((t) => t.name === "MINIGAMES")!.node.children.find((c) => c.label === "Tempoross")!;
    expect(fish).toMatchObject({ requiresProof: true, proofNote: "an empty pool" });
  });
});
