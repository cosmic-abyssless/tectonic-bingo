import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { claims, stageTransitions, submissions, teamNodeState, teamPointAdjustments } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTile, createTask, generateLines } from "./boardService";
import { approveSubmission, rejectSubmission } from "./scoringService";
import { getTeamProgress } from "./teamService";
import { getDropRates } from "./luck/dropRates";
import { luckOf } from "./luck/luck";
import { filterStatsForTeam, getContributionCounts, getPointsOverTime, getStats, getStatsForViewer, getTileHeatmap, getTimeline } from "./statsService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

interface Fixture {
  bingoId: string;
  teamAId: string;
  teamBId: string;
  modUserId: string;
  memberUserId: string;
  tileId: string;
}

function seedFixture(): Fixture {
  const [admin] = db.insert(schema.users).values({ discordId: "mod", discordUsername: "mod" }).returning().all();
  const [member] = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().all();
  const [captainA] = db.insert(schema.users).values({ discordId: "captainA", discordUsername: "captainA" }).returning().all();
  const [captainB] = db.insert(schema.users).values({ discordId: "captainB", discordUsername: "captainB" }).returning().all();
  const [bingo] = db.insert(schema.bingos).values({ slug: "test", name: "Test Bingo", boardRows: 2, boardCols: 2, createdByUserId: admin.id }).returning().all();
  const [teamA] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captainA.id, name: "Team A", codeword: "word-a" }).returning().all();
  const [teamB] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captainB.id, name: "Team B", codeword: "word-b" }).returning().all();
  const tile = createTile(db, { bingoId: bingo.id, name: "Test Tile", boardRow: 0, boardCol: 0 });
  return { bingoId: bingo.id, teamAId: teamA.id, teamBId: teamB.id, modUserId: admin.id, memberUserId: member.id, tileId: tile.id };
}

