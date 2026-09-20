import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { claims, stageTransitions, submissions, teamNodeState, teamPointAdjustments } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTile, createTask, generateLines } from "./boardService";
import { approveSubmission } from "./scoringService";
import { getTeamProgress } from "./teamService";
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
    expect(timeline.filter((e) => e.type === "stage_changed").map((e) => e.label)).toEqual(expect.arrayContaining(["The bingo went live", "The bingo ended"]));
    expect(timeline.filter((e) => e.type === "stage_changed")).toHaveLength(2);

    const labels = timeline.map((e) => e.label);
    expect(labels).toContain("Team A completed Test Tile — Task (+20)");
    expect(labels.some((l) => /^Team A earned the row 1 line bonus \(\+15\)$/.test(l))).toBe(true);
    expect(labels).toContain("Team A got +15 from a moderator: well played");

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

    const firstCompletions = getTimeline(db, fx.bingoId).filter((e) => e.type === "first_completion" && e.label.includes("Task"));
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
    expect(counts[0]).toMatchObject({ userId: fx.memberUserId, teamId: fx.teamAId, approvedSubmissions: 1 });
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
    const timeline = getStatsForViewer(db, fx.bingoId, { isMod: true, teamId: null }).timeline;
    expect(timeline.filter((e) => e.type === "first_completion").map((e) => e.teamId)).toEqual([fx.teamAId]);
    expect(types(timeline)).toContain("stage_changed");
  });

  it("hides first completions from a player on a team, even their own team's", () => {
    const fx = seedRace();
    for (const teamId of [fx.teamAId, fx.teamBId]) {
      const timeline = getStatsForViewer(db, fx.bingoId, { isMod: false, teamId }).timeline;
      expect(types(timeline)).not.toContain("first_completion");
      expect(timeline.length).toBeGreaterThan(0); // their own points are still there
      expect(timeline.every((e) => e.teamId === teamId)).toBe(true);
    }
  });

  it("hides first completions from a player who sees every team too (once the bingo is complete)", () => {
    const fx = seedRace();
    const stats = getStatsForViewer(db, fx.bingoId, { isMod: false, teamId: null });
    expect(types(stats.timeline)).not.toContain("first_completion");
    expect(types(stats.timeline)).toContain("points_earned");
    expect(stats.pointsOverTime.length).toBeGreaterThan(0);
  });
});
