// bingo_summary, tile_stats and player_contributions on a seeded, Finished Bingo, checked against the Stats page's
// services (statsService, teamService) so the tools can't drift from what the site shows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { bingos, claims, signups, stageTransitions, submissions, teamMembers, teamPointAdjustments, teams, tileInterests, users, womSnapshots } from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { createTask, createTile, generateLines } from "../../services/boardService";
import { approveSubmission, rejectSubmission } from "../../services/scoringService";
import { getPointsOverTime, getStats } from "../../services/statsService";
import { getTeamProgress } from "../../services/teamService";
import { McpToolError, type McpToolContext } from "../tool";
import { bingoSummary } from "./bingoSummary";
import { playerContributions } from "./playerContributions";
import { tileStats } from "./tileStats";
import { fitList } from "./common";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let ctx: McpToolContext;

const T0 = new Date("2026-06-01T12:00:00Z");
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);

interface Seed {
  bingoId: string;
  teamA: string;
  teamB: string;
  alice: string;
  bob: string;
  carol: string;
}

/**
 * A 1×2 board. "Zulrah" has two Tasks (a 10-point Tanzanite fang and a 5-point Magic fang); "Vorkath" one 20-point
 * Task. Every Line (the row and both one-Tile columns) is worth 15. Team A completes the whole board, so all three
 * Lines; Team B only the fang. Bob's first Magic fang
 * is rejected with a note. Team A gets a −3 Point adjustment after the end.
 */
function seed(): Seed {
  const user = (name: string, extra: Partial<typeof users.$inferInsert> = {}) => db.insert(users).values({ discordId: name, discordUsername: name, ...extra }).returning().get().id;
  const mod = user("mod", { isAdmin: true });
  const alice = user("alice", { discordGlobalName: "Alice G" });
  const bob = user("bob");
  const carol = user("carol");
  const bingo = db.insert(bingos).values({ slug: "summer", name: "Summer Bingo", boardRows: 1, boardCols: 2, createdByUserId: mod, stage: "live", startsAt: T0 }).returning().get();
  const teamA = db.insert(teams).values({ bingoId: bingo.id, captainUserId: alice, name: "Team A", codeword: "a" }).returning().get().id;
  const teamB = db.insert(teams).values({ bingoId: bingo.id, captainUserId: carol, name: "Team B", codeword: "b" }).returning().get().id;
  db.insert(teamMembers).values([{ teamId: teamA, userId: alice }, { teamId: teamA, userId: bob }, { teamId: teamB, userId: carol }]).run();
  db.insert(signups).values([{ bingoId: bingo.id, userId: alice, rsn: "Alice RSN" }, { bingoId: bingo.id, userId: bob, rsn: "Bob RSN" }, { bingoId: bingo.id, userId: carol, rsn: "Carol RSN" }]).run();

  const zulrah = createTile(db, { bingoId: bingo.id, name: "Zulrah", boardRow: 0, boardCol: 0 });
  const vorkath = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 1 });
  const fang = createTask(db, zulrah.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  const magic = createTask(db, zulrah.id, { kind: "ITEM", itemName: "Magic fang", label: "Magic fang", points: 5 });
  const head = createTask(db, vorkath.id, { kind: "ITEM", itemName: "Vorkath's head", label: "Head", points: 20 });
  generateLines(db, bingo, 15);
  db.insert(tileInterests).values([
    { tileId: vorkath.id, taskId: head.id, teamId: teamA, userId: alice },
    { tileId: vorkath.id, taskId: head.id, teamId: teamA, userId: bob },
    { tileId: vorkath.id, taskId: head.id, teamId: teamB, userId: carol },
  ]).run();

  const submit = (teamId: string, userId: string, nodeId: string, itemName: string, hours: number, gpValue: number | null = null) => {
    vi.setSystemTime(at(hours));
    const id = db.insert(submissions).values({ teamId, submittedByUserId: userId, submittedAt: at(hours) }).returning().get().id;
    db.insert(claims).values({ submissionId: id, nodeId, itemName, gpValue }).run();
    return id;
  };
  const approve = (id: string, hours: number) => {
    vi.setSystemTime(at(hours));
    approveSubmission(db, { submissionId: id, reviewedByUserId: mod });
  };

  approve(submit(teamA, alice, fang.id, "Tanzanite fang", 2, 3_000_000), 3);
  approve(submit(teamB, carol, fang.id, "Tanzanite fang", 5, 3_100_000), 6);
  const rejected = submit(teamA, bob, magic.id, "Magic fang", 7);
  vi.setSystemTime(at(8));
  rejectSubmission(db, { submissionId: rejected, reviewedByUserId: mod, reviewerNotes: "No codeword in the screenshot" });
  approve(submit(teamA, bob, magic.id, "Magic fang", 9, 2_000_000), 10);
  approve(submit(teamA, bob, head.id, "Vorkath's head", 20), 30);
  submit(teamB, carol, head.id, "Vorkath's head", 40); // left pending

  db.insert(stageTransitions).values([
    { bingoId: bingo.id, fromStage: "reveal", toStage: "live", changedByUserId: mod, createdAt: at(-1) },
    { bingoId: bingo.id, fromStage: "live", toStage: "complete", changedByUserId: mod, createdAt: at(48) },
  ]).run();
  db.update(bingos).set({ stage: "complete" }).where(eq(bingos.id, bingo.id)).run();
  db.insert(teamPointAdjustments).values({ teamId: teamA, bingoId: bingo.id, amount: -3, reason: "Late screenshot", createdByUserId: mod, createdAt: at(50) }).run();

  const snap = (userId: string, hours: number, ehb: number, clues: number) => ({ bingoId: bingo.id, userId, takenAt: at(hours), ehb, ehp: 1, clues, bossKillsJson: "{}" });
  db.insert(womSnapshots).values([snap(alice, -2, 100, 10), snap(alice, 24, 104.567, 13), snap(alice, 60, 200, 99)]).run();

  vi.setSystemTime(at(72));
  return { bingoId: bingo.id, teamA, teamB, alice, bob, carol };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  ({ sqlite, db } = createTestDb());
  ctx = { db, user: db.insert(users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get() };
});

afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

describe("bingo_summary", () => {
  it("ranks Teams by the scoreboard's points and buckets them over time", () => {
    const s = seed();
    const out = bingoSummary.run({ slug: "summer" }, ctx) as any;
    const totalA = getTeamProgress(db, s.teamA).totalPoints;
    const totalB = getTeamProgress(db, s.teamB).totalPoints;
    expect(totalA).toBe(10 + 5 + 20 + 3 * 15 - 3);
    expect(out.standings).toEqual([
      { rank: 1, team: "Team A", points: totalA, gpGained: 5_000_000 },
      { rank: 2, team: "Team B", points: totalB, gpGained: 3_100_000 },
    ]);
    expect(out.bingo).toEqual({ slug: "summer", name: "Summer Bingo", stage: "complete", finished: true });
    expect(out.timing).toMatchObject({ startedAt: T0.toISOString(), endedAt: at(48).toISOString(), durationHours: 48 });

    const series = out.pointsOverTime;
    expect(series.bucketHours).toBe(1);
    expect(series.teams).toEqual(["Team A", "Team B"]);
    // The last bucket runs to the late adjustment and matches the standings, as getPointsOverTime's running totals do.
    expect(series.buckets.at(-1).points).toEqual([totalA, totalB]);
    const last = (teamId: string) => getPointsOverTime(db, s.bingoId).filter((e) => e.teamId === teamId).at(-1)!.cumulativePoints;
    expect(series.buckets.at(-1).points).toEqual([last(s.teamA), last(s.teamB)]);
    expect(series.buckets.length).toBe(50);
    expect(series.buckets[2]).toEqual({ endsAtHours: 3, points: [10, 0] });
    expect(series.buckets[29]).toEqual({ endsAtHours: 30, points: [10 + 5 + 20 + 3 * 15, 10] });
  });

  it("widens buckets on request", () => {
    seed();
    const out = bingoSummary.run({ slug: "summer", bucketHours: 24 }, ctx) as any;
    expect(out.pointsOverTime.buckets.map((b: any) => b.endsAtHours)).toEqual([24, 48, 50]);
  });

  it("lists Lines with who earned their Points share, and every Stage change", () => {
    seed();
    const out = bingoSummary.run({ slug: "summer" }, ctx) as any;
    expect(out.lines[0]).toEqual({ line: "Column 1", team: "Team A", completedAtHours: 10, points: 15, pointsShares: [{ player: "Alice RSN", points: 10 }, { player: "Bob RSN", points: 5 }] });
    expect(out.lines.slice(1).map((l: any) => [l.line, l.completedAtHours]).sort()).toEqual([["Column 2", 30], ["Row 1", 30]]);
    // A Line's bonus is split by each Player's share of its Tiles, as the Stats page's Points shares are.
    const row = out.lines.find((l: any) => l.line === "Row 1");
    expect(row.pointsShares.map((p: any) => p.player)).toEqual(["Bob RSN", "Alice RSN"]);
    expect(row.pointsShares.reduce((sum: number, p: any) => sum + p.points, 0)).toBeCloseTo(15, 1);
    expect(out.stages.map((s: any) => [s.from, s.to])).toEqual([["reveal", "live"], ["live", "complete"]]);
  });
});