// A bare ITEM-leaf task for "Bruma torch" — its own node id is the leaf id.
function addTask(tileId: string, opts: { points: number }) {
  return createTask(db, tileId, { kind: "ITEM", itemName: "Bruma torch", label: "Task", description: "desc", points: opts.points });
}
function submit(teamId: string, nodeId: string, submittedByUserId: string) {
  const [submission] = db.insert(submissions).values({ teamId, submittedByUserId }).returning().all();
  db.insert(claims).values({ submissionId: submission.id, nodeId, itemName: "Bruma torch" }).run();
  return submission;
}
function submitAndApprove(teamId: string, nodeId: string, submittedByUserId: string, modUserId: string) {
  const submission = submit(teamId, nodeId, submittedByUserId);
  return approveSubmission(db, { submissionId: submission.id, reviewedByUserId: modUserId });
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("getPointsOverTime", () => {
  it("reconciles the final cumulative total with teamService.getTeamProgress", () => {
    const fx = seedFixture();
    const task = addTask(fx.tileId, { points: 20 });
    submitAndApprove(fx.teamAId, task.id, fx.memberUserId, fx.modUserId);
    db.insert(teamPointAdjustments).values({ teamId: fx.teamAId, bingoId: fx.bingoId, amount: -5, reason: "penalty", createdByUserId: fx.modUserId }).run();

    const series = getPointsOverTime(db, fx.bingoId);
    const teamAEvents = series.filter((e) => e.teamId === fx.teamAId);
    expect(teamAEvents.filter((e) => e.source === "adjustment")).toHaveLength(1);
    expect(teamAEvents.filter((e) => e.source === "node").length).toBeGreaterThanOrEqual(1); // at least the task itself; completing it may also complete the (0pt) tile node

    const finalCumulative = teamAEvents.at(-1)!.cumulativePoints;
    const progress = getTeamProgress(db, fx.teamAId);
    expect(finalCumulative).toBe(progress.totalPoints);
    expect(finalCumulative).toBe(20 - 5);
  });

  it("tracks separate running totals per team", () => {
    const fx = seedFixture();
    const task = addTask(fx.tileId, { points: 20 });
    submitAndApprove(fx.teamAId, task.id, fx.memberUserId, fx.modUserId);
    submitAndApprove(fx.teamBId, task.id, fx.memberUserId, fx.modUserId);

    const series = getPointsOverTime(db, fx.bingoId);
    expect(series.filter((e) => e.teamId === fx.teamAId).at(-1)!.cumulativePoints).toBe(20);
    expect(series.filter((e) => e.teamId === fx.teamBId).at(-1)!.cumulativePoints).toBe(20);
  });

  it("leaves out nodes completed for no points, so every event moved the total", () => {
    const fx = seedFixture();
    const task = addTask(fx.tileId, { points: 20 });
    submitAndApprove(fx.teamAId, task.id, fx.memberUserId, fx.modUserId);
    // The completed item leaf earns nothing itself; only the task above it does.
    const rows = db.select().from(teamNodeState).where(eq(teamNodeState.teamId, fx.teamAId)).all();
    const series = getPointsOverTime(db, fx.bingoId);
    expect(series.length).toBeGreaterThan(0);
    expect(series.every((e) => e.delta !== 0)).toBe(true);
    expect(series.length).toBeLessThanOrEqual(rows.length);
  });

  it("returns an empty series for a bingo with no teams", () => {
    const [admin] = db.insert(schema.users).values({ discordId: "solo", discordUsername: "solo" }).returning().all();
    const [bingo] = db.insert(schema.bingos).values({ slug: "empty", name: "Empty", boardRows: 2, boardCols: 2, createdByUserId: admin.id }).returning().all();
    expect(getPointsOverTime(db, bingo.id)).toEqual([]);
  });
});

describe("getTimeline", () => {
  it("is the scoring history: points earned, line bonuses, adjustments, going live and ending, sorted chronologically", () => {
    const fx = seedFixture();
    const bingo = db.select().from(schema.bingos).where(eq(schema.bingos.id, fx.bingoId)).get()!;
    const tile2 = createTile(db, { bingoId: fx.bingoId, name: "Tile 2", boardRow: 0, boardCol: 1 });
    const task1 = addTask(fx.tileId, { points: 20 });
    const task2 = addTask(tile2.id, { points: 10 });
    generateLines(db, bingo, 15);

    for (const [fromStage, toStage] of [["signup", "draft"], ["reveal", "live"], ["live", "complete"]] as const) {
      db.insert(stageTransitions).values({ bingoId: fx.bingoId, fromStage, toStage, changedByUserId: fx.modUserId }).run();
    }

    submitAndApprove(fx.teamAId, task1.id, fx.memberUserId, fx.modUserId);
    submitAndApprove(fx.teamAId, task2.id, fx.memberUserId, fx.modUserId); // completes the row line too
    db.insert(teamPointAdjustments).values({ teamId: fx.teamAId, bingoId: fx.bingoId, amount: 15, reason: "well played", createdByUserId: fx.modUserId }).run();

    const timeline = getTimeline(db, fx.bingoId);
    const types = timeline.map((e) => e.type);
    expect(types).toContain("points_earned");
    expect(types).toContain("line_completed");
    expect(types).toContain("point_adjustment");
    expect(types).toContain("first_completion");
    expect(types).not.toContain("draft_pick");
    // Only the bingo going live and ending are milestones; other stage changes aren't in the timeline.
    expect(timeline.filter((e) => e.type === "stage_changed").map((e) => e.what)).toEqual(expect.arrayContaining(["The bingo went live", "The bingo ended"]));
    expect(timeline.filter((e) => e.type === "stage_changed")).toHaveLength(2);

    const rows = timeline.map(({ type, teamId, what, points }) => ({ type, teamId, what, points }));
    expect(rows).toContainEqual({ type: "points_earned", teamId: fx.teamAId, what: "Test Tile — Task", points: 20 });
    expect(rows).toContainEqual({ type: "line_completed", teamId: fx.teamAId, what: "Row 1 line bonus", points: 15 });
    expect(rows).toContainEqual({ type: "point_adjustment", teamId: fx.teamAId, what: "well played", points: 15 });

    const times = timeline.map((e) => e.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("only credits the earliest team as the first to complete a task", () => {
    const fx = seedFixture();
    const task = addTask(fx.tileId, { points: 20 });

    // completedAt is stored at 1-second resolution, so two approvals in the
    // same test tick can otherwise land in the same second — force a clear
    // gap so the "earliest" comparison isn't a coin flip on DB row order.
    submitAndApprove(fx.teamAId, task.id, fx.memberUserId, fx.modUserId);
    db.update(teamNodeState).set({ completedAt: new Date(Date.now() - 60_000) }).where(and(eq(teamNodeState.teamId, fx.teamAId), eq(teamNodeState.nodeId, task.id))).run();

    submitAndApprove(fx.teamBId, task.id, fx.memberUserId, fx.modUserId);
    db.update(teamNodeState).set({ completedAt: new Date() }).where(and(eq(teamNodeState.teamId, fx.teamBId), eq(teamNodeState.nodeId, task.id))).run();

    const firstCompletions = getTimeline(db, fx.bingoId).filter((e) => e.type === "first_completion" && e.what.includes("Task"));
    expect(firstCompletions).toHaveLength(1);
    expect(firstCompletions[0]!.teamId).toBe(fx.teamAId);
  });
});

describe("getContributionCounts", () => {
  it("counts only approved submissions, per submitter", () => {
    const fx = seedFixture();
    const task = addTask(fx.tileId, { points: 20 });
    submitAndApprove(fx.teamAId, task.id, fx.memberUserId, fx.modUserId);

    // A rejected submission from the same user shouldn't count.
    const rejected = submit(fx.teamAId, task.id, fx.memberUserId);
    db.update(submissions).set({ status: "rejected" }).where(eq(submissions.id, rejected.id)).run();

    const counts = getContributionCounts(db, fx.bingoId);
    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ userId: fx.memberUserId, teamId: fx.teamAId, approvedSubmissions: 1, pointsShare: 20 });
  });

  it("includes team members with nothing approved at 0", () => {
    const fx = seedFixture();
    const [idle] = db.insert(schema.users).values({ discordId: "idle", discordUsername: "idle" }).returning().all();
    db.insert(schema.teamMembers).values([{ teamId: fx.teamAId, userId: fx.memberUserId }, { teamId: fx.teamAId, userId: idle.id }]).run();
    const task = addTask(fx.tileId, { points: 20 });
    submitAndApprove(fx.teamAId, task.id, fx.memberUserId, fx.modUserId);

    const counts = getContributionCounts(db, fx.bingoId);
    expect(counts.map((c) => [c.userId, c.approvedSubmissions, c.pointsShare])).toEqual([
      [fx.memberUserId, 1, 20],
      [idle.id, 0, 0],
    ]);
  });

  it("credits the drop that completed a task, not a duplicate approved afterwards", () => {
    const fx = seedFixture();
    const [spammer] = db.insert(schema.users).values({ discordId: "spam", discordUsername: "spam" }).returning().all();
    const task = addTask(fx.tileId, { points: 20 });
    submitAndApprove(fx.teamAId, task.id, fx.memberUserId, fx.modUserId);
    db.update(submissions).set({ reviewedAt: new Date(Date.now() - 60_000) }).where(eq(submissions.submittedByUserId, fx.memberUserId)).run();
    submitAndApprove(fx.teamAId, task.id, spammer.id, fx.modUserId);
    submitAndApprove(fx.teamAId, task.id, spammer.id, fx.modUserId);

    const counts = getContributionCounts(db, fx.bingoId);
    const member = counts.find((c) => c.userId === fx.memberUserId)!;
    const spam = counts.find((c) => c.userId === spammer.id)!;
    expect(spam.approvedSubmissions).toBe(2);
    expect(spam.pointsShare).toBe(0);
    expect(member.pointsShare).toBe(20);
    expect(member.awards[0]).toMatchObject({ label: "Test Tile — Task", awardPoints: 20, points: 20, claims: [{ label: "Bruma torch", quantity: 1 }] });
    expect(counts[0]!.userId).toBe(fx.memberUserId);
  });
});

describe("getTileHeatmap", () => {
  it("reports completedTasks/totalTasks per team per tile", () => {
    const fx = seedFixture();
    const task1 = addTask(fx.tileId, { points: 20 });
    addTask(fx.tileId, { points: 30 }); // never completed by anyone

    submitAndApprove(fx.teamAId, task1.id, fx.memberUserId, fx.modUserId);

    const cells = getTileHeatmap(db, fx.bingoId);
    const teamACell = cells.find((c) => c.teamId === fx.teamAId && c.tileId === fx.tileId)!;
    const teamBCell = cells.find((c) => c.teamId === fx.teamBId && c.tileId === fx.tileId)!;
    expect(teamACell).toMatchObject({ completedTasks: 1, totalTasks: 2 });
    expect(teamBCell).toMatchObject({ completedTasks: 0, totalTasks: 2 });
  });
});

describe("filterStatsForTeam", () => {
  it("keeps only the team's own rows and drops stage changes", () => {
    const fx = seedFixture();
    const task = addTask(fx.tileId, { points: 20 });
    submitAndApprove(fx.teamAId, task.id, fx.memberUserId, fx.modUserId);
    submitAndApprove(fx.teamBId, task.id, fx.memberUserId, fx.modUserId);
    db.insert(stageTransitions).values({ bingoId: fx.bingoId, fromStage: "reveal", toStage: "live", changedByUserId: fx.modUserId }).run();

    const own = filterStatsForTeam(getStats(db, fx.bingoId), fx.teamAId);
    for (const rows of [own.pointsOverTime, own.timeline, own.contributions, own.heatmap]) {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.teamId === fx.teamAId)).toBe(true);
    }
  });
});

