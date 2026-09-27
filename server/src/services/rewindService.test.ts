import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { significanceScore, significanceTier, type RewindCompletion, type RewindResponse } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, claims, stageTransitions, submissions, teamNodeState, teamPointAdjustments } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile, generateLines } from "./boardService";
import { approveSubmission, rejectSubmission } from "./scoringService";
import { getTeamProgress } from "./teamService";
import { awardedPoints, evaluateGraph, type EngineNode } from "./engine";
import { getRewind, replayedStateAt, replayTeam, type ReplayClaim, type ReplaySubmission } from "./rewindService";
import { ServiceError } from "./errors";

// ---------------------------------------------------------------------------
// replayTeam against the scoring engine: one replay must give, at every moment, exactly what re-running the engine
// over only the Claims made by then gives.
// ---------------------------------------------------------------------------

function node(id: string, kind: EngineNode["kind"], extra: Partial<EngineNode> = {}): EngineNode {
  return { id, kind, minCount: null, quantity: null, itemName: null, points: 0, pointsGateNodeId: null, ...extra };
}

// A Tile (ALL, bonus 5) of three Parts: an item, a SUM of 3 over two items, and COUNT 2 of three items (its points
// gated behind the first Part). Plus a second Tile (one item) and a line over both Tiles.
function sampleGraph() {
  const engineNodes: EngineNode[] = [
    node("tile1", "ALL", { points: 5 }),
    node("a", "ITEM", { itemName: "A", points: 10 }),
    node("sum", "SUM", { quantity: 3, points: 20 }),
    node("b", "ITEM", { itemName: "B" }),
    node("c", "ITEM", { itemName: "C" }),
    node("count", "COUNT", { minCount: 2, points: 30, pointsGateNodeId: "a" }),
    node("d", "ITEM", { itemName: "D" }),
    node("e", "ITEM", { itemName: "E" }),
    node("f", "ITEM", { itemName: "F" }),
    node("tile2", "ALL"),
    node("g", "ITEM", { itemName: "G", points: 7 }),
    node("line", "ALL", { points: 50 }),
  ];
  const childrenOf = new Map<string, string[]>([
    ["tile1", ["a", "sum", "count"]],
    ["sum", ["b", "c"]],
    ["count", ["d", "e", "f"]],
    ["tile2", ["g"]],
    ["line", ["tile1", "tile2"]],
  ]);
  return { engineNodes, childrenOf, nodesById: new Map(engineNodes.map((n) => [n.id, n])) };
}

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 12, minutes));

// Out of id order, with a tie (s3/s4 share a minute), and the COUNT completing before its points gate does.
const SUBS: ReplaySubmission[] = [
  { id: "s5", submittedAt: at(50) },
  { id: "s1", submittedAt: at(0) },
  { id: "s2", submittedAt: at(10) },
  { id: "s4", submittedAt: at(20) },
  { id: "s3", submittedAt: at(20) },
  { id: "s6", submittedAt: at(60) },
  { id: "s7", submittedAt: at(70) },
];
const CLAIMS: ReplayClaim[] = [
  { submissionId: "s1", nodeId: "b", itemName: "B", quantity: 1 },
  { submissionId: "s2", nodeId: "d", itemName: "D", quantity: 1 },
  { submissionId: "s3", nodeId: "e", itemName: "E", quantity: 1 },
  { submissionId: "s4", nodeId: "c", itemName: "C", quantity: 2 },
  { submissionId: "s5", nodeId: "a", itemName: "A", quantity: 1 },
  { submissionId: "s6", nodeId: "b", itemName: "B", quantity: 2 },
  { submissionId: "s7", nodeId: "g", itemName: "G", quantity: 1 },
];

function engineAt(t: Date) {
  const graph = sampleGraph();
  const made = new Set(SUBS.filter((s) => s.submittedAt <= t).map((s) => s.id));
  const results = evaluateGraph(
    graph.engineNodes,
    graph.childrenOf,
    CLAIMS.filter((c) => made.has(c.submissionId)).map((c) => ({ ...c, reviewedAt: SUBS.find((s) => s.id === c.submissionId)!.submittedAt })),
  );
  return { results, nodesById: graph.nodesById };
}