describe("tile_stats", () => {
  it("reports completions, Submissions, interest and points per Tile and Task", () => {
    const s = seed();
    const out = tileStats.run({ slug: "summer" }, ctx) as any;
    expect(out.tiles.map((t: any) => [t.tile, t.row, t.column])).toEqual([["Zulrah", 1, 1], ["Vorkath", 1, 2]]);

    const [zulrah, vorkath] = out.tiles;
    expect(zulrah).toMatchObject({
      pointsOnOffer: 15,
      pointsEarned: { total: 25, byTeam: { "Team A": 15, "Team B": 10 } },
      completedBy: [{ team: "Team A", hours: 10 }],
      teamsStarted: 2,
      submissions: { total: 4, approved: 3, rejected: 1, pending: 0 },
    });
    expect(zulrah.tasks).toEqual([
      {
        task: "Fang",
        pointsOnOffer: 10,
        pointsEarned: { total: 20, byTeam: { "Team A": 10, "Team B": 10 } },
        completedBy: [{ team: "Team A", hours: 3 }, { team: "Team B", hours: 6 }],
        submissions: { total: 2, approved: 2, rejected: 0, pending: 0, rejectionReasons: [] },
        interest: { teams: 0, players: 0 },
      },
      {
        task: "Magic fang",
        pointsOnOffer: 5,
        pointsEarned: { total: 5, byTeam: { "Team A": 5 } },
        completedBy: [{ team: "Team A", hours: 10 }],
        submissions: { total: 2, approved: 1, rejected: 1, pending: 0, rejectionReasons: ["No codeword in the screenshot"] },
        interest: { teams: 0, players: 0 },
      },
    ]);
    expect(vorkath.tasks[0]).toMatchObject({ submissions: { total: 2, approved: 1, pending: 1 }, interest: { teams: 2, players: 3 } });

    // Earned points reconcile with the scoreboard: every Tile's points plus the Line bonus and adjustment.
    const earnedA = out.tiles.reduce((sum: number, t: any) => sum + (t.pointsEarned.byTeam["Team A"] ?? 0), 0);
    expect(earnedA + 3 * 15 - 3).toBe(getTeamProgress(db, s.teamA).totalPoints);
    // teamsStarted agrees with the Stats page's heatmap.
    const heat = getStats(db, s.bingoId).heatmap.filter((c) => c.tile !== "none");
    expect(heat.length).toBe(zulrah.teamsStarted + vorkath.teamsStarted);
  });

  it("filters Tiles by name and says when it left some out", () => {
    seed();
    expect((tileStats.run({ slug: "summer", tile: "vork" }, ctx) as any).tiles.map((t: any) => t.tile)).toEqual(["Vorkath"]);
    const limited = tileStats.run({ slug: "summer", limit: 1 }, ctx) as any;
    expect(limited.tiles).toHaveLength(1);
    expect(limited.truncated).toMatch(/^Showing 1 of 2\./);
  });
});

describe("player_contributions", () => {
  it("matches the Stats page's contributions and the Titles' Wise Old Man gains", () => {
    const s = seed();
    const out = playerContributions.run({ slug: "summer" }, ctx) as any;
    const stats = getStats(db, s.bingoId);
    expect(out.players.map((p: any) => p.rsn)).toEqual(stats.contributions.map((c) => c.user.rsn));
    for (const c of stats.contributions) {
      const p = out.players.find((x: any) => x.rsn === c.user.rsn);
      expect(p.pointsShare).toBeCloseTo(c.pointsShare, 2);
      expect(p.approvedSubmissions).toBe(c.approvedSubmissions);
      expect(p.gpGained).toBe(c.gpGained);
      const wom = stats.titleFacts.find((f) => f.userId === c.userId)!.wom;
      expect(p.womGains).toEqual(wom && { ...wom, ehb: Math.round(wom.ehb * 100) / 100, ehp: Math.round(wom.ehp * 100) / 100 });
    }
    const alice = out.players.find((p: any) => p.rsn === "Alice RSN");
    expect(alice).toMatchObject({ discordName: "Alice G", team: "Team A", approvedSubmissions: 1, gpGained: 3_000_000, womGains: { ehb: 4.57, ehp: 0, clues: 3, asOf: at(24).toISOString() } });
    const bob = out.players.find((p: any) => p.rsn === "Bob RSN");
    expect(bob).toMatchObject({ approvedSubmissions: 2, womGains: null });
  });

  it("filters by Team", () => {
    seed();
    expect((playerContributions.run({ slug: "summer", team: "team b" }, ctx) as any).players.map((p: any) => p.rsn)).toEqual(["Carol RSN"]);
  });
});

describe("every Bingo tool", () => {
  it.each([bingoSummary, tileStats, playerContributions])("returns an unknown slug as a tool error ($name)", (tool) => {
    seed();
    expect(() => tool.run({ slug: "nope" } as never, ctx)).toThrow(McpToolError);
    expect(() => tool.run({ slug: "nope" } as never, ctx)).toThrow('No Bingo has the slug "nope"');
    expect(tool.bingoIdFor!({ slug: "nope" } as never, ctx)).toBeNull();
    expect(tool.bingoIdFor!({ slug: "summer" } as never, ctx)).toBe(db.select().from(bingos).get()!.id);
  });
});

describe("fitList", () => {
  it("keeps what fits the budget and says how many it left out", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ i, pad: "x".repeat(10) }));
    const { items: kept, truncated } = fitList(items, undefined, "Narrow it.", 100);
    expect(kept.length).toBe(3);
    expect(truncated).toBe("Showing 3 of 10. Narrow it.");
    expect(fitList(items, undefined, "")).toEqual({ items, truncated: null });
  });
});