describe("getStatsForViewer", () => {
  // Team A completes the task a minute before team B, and the bingo went live.
  function seedRace() {
    const fx = seedFixture();
    const task = addTask(fx.tileId, { points: 20 });
    submitAndApprove(fx.teamAId, task.id, fx.memberUserId, fx.modUserId);
    db.update(teamNodeState).set({ completedAt: new Date(Date.now() - 60_000) }).where(and(eq(teamNodeState.teamId, fx.teamAId), eq(teamNodeState.nodeId, task.id))).run();
    submitAndApprove(fx.teamBId, task.id, fx.memberUserId, fx.modUserId);
    db.insert(stageTransitions).values({ bingoId: fx.bingoId, fromStage: "reveal", toStage: "live", changedByUserId: fx.modUserId }).run();
    return fx;
  }
  const types = (timeline: { type: string }[]) => new Set(timeline.map((e) => e.type));

  it("gives a mod everything, including who was first to complete a task", () => {
    const fx = seedRace();
    const timeline = getStatsForViewer(db, fx.bingoId, { isMod: true, teamId: null, bingoComplete: false }).timeline;
    expect(timeline.filter((e) => e.type === "first_completion").map((e) => e.teamId)).toEqual([fx.teamAId]);
    expect(types(timeline)).toContain("stage_changed");
  });

  it("hides first completions from a player on a team while live, even their own team's", () => {
    const fx = seedRace();
    for (const teamId of [fx.teamAId, fx.teamBId]) {
      const timeline = getStatsForViewer(db, fx.bingoId, { isMod: false, teamId, bingoComplete: false }).timeline;
      expect(types(timeline)).not.toContain("first_completion");
      expect(timeline.length).toBeGreaterThan(0); // their own points are still there
      expect(timeline.every((e) => e.teamId === teamId)).toBe(true);
    }
  });

  it("shows first completions to players once the bingo is complete", () => {
    const fx = seedRace();
    const stats = getStatsForViewer(db, fx.bingoId, { isMod: false, teamId: null, bingoComplete: true });
    expect(stats.timeline.filter((e) => e.type === "first_completion").map((e) => e.teamId)).toEqual([fx.teamAId]);
    expect(types(stats.timeline)).toContain("points_earned");
    expect(stats.pointsOverTime.length).toBeGreaterThan(0);
  });
});