describe("replayTeam", () => {
  it("matches re-running the scoring engine over the Claims made by each moment", () => {
    const replayed = replayTeam(sampleGraph(), SUBS, CLAIMS);
    // Before anything, at every Submission, and between each pair of them.
    const moments = [at(-5), ...SUBS.map((s) => s.submittedAt), ...SUBS.map((s) => new Date(s.submittedAt.getTime() + 30_000)), at(999)];
    for (const t of moments) {
      const { results, nodesById } = engineAt(t);
      const expected = new Map([...results].filter(([, r]) => r.complete).map(([id]) => [id, awardedPoints(id, results, nodesById)]));
      const actual = new Map([...replayedStateAt(replayed, t)].map(([id, s]) => [id, s.pointsAwarded]));
      expect(actual, `at ${t.toISOString()}`).toEqual(expected);
    }
  });

  it("leaves a Tile completed by the later of two Submissions incomplete between them", () => {
    const replayed = replayTeam(sampleGraph(), SUBS, CLAIMS);
    // s5 (A) at :50 completes tile1: every Part is done by then. s4/s3 at :20 already finished SUM and COUNT.
    expect(replayed.get("tile1")!.submissionId).toBe("s5");
    expect(replayedStateAt(replayed, at(49)).has("tile1")).toBe(false);
    expect(replayedStateAt(replayed, at(50)).has("tile1")).toBe(true);
  });

  it("counts a SUM Part's progress only from Submissions made by then", () => {
    const { results: early } = engineAt(at(15));
    expect(early.get("sum")).toMatchObject({ complete: false, value: 1 });
    const replayed = replayTeam(sampleGraph(), SUBS, CLAIMS);
    expect(replayedStateAt(replayed, at(15)).has("sum")).toBe(false);
    expect(replayedStateAt(replayed, at(20)).has("sum")).toBe(true);
  });

  it("holds a gated Part's points until its gate completes", () => {
    const replayed = replayTeam(sampleGraph(), SUBS, CLAIMS);
    const count = replayed.get("count")!;
    expect(count.completedAt).toEqual(at(20));
    expect(count.pointsAt).toEqual(at(50));
    expect(replayedStateAt(replayed, at(30)).get("count")).toEqual({ pointsAwarded: 0 });
    expect(replayedStateAt(replayed, at(50)).get("count")).toEqual({ pointsAwarded: 30 });
  });

  it("breaks a tie in submission time the same way every time", () => {
    const a = replayTeam(sampleGraph(), SUBS, CLAIMS);
    const b = replayTeam(sampleGraph(), [...SUBS].reverse(), CLAIMS);
    expect([...a.values()]).toEqual([...b.values()]);
    // s3 sorts before s4, so s4's C is the one that tipped the SUM over, and s3's E the COUNT.
    expect(a.get("sum")!.submissionId).toBe("s4");
    expect(a.get("count")!.submissionId).toBe("s3");
  });
});

// ---------------------------------------------------------------------------
// Significance
// ---------------------------------------------------------------------------

const NOTHING: RewindCompletion = { tiles: [], lines: [], firstTiles: [], firstParts: [] };

describe("significance", () => {
  it("lets a very lucky pet with no GP value reach the huge tier", () => {
    expect(significanceTier(significanceScore({ luckOneIn: 5_000 }))).toBe("huge");
    expect(significanceTier(significanceScore({ luckOneIn: 5_000, reactions: 1 }))).toBe("huge");
  });

  it("never lowers a score for a missing signal", () => {
    const base = { luckOneIn: 300, gpValue: 2_000_000, reactions: 3, completed: { ...NOTHING, tiles: ["ZULRAH"] } };
    const full = significanceScore(base);
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      const without = { ...base, [key]: undefined };
      // Leaving a signal out takes away only what it added; it isn't counted as a zero that drags the rest down.
      expect(significanceScore(without)).toBeLessThanOrEqual(full);
      expect(significanceScore(without)).toBeGreaterThanOrEqual(Math.max(...Object.entries(base).filter(([k]) => k !== key).map(([k, v]) => significanceScore({ [k]: v }))));
    }
    // A pet (no GP) scores exactly what its other signals give: not dragged down as if it were worth 0 GP.
    expect(significanceScore({ luckOneIn: 300, gpValue: undefined })).toBe(significanceScore({ luckOneIn: 300 }));
  });

  it("tiers everyday drops as minor and a line or a big drop as notable or more", () => {
    expect(significanceTier(significanceScore({ gpValue: 50_000 }))).toBe("minor");
    expect(significanceTier(significanceScore({}))).toBe("minor");
    expect(significanceTier(significanceScore({ gpValue: 10_000_000 }))).toBe("notable");
    expect(significanceTier(significanceScore({ completed: { ...NOTHING, lines: ["Row 1"] } }))).toBe("huge");
    expect(significanceTier(significanceScore({ gpValue: 1_500_000_000 }))).toBe("huge");
  });
});