describe("GP gained", () => {
  // A claim with a GP value, approved or left in `status`.
  function valuedClaim(fx: Fixture, teamId: string, userId: string, gpValue: number, status: "approved" | "pending" | "rejected" = "approved") {
    const task = addTask(fx.tileId, { points: 1 });
    const [submission] = db.insert(submissions).values({ teamId, submittedByUserId: userId, status, reviewedAt: status === "pending" ? null : new Date() }).returning().all();
    db.insert(claims).values({ submissionId: submission.id, nodeId: task.id, itemName: "Bruma torch", gpValue }).run();
  }

  it("sums only approved claims' GP values, per player and per team", () => {
    const fx = seedFixture();
    valuedClaim(fx, fx.teamAId, fx.memberUserId, 1_000);
    valuedClaim(fx, fx.teamAId, fx.memberUserId, 500);
    valuedClaim(fx, fx.teamAId, fx.memberUserId, 9_999, "pending");
    valuedClaim(fx, fx.teamAId, fx.memberUserId, 9_999, "rejected");
    valuedClaim(fx, fx.teamBId, fx.modUserId, 200);

    const stats = getStats(db, fx.bingoId);
    expect(stats.teamGpGained).toEqual([
      { teamId: fx.teamAId, gpGained: 1_500 },
      { teamId: fx.teamBId, gpGained: 200 },
    ]);
    expect(stats.contributions.find((c) => c.userId === fx.memberUserId)!.gpGained).toBe(1_500);
    expect(stats.drops.map((d) => d.gpValue)).toEqual([1_000, 500, 200]);
  });

  it("shows a player only their own team's GP and drops", () => {
    const fx = seedFixture();
    for (let i = 1; i <= 12; i++) valuedClaim(fx, fx.teamAId, fx.memberUserId, i * 1_000);
    valuedClaim(fx, fx.teamBId, fx.modUserId, 1_000_000);

    const player = getStatsForViewer(db, fx.bingoId, { isMod: false, teamId: fx.teamAId, bingoComplete: false });
    expect(player.teamGpGained.map((t) => t.teamId)).toEqual([fx.teamAId]);
    expect(player.drops).toHaveLength(12);
    expect(player.drops.every((d) => d.teamId === fx.teamAId)).toBe(true);

    const mod = getStatsForViewer(db, fx.bingoId, { isMod: true, teamId: null, bingoComplete: false });
    expect(mod.drops).toHaveLength(13);
    expect(mod.drops[0]!.gpValue).toBe(1_000_000);
  });
});

describe("GP drops' Valued as", () => {
  it("tells why a drop has its value when its Task is Valued as something", () => {
    const fx = seedFixture();
    const ring = createTask(db, fx.tileId, { kind: "ITEM", itemName: "Gold ring", label: "Vardorvis page", valuedAs: { itemName: "Ultor vestige", divisor: 3, source: "Vardorvis" } });
    const [submission] = db.insert(submissions).values({ teamId: fx.teamAId, submittedByUserId: fx.memberUserId, status: "approved", reviewedAt: new Date() }).returning().all();
    db.insert(claims).values({ submissionId: submission.id, nodeId: ring.id, itemName: "Gold ring", gpValue: 33_000_000 }).run();

    expect(getStats(db, fx.bingoId).drops[0]!.valuedAs).toEqual({ itemName: "Ultor vestige", divisor: 3, source: "Vardorvis" });
  });
});

describe("Title facts", () => {
  // Two players on team A and one on team B, each on their team's roster.
  function seedPlayers() {
    const fx = seedFixture();
    const [second] = db.insert(schema.users).values({ discordId: "second", discordUsername: "second" }).returning().all();
    const [rival] = db.insert(schema.users).values({ discordId: "rival", discordUsername: "rival" }).returning().all();
    db.insert(schema.teamMembers).values([
      { teamId: fx.teamAId, userId: fx.memberUserId },
      { teamId: fx.teamAId, userId: second.id },
      { teamId: fx.teamBId, userId: rival.id },
    ]).run();
    return { ...fx, secondUserId: second.id, rivalUserId: rival.id };
  }
  function submitItem(teamId: string, nodeId: string, itemName: string, submittedByUserId: string, opts: { quantity?: number; postedByUserId?: string } = {}) {
    const [submission] = db.insert(submissions).values({ teamId, submittedByUserId, postedByUserId: opts.postedByUserId ?? null }).returning().all();
    db.insert(claims).values({ submissionId: submission.id, nodeId, itemName, quantity: opts.quantity ?? 1 }).run();
    return submission;
  }
  const factsOf = (bingoId: string, userId: string) => getStats(db, bingoId).titleFacts.find((f) => f.userId === userId)!;

  afterEach(() => vi.useRealTimers());

  it("marks the award closed for whoever's Claim was approved last, and maps it to its Tile", () => {
    const fx = seedPlayers();
    const task = createTask(db, fx.tileId, { kind: "ALL", label: "Set", points: 20, children: [{ kind: "ITEM", itemName: "Visage" }, { kind: "ITEM", itemName: "Vorki" }] });
    const [visage, vorki] = task.children!;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-10T10:00:00Z"));
    approveSubmission(db, { submissionId: submitItem(fx.teamAId, visage!.id, "Visage", fx.memberUserId).id, reviewedByUserId: fx.modUserId });
    vi.setSystemTime(new Date("2026-01-10T11:00:00Z"));
    approveSubmission(db, { submissionId: submitItem(fx.teamAId, vorki!.id, "Vorki", fx.secondUserId).id, reviewedByUserId: fx.modUserId });

    const closed = (userId: string) => factsOf(fx.bingoId, userId).awards.find((a) => a.kind === "task")!;
    expect(closed(fx.memberUserId)).toMatchObject({ closed: false, points: 10, tileName: "Test Tile" });
    expect(closed(fx.secondUserId)).toMatchObject({ closed: true, points: 10, completedAt: "2026-01-10T11:00:00.000Z" });
    expect(factsOf(fx.bingoId, fx.memberUserId).teamAwardPoints).toBe(20);
  });

  it("counts a rejection to whoever posted it, and approved posts for a teammate", () => {
    const fx = seedPlayers();
    const task = addTask(fx.tileId, { points: 5 });
    for (let i = 0; i < 2; i++) {
      const s = submitItem(fx.teamAId, task.id, "Bruma torch", fx.memberUserId, { postedByUserId: fx.secondUserId });
      rejectSubmission(db, { submissionId: s.id, reviewedByUserId: fx.modUserId, reviewerNotes: "no codeword" });
    }
    rejectSubmission(db, { submissionId: submitItem(fx.teamAId, task.id, "Bruma torch", fx.memberUserId).id, reviewedByUserId: fx.modUserId, reviewerNotes: "blurry" });
    approveSubmission(db, { submissionId: submitItem(fx.teamAId, task.id, "Bruma torch", fx.memberUserId, { postedByUserId: fx.secondUserId }).id, reviewedByUserId: fx.modUserId });

    expect(factsOf(fx.bingoId, fx.secondUserId)).toMatchObject({ rejectedSubmissions: 2, postedForTeammates: 1, approvedSubmissions: 0 });
    expect(factsOf(fx.bingoId, fx.memberUserId)).toMatchObject({ rejectedSubmissions: 1, postedForTeammates: 0, approvedSubmissions: 1 });
  });

  it("counts a Moderator's rejected post to the Player it was for", () => {
    const fx = seedPlayers();
    const task = addTask(fx.tileId, { points: 5 });
    const s = submitItem(fx.teamAId, task.id, "Bruma torch", fx.memberUserId, { postedByUserId: fx.modUserId });
    rejectSubmission(db, { submissionId: s.id, reviewedByUserId: fx.modUserId, reviewerNotes: "wrong item" });
    expect(factsOf(fx.bingoId, fx.memberUserId).rejectedSubmissions).toBe(1);
  });

  it("counts distinct items and total quantity from approved Claims", () => {
    const fx = seedPlayers();
    const sum = createTask(db, fx.tileId, { kind: "SUM", label: "Shards", quantity: 100, points: 5, children: [{ kind: "ITEM", itemName: "Blood shard" }, { kind: "ITEM", itemName: "Onyx" }] });
    const [shard, onyx] = sum.children!;
    for (const [node, name, quantity] of [[shard!, "Blood shard", 3], [shard!, "Blood shard", 4], [onyx!, "Onyx", 1]] as const) {
      approveSubmission(db, { submissionId: submitItem(fx.teamAId, node.id, name, fx.memberUserId, { quantity }).id, reviewedByUserId: fx.modUserId });
    }
    submitItem(fx.teamAId, onyx!.id, "Onyx", fx.memberUserId, { quantity: 50 }); // pending: doesn't count
    expect(factsOf(fx.bingoId, fx.memberUserId)).toMatchObject({ distinctItems: 2, totalQuantity: 8 });
  });

  it("gives a Player only their own Team's facts while the Bingo is Live", () => {
    const fx = seedPlayers();
    const task = addTask(fx.tileId, { points: 5 });
    approveSubmission(db, { submissionId: submitItem(fx.teamBId, task.id, "Bruma torch", fx.rivalUserId).id, reviewedByUserId: fx.modUserId });
    const facts = getStatsForViewer(db, fx.bingoId, { isMod: false, teamId: fx.teamAId, bingoComplete: false }).titleFacts;
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.teamId === fx.teamAId)).toBe(true);
    expect(getStatsForViewer(db, fx.bingoId, { isMod: true, teamId: null, bingoComplete: false }).titleFacts.map((f) => f.userId)).toContain(fx.rivalUserId);
  });

  it("adds each Player's Wise Old Man gains from their stored snapshots", () => {
    const fx = seedPlayers();
    db.update(schema.bingos).set({ startsAt: new Date("2026-01-10T00:00:00Z") }).where(eq(schema.bingos.id, fx.bingoId)).run();
    const snap = (at: string, ehb: number) => ({ bingoId: fx.bingoId, userId: fx.memberUserId, takenAt: new Date(at), ehb, ehp: 1, clues: 2, bossKillsJson: "{}" });
    db.insert(schema.womSnapshots).values([snap("2026-01-09T20:00:00Z", 100), snap("2026-01-11T20:00:00Z", 112.5)]).run();
    expect(factsOf(fx.bingoId, fx.memberUserId).wom).toEqual({ ehb: 12.5, ehp: 0, clues: 0, asOf: "2026-01-11T20:00:00.000Z" });
    expect(factsOf(fx.bingoId, fx.secondUserId).wom).toBeNull();
  });
});