// ---------------------------------------------------------------------------
// getRewind, against a real Bingo
// ---------------------------------------------------------------------------

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

const HOUR = 3_600_000;
// Whole seconds: that is what the database keeps.
const T0 = new Date(Math.floor((Date.now() - 48 * HOUR) / 1000) * 1000);
const t = (hours: number) => new Date(T0.getTime() + hours * HOUR);

function seed() {
  const [mod] = db.insert(schema.users).values({ discordId: "mod", discordUsername: "mod" }).returning().all();
  const [alice] = db.insert(schema.users).values({ discordId: "alice", discordUsername: "alice" }).returning().all();
  const [bob] = db.insert(schema.users).values({ discordId: "bob", discordUsername: "bob" }).returning().all();
  const [bingo] = db.insert(bingos).values({ slug: "rw", name: "Rewind Bingo", boardRows: 1, boardCols: 2, createdByUserId: mod.id, stage: "live" }).returning().all();
  const [teamA] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: alice.id, name: "Team A", codeword: "a" }).returning().all();
  const [teamB] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: bob.id, name: "Team B", codeword: "b" }).returning().all();
  db.insert(stageTransitions).values({ bingoId: bingo.id, fromStage: "reveal", toStage: "live", changedByUserId: mod.id, createdAt: t(0) }).run();

  const tile1 = createTile(db, { bingoId: bingo.id, name: "ZULRAH", boardRow: 0, boardCol: 0 });
  const tanz = createTask(db, tile1.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  const scales = createTask(db, tile1.id, { kind: "SUM", quantity: 3, label: "Scales", points: 20, children: [{ kind: "ITEM", itemName: "Zulrah's scales" }] });
  const tile2 = createTile(db, { bingoId: bingo.id, name: "VORKATH", boardRow: 0, boardCol: 1 });
  const head = createTask(db, tile2.id, { kind: "ITEM", itemName: "Vorkath's head", label: "Head", points: 5 });
  generateLines(db, db.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!, 15);

  return { bingo, mod, alice, bob, teamA, teamB, tanz, scalesLeaf: scales.children[0]!, head };
}

function submitAt(teamId: string, userId: string, when: Date, claim: { nodeId: string; itemName: string; quantity?: number; gpValue?: number }) {
  const [s] = db.insert(submissions).values({ teamId, submittedByUserId: userId, submittedAt: when, createdAt: when }).returning().all();
  db.insert(claims).values({ submissionId: s.id, nodeId: claim.nodeId, itemName: claim.itemName, quantity: claim.quantity ?? 1, gpValue: claim.gpValue ?? null }).run();
  db.insert(schema.submissionScreenshots).values({ submissionId: s.id, storageUrl: `/uploads/${s.id}.png` }).run();
  return s;
}

function finish(bingoId: string, modId: string) {
  db.update(bingos).set({ stage: "complete" }).where(eq(bingos.id, bingoId)).run();
  db.insert(stageTransitions).values({ bingoId, fromStage: "live", toStage: "complete", changedByUserId: modId, createdAt: t(40) }).run();
  return db.select().from(bingos).where(eq(bingos.id, bingoId)).get()!;
}