describe("Luck facts", () => {
  const START = new Date("2026-01-10T00:00:00Z");
  const hours = (h: number) => new Date(START.getTime() + h * 60 * 60 * 1000);
  // Virtus also drops from the other three DT2 bosses: they're at 0 so only Vardorvis kills count.
  const DT2 = { duke_sucellus: 0, the_leviathan: 0, the_whisperer: 0 };
  const vardorvisRate = (item: string) => getDropRates().sourcesOf(item).find((s) => s.metric === "vardorvis")!.rate;

  function seedLuck() {
    const fx = seedFixture();
    const [second] = db.insert(schema.users).values({ discordId: "second", discordUsername: "second" }).returning().all();
    const [rival] = db.insert(schema.users).values({ discordId: "rival", discordUsername: "rival" }).returning().all();
    db.insert(schema.teamMembers).values([
      { teamId: fx.teamAId, userId: fx.memberUserId },
      { teamId: fx.teamAId, userId: second.id },
      { teamId: fx.teamBId, userId: rival.id },
    ]).run();
    db.update(schema.bingos).set({ startsAt: START }).where(eq(schema.bingos.id, fx.bingoId)).run();
    return { ...fx, secondUserId: second.id, rivalUserId: rival.id };
  }
  function timeline(bingoId: string, userId: string, snaps: [number, number][]) {
    db.insert(schema.womSnapshots).values(snaps.map(([h, vardorvis]) => ({ bingoId, userId, takenAt: hours(h), ehb: 0, ehp: 0, clues: 0, bossKillsJson: JSON.stringify({ vardorvis, ...DT2 }) }))).run();
  }
  function drop(teamId: string, nodeId: string, itemName: string, userId: string, h: number, modUserId: string, gpValue: number | null = null) {
    const [submission] = db.insert(submissions).values({ teamId, submittedByUserId: userId, submittedAt: hours(h) }).returning().all();
    db.insert(claims).values({ submissionId: submission.id, nodeId, itemName, gpValue }).run();
    approveSubmission(db, { submissionId: submission.id, reviewedByUserId: modUserId });
  }
  const luckOfPlayer = (bingoId: string, userId: string) => getStats(db, bingoId).titleFacts.find((f) => f.userId === userId)!.luck;

  it("judges a Player's drop on the kills between their snapshots", () => {
    const fx = seedLuck();
    const task = createTask(db, fx.tileId, { kind: "ITEM", itemName: "Ultor vestige", label: "Ultor", points: 10 });
    timeline(fx.bingoId, fx.memberUserId, [[-2, 100], [5, 110]]);
    drop(fx.teamAId, task.id, "Ultor vestige", fx.memberUserId, 4, fx.modUserId, 90_000_000);

    const luck = luckOfPlayer(fx.bingoId, fx.memberUserId)!;
    expect(luck.spoon).toMatchObject({ itemName: "Ultor vestige", kills: 10 });
    expect(luck.spoon!.value).toBeCloseTo(luckOf(10 * vardorvisRate("Ultor vestige")));
    expect(luck.clutch).toMatchObject({ itemName: "Ultor vestige", gpValue: 90_000_000 });
  });

  it("judges Clutch on the outermost award the Claim earned Points share on", () => {
    const fx = seedLuck();
    const part = createTask(db, fx.tileId, { kind: "ALL", label: "Virtus", points: 30, children: [{ kind: "ITEM", itemName: "Virtus mask", points: 10 }, { kind: "ITEM", itemName: "Virtus robe top", points: 10 }] });
    const [mask, top] = part.children!;
    timeline(fx.bingoId, fx.memberUserId, [[-2, 0], [5, 10]]);
    drop(fx.teamAId, mask!.id, "Virtus mask", fx.memberUserId, 4, fx.modUserId);
    drop(fx.teamAId, top!.id, "Virtus robe top", fx.secondUserId, 6, fx.modUserId);

    // Credited on the mask's own Task and on the Part: the Part still needed either piece.
    const clutch = luckOfPlayer(fx.bingoId, fx.memberUserId)!.clutch!;
    expect(clutch.luck).toBeCloseTo(luckOf(10 * (vardorvisRate("Virtus mask") + vardorvisRate("Virtus robe top"))));
  });

  it("gives no Clutch to a Claim that earned no Points share, but still counts it for Spoon", () => {
    const fx = seedLuck();
    const task = createTask(db, fx.tileId, { kind: "ITEM", itemName: "Ultor vestige", label: "Ultor", points: 10 });
    timeline(fx.bingoId, fx.secondUserId, [[-2, 0], [3, 5]]);
    drop(fx.teamAId, task.id, "Ultor vestige", fx.memberUserId, 1, fx.modUserId);
    drop(fx.teamAId, task.id, "Ultor vestige", fx.secondUserId, 2, fx.modUserId);

    const luck = luckOfPlayer(fx.bingoId, fx.secondUserId)!;
    expect(luck.clutch).toBeNull();
    expect(luck.spoon).toMatchObject({ itemName: "Ultor vestige", kills: 5 });
  });

  it("gives no luck to a Player without a snapshot from before the Bingo", () => {
    const fx = seedLuck();
    const task = createTask(db, fx.tileId, { kind: "ITEM", itemName: "Ultor vestige", label: "Ultor", points: 10 });
    timeline(fx.bingoId, fx.memberUserId, [[1, 100], [5, 110]]);
    drop(fx.teamAId, task.id, "Ultor vestige", fx.memberUserId, 4, fx.modUserId);
    expect(luckOfPlayer(fx.bingoId, fx.memberUserId)!.spoon).toBeNull();
    expect(luckOfPlayer(fx.bingoId, fx.secondUserId)).toBeNull();
  });

  it("measures Dry from the Player's own Team's drops, and shows it to that Team only while Live", () => {
    const fx = seedLuck();
    const task = createTask(db, fx.tileId, { kind: "ITEM", itemName: "Ultor vestige", label: "Ultor", points: 10 });
    timeline(fx.bingoId, fx.rivalUserId, [[-2, 0], [10, 3000]]);
    drop(fx.teamAId, task.id, "Ultor vestige", fx.memberUserId, 4, fx.modUserId);

    // Team A's Ultor doesn't end the rival's streak.
    expect(luckOfPlayer(fx.bingoId, fx.rivalUserId)!.dry).toMatchObject({ boss: "Vardorvis", kills: 3000 });
    const own = getStatsForViewer(db, fx.bingoId, { isMod: false, teamId: fx.teamAId, bingoComplete: false }).titleFacts;
    expect(own.some((f) => f.userId === fx.rivalUserId)).toBe(false);
  });
});