// The Rewind Board at T, the way the client builds it.
function stateAt(rewind: RewindResponse, teamId: string, when: Date) {
  const team = rewind.teams.find((x) => x.teamId === teamId)!;
  return new Map(team.nodes.filter((n) => Date.parse(n.completedAt) <= when.getTime()).map((n) => [n.nodeId, n.pointsAt && Date.parse(n.pointsAt) <= when.getTime() ? n.pointsAwarded : 0]));
}

describe("getRewind", () => {
  it("refuses a Bingo that isn't Finished", () => {
    const fx = seed();
    const live = db.select().from(bingos).where(eq(bingos.id, fx.bingo.id)).get()!;
    expect(() => getRewind(db, live)).toThrow(ServiceError);
    try {
      getRewind(db, live);
    } catch (err) {
      expect((err as ServiceError).status).toBe(403);
    }
  });

  it("ends on exactly the Finished Board and final scores", () => {
    const fx = seed();
    // Approved out of submission order, and Team A's first drop hours after it was made.
    const a1 = submitAt(fx.teamA.id, fx.alice.id, t(1), { nodeId: fx.scalesLeaf.id, itemName: "Zulrah's scales", quantity: 2 });
    const a2 = submitAt(fx.teamA.id, fx.alice.id, t(5), { nodeId: fx.tanz.id, itemName: "Tanzanite fang", gpValue: 3_000_000 });
    const a3 = submitAt(fx.teamA.id, fx.alice.id, t(9), { nodeId: fx.scalesLeaf.id, itemName: "Zulrah's scales", quantity: 1 });
    const a4 = submitAt(fx.teamA.id, fx.alice.id, t(12), { nodeId: fx.head.id, itemName: "Vorkath's head" });
    const b1 = submitAt(fx.teamB.id, fx.bob.id, t(3), { nodeId: fx.head.id, itemName: "Vorkath's head" });
    const b2 = submitAt(fx.teamB.id, fx.bob.id, t(4), { nodeId: fx.tanz.id, itemName: "Tanzanite fang" });
    for (const s of [a3, a2, b1, a4, a1]) approveSubmission(db, { submissionId: s.id, reviewedByUserId: fx.mod.id });
    rejectSubmission(db, { submissionId: b2.id, reviewedByUserId: fx.mod.id, reviewerNotes: "no codeword" });
    db.insert(teamPointAdjustments).values({ teamId: fx.teamB.id, bingoId: fx.bingo.id, amount: -3, reason: "late", createdByUserId: fx.mod.id, createdAt: t(20) }).run();
    submitAt(fx.teamA.id, fx.alice.id, t(30), { nodeId: fx.head.id, itemName: "Vorkath's head" }); // never reviewed

    const rewind = getRewind(db, finish(fx.bingo.id, fx.mod.id));

    for (const team of [fx.teamA, fx.teamB]) {
      const real = db.select().from(teamNodeState).where(eq(teamNodeState.teamId, team.id)).all();
      const end = stateAt(rewind, team.id, new Date(rewind.endAt));
      expect(end).toEqual(new Map(real.map((r) => [r.nodeId, r.pointsAwarded])));
      const rewindTeam = rewind.teams.find((x) => x.teamId === team.id)!;
      expect(rewindTeam.finalPoints).toBe(getTeamProgress(db, team.id).totalPoints);
    }

    // Pending Submissions never show; rejected ones do, and change nothing.
    expect(rewind.submissions.map((s) => s.id)).toEqual([a1.id, b1.id, b2.id, a2.id, a3.id, a4.id]);
    const rejected = rewind.submissions.find((s) => s.id === b2.id)!;
    expect(rejected.status).toBe("rejected");
    expect(rejected.completed).toEqual(NOTHING);
    expect(rewind.teams.find((x) => x.teamId === fx.teamB.id)!.nodes.some((n) => n.submissionId === b2.id)).toBe(false);

    // The timeline runs from going Live to Finishing.
    expect(rewind.startAt).toBe(t(0).toISOString());
    expect(rewind.endAt).toBe(t(40).toISOString());
  });

  it("puts a Submission approved hours later at the time it was made", () => {
    const fx = seed();
    const s = submitAt(fx.teamA.id, fx.alice.id, t(2), { nodeId: fx.tanz.id, itemName: "Tanzanite fang" });
    approveSubmission(db, { submissionId: s.id, reviewedByUserId: fx.mod.id });
    expect(db.select().from(submissions).where(eq(submissions.id, s.id)).get()!.reviewedAt!.getTime()).toBeGreaterThan(t(40).getTime());

    const rewind = getRewind(db, finish(fx.bingo.id, fx.mod.id));
    expect(rewind.submissions[0]!.submittedAt).toBe(t(2).toISOString());
    const fang = rewind.teams.find((x) => x.teamId === fx.teamA.id)!.nodes.find((n) => n.nodeId === fx.tanz.id)!;
    expect(fang.completedAt).toBe(t(2).toISOString());
    expect(stateAt(rewind, fx.teamA.id, t(1)).has(fx.tanz.id)).toBe(false);
    expect(stateAt(rewind, fx.teamA.id, t(2)).get(fx.tanz.id)).toBe(10);
  });

  it("keeps a Tile incomplete until the Submission that completes it, and says what each one completed", () => {
    const fx = seed();
    const a1 = submitAt(fx.teamA.id, fx.alice.id, t(1), { nodeId: fx.tanz.id, itemName: "Tanzanite fang" });
    const a2 = submitAt(fx.teamA.id, fx.alice.id, t(6), { nodeId: fx.scalesLeaf.id, itemName: "Zulrah's scales", quantity: 3 });
    const b1 = submitAt(fx.teamB.id, fx.bob.id, t(2), { nodeId: fx.tanz.id, itemName: "Tanzanite fang" });
    const b2 = submitAt(fx.teamB.id, fx.bob.id, t(3), { nodeId: fx.scalesLeaf.id, itemName: "Zulrah's scales", quantity: 3 });
    for (const s of [a1, a2, b1, b2]) approveSubmission(db, { submissionId: s.id, reviewedByUserId: fx.mod.id });

    const rewind = getRewind(db, finish(fx.bingo.id, fx.mod.id));
    const tileNodeId = db.select().from(schema.tiles).where(eq(schema.tiles.name, "ZULRAH")).get()!.nodeId;
    expect(stateAt(rewind, fx.teamA.id, t(5)).has(tileNodeId)).toBe(false);
    expect(stateAt(rewind, fx.teamA.id, t(6)).has(tileNodeId)).toBe(true);

    const byId = new Map(rewind.submissions.map((s) => [s.id, s]));
    // Team A was first to the Fang Part, Team B first to finish the Tile.
    expect(byId.get(a1.id)!.completed.firstParts).toEqual(["ZULRAH — Fang"]);
    expect(byId.get(b2.id)!.completed).toMatchObject({ tiles: ["ZULRAH"], firstTiles: ["ZULRAH"], firstParts: ["ZULRAH — Scales"] });
    expect(byId.get(a2.id)!.completed).toMatchObject({ tiles: ["ZULRAH"], firstTiles: [], firstParts: [] });
    expect(byId.get(b2.id)!.significance.tier).not.toBe("minor");
    expect(byId.get(a2.id)!.tileId).toBe(db.select().from(schema.tiles).where(eq(schema.tiles.name, "ZULRAH")).get()!.id);
    expect(byId.get(a2.id)!.screenshotUrl).toBe(`/uploads/${a2.id}.png`);
  });

  it("shows Reactions to everyone and counts them toward Significance", () => {
    const fx = seed();
    const s = submitAt(fx.teamA.id, fx.alice.id, t(1), { nodeId: fx.head.id, itemName: "Vorkath's head" });
    approveSubmission(db, { submissionId: s.id, reviewedByUserId: fx.mod.id });
    const quiet = getRewind(db, finish(fx.bingo.id, fx.mod.id)).submissions[0]!;
    for (const emoji of ["🔥", "🎉", "😂", "💀", "👀"]) db.insert(schema.submissionReactions).values({ submissionId: s.id, userId: fx.alice.id, emoji }).run();
    const loud = getRewind(db, db.select().from(bingos).where(eq(bingos.id, fx.bingo.id)).get()!).submissions[0]!;
    expect(loud.reactions).toHaveLength(5);
    expect(loud.significance.score).toBeGreaterThan(quiet.significance.score);
  });
});
