// Effort (CONTEXT.md "Effort"): EHB at the bosses of a Team's open Parts, split between the Parts open at the time,
// with Parts completed when the deciding Submission was made. Seeded through the real board and scoring services.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { bingos, claims, signups, stageTransitions, submissions, teamMembers, teams, users, womSnapshots } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile } from "./boardService";
import { approveSubmission } from "./scoringService";
import { addEffortBoss, removeEffortBoss } from "./effortBossService";
import { computeEffort, computePartEffort } from "./effortService";
import { filterStatsForTeam, getStats } from "./statsService";

vi.mock("../ws", () => ({ broadcast: vi.fn() }));

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const T0 = new Date("2026-06-01T12:00:00Z");
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at(0));
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

/**
 * A Live Bingo that started at T0, with a 1×2 board: "Zulrah" has two Parts (Tanzanite fang and Magic fang, both
 * Zulrah's), "Vorkath" one (Vorkath's head). Team A is Alice and Bob, Team B Carol.
 */
function seed() {
  const user = (name: string, extra: Partial<typeof users.$inferInsert> = {}) =>
    db
      .insert(users)
      .values({ discordId: name, discordUsername: name, ...extra })
      .returning()
      .get().id;
  const mod = user("mod", { isAdmin: true });
  const alice = user("alice");
  const bob = user("bob");
  const carol = user("carol");
  const bingo = db
    .insert(bingos)
    .values({ slug: "summer", name: "Summer", boardRows: 1, boardCols: 2, createdByUserId: mod, stage: "live", startsAt: T0 })
    .returning()
    .get();
  const teamA = db.insert(teams).values({ bingoId: bingo.id, captainUserId: alice, name: "Team A", codeword: "a" }).returning().get().id;
  const teamB = db.insert(teams).values({ bingoId: bingo.id, captainUserId: carol, name: "Team B", codeword: "b" }).returning().get().id;
  db.insert(teamMembers)
    .values([
      { teamId: teamA, userId: alice },
      { teamId: teamA, userId: bob },
      { teamId: teamB, userId: carol },
    ])
    .run();
  db.insert(signups)
    .values([
      { bingoId: bingo.id, userId: alice, rsn: "Alice" },
      { bingoId: bingo.id, userId: bob, rsn: "Bob" },
      { bingoId: bingo.id, userId: carol, rsn: "Carol" },
    ])
    .run();

  const zulrah = createTile(db, { bingoId: bingo.id, name: "Zulrah", boardRow: 0, boardCol: 0 });
  const vorkath = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 1 });
  const fang = createTask(db, zulrah.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  const magic = createTask(db, zulrah.id, { kind: "ITEM", itemName: "Magic fang", label: "Magic fang", points: 5 });
  const head = createTask(db, vorkath.id, { kind: "ITEM", itemName: "Vorkath's head", label: "Head", points: 20 });

  /** A drop made at `made` hours and approved at `approved` hours. */
  const complete = (teamId: string, userId: string, nodeId: string, itemName: string, made: number, approved = made + 1) => {
    vi.setSystemTime(at(made));
    const id = db
      .insert(submissions)
      .values({ teamId, submittedByUserId: userId, submittedAt: at(made) })
      .returning()
      .get().id;
    db.insert(claims).values({ submissionId: id, nodeId, itemName }).run();
    vi.setSystemTime(at(approved));
    approveSubmission(db, { submissionId: id, reviewedByUserId: mod });
  };
  /** A snapshot at `hours` with these per-boss EHB totals; null stores it as read before per-boss EHB was kept. */
  const snap = (userId: string, hours: number, bossEhb: Record<string, number> | null) =>
    db
      .insert(womSnapshots)
      .values({
        bingoId: bingo.id,
        userId,
        takenAt: at(hours),
        ehb: 0,
        ehp: 0,
        clues: 0,
        bossKillsJson: "{}",
        bossEhbJson: bossEhb ? JSON.stringify(bossEhb) : null,
      })
      .run();
  /** Finishes the Bingo at `hours` and moves the clock past it. */
  const finish = (hours = 48) => {
    db.insert(stageTransitions)
      .values({ bingoId: bingo.id, fromStage: "live", toStage: "complete", changedByUserId: mod, createdAt: at(hours) })
      .run();
    db.update(bingos).set({ stage: "complete" }).where(eq(bingos.id, bingo.id)).run();
    vi.setSystemTime(at(hours + 24));
  };
  const effort = () => computeEffort(db, db.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!);
  const parts = () => computePartEffort(db, db.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!);
  return { bingo, mod, alice, bob, carol, teamA, teamB, zulrah, vorkath, fang, magic, head, complete, snap, finish, effort, parts };
}

const hoursOn = (s: ReturnType<typeof seed>, userId: string, partId: string) =>
  s
    .parts()!
    .rows.filter((r) => r.userId === userId && r.partId === partId)
    .reduce((sum, r) => sum + r.hours, 0);

describe("computeEffort", () => {
  it("counts all the time at an open Part and none after its Team completed it", () => {
    const s = seed();
    s.snap(s.alice, -2, { vorkath: 100 });
    s.snap(s.alice, 10, { vorkath: 104 });
    s.snap(s.alice, 30, { vorkath: 109 });
    s.snap(s.alice, 40, { vorkath: 112 });
    s.complete(s.teamA, s.alice, s.head.id, "Vorkath's head", 30);
    s.finish();

    const alice = s.effort()!.players.get(s.alice)!;
    expect(alice.hours).toBeCloseTo(9);
    expect(alice.uncompletedHours).toBe(0);
    expect(alice.byTile).toEqual([{ tileId: s.vorkath.id, hours: expect.closeTo(9) }]);
    expect(alice.asOf).toBe(at(40).toISOString());
  });

  it("splits a gap a completion falls in by how much of it the Part was open", () => {
    const s = seed();
    s.snap(s.alice, 0, { vorkath: 0 });
    s.snap(s.alice, 20, { vorkath: 10 });
    s.complete(s.teamA, s.alice, s.head.id, "Vorkath's head", 5);
    s.finish();
    expect(s.effort()!.players.get(s.alice)!.hours).toBeCloseTo(2.5);
  });

  it("splits a boss on two open Parts evenly, and gives it all to the other once one closes", () => {
    const s = seed();
    s.snap(s.alice, 0, { zulrah: 0 });
    s.snap(s.alice, 10, { zulrah: 4 });
    s.snap(s.alice, 20, { zulrah: 10 });
    s.complete(s.teamA, s.alice, s.fang.id, "Tanzanite fang", 10);
    s.finish();

    expect(hoursOn(s, s.alice, s.fang.id)).toBeCloseTo(2);
    expect(hoursOn(s, s.alice, s.magic.id)).toBeCloseTo(2 + 6);
    const alice = s.effort()!.players.get(s.alice)!;
    expect(alice.hours).toBeCloseTo(10);
    // The Magic fang was never completed.
    expect(alice.uncompletedHours).toBeCloseTo(8);
    expect(s.effort()!.tileEffort).toEqual([{ tileId: s.zulrah.id, teamId: s.teamA, userId: s.alice, hours: expect.closeTo(10) }]);
  });

  it("counts nothing at a boss no Part has, stops at a removed derived boss and starts at an added one", () => {
    const s = seed();
    s.snap(s.alice, 0, { vorkath: 0, kraken: 0 });
    s.snap(s.alice, 10, { vorkath: 3, kraken: 5 });
    s.finish();
    expect(s.effort()!.players.get(s.alice)!.hours).toBeCloseTo(3);

    removeEffortBoss(db, s.bingo.id, { partId: s.head.id }, "vorkath");
    expect(s.effort()!.players.get(s.alice)!.hours).toBe(0);

    addEffortBoss(db, s.bingo.id, { tileId: s.vorkath.id }, "kraken");
    const alice = s.effort()!.players.get(s.alice)!;
    expect(alice.hours).toBeCloseTo(5);
    expect(alice.byTile).toEqual([{ tileId: s.vorkath.id, hours: expect.closeTo(5) }]);
  });

  it("gives shares that sum to 100 per Team, and leaves out a Player with one snapshot", () => {
    const s = seed();
    s.snap(s.alice, 0, { vorkath: 0 });
    s.snap(s.alice, 10, { vorkath: 3 });
    s.snap(s.bob, 0, { zulrah: 0 });
    s.snap(s.bob, 10, { zulrah: 1 });
    s.snap(s.carol, 5, { zulrah: 7 });
    s.finish();

    const { players } = s.effort()!;
    expect(players.get(s.alice)!.share).toBeCloseTo(75);
    expect(players.get(s.bob)!.share).toBeCloseTo(25);
    expect(players.get(s.alice)!.share! + players.get(s.bob)!.share!).toBeCloseTo(100);
    expect(players.has(s.carol)).toBe(false);
  });

  it("has no share when the Team's total is 0", () => {
    const s = seed();
    s.snap(s.carol, 0, { kraken: 0 });
    s.snap(s.carol, 10, { kraken: 4 });
    s.finish();
    expect(s.effort()!.players.get(s.carol)).toMatchObject({ hours: 0, share: null, byTile: [] });
  });

  it("completes a Part when the Submission was made, not when it was approved", () => {
    const s = seed();
    s.snap(s.alice, 0, { vorkath: 0 });
    s.snap(s.alice, 20, { vorkath: 10 });
    // Made at 5 hours, approved at 25: the Part was open for the first quarter of the gap.
    s.complete(s.teamA, s.alice, s.head.id, "Vorkath's head", 5, 25);
    s.finish();
    expect(s.effort()!.players.get(s.alice)!.hours).toBeCloseTo(2.5);
  });

  it("counts a Team's completion only for that Team", () => {
    const s = seed();
    s.snap(s.carol, 0, { vorkath: 0 });
    s.snap(s.carol, 10, { vorkath: 4 });
    s.complete(s.teamA, s.alice, s.head.id, "Vorkath's head", 1);
    s.finish();
    expect(s.effort()!.players.get(s.carol)!.hours).toBeCloseTo(4);
  });

  it("starts at the Bingo's start from a baseline before it, and ignores snapshots after the end", () => {
    const s = seed();
    s.snap(s.alice, -20, { vorkath: 0 });
    s.snap(s.alice, -4, { vorkath: 50 });
    s.snap(s.alice, 4, { vorkath: 58 });
    s.snap(s.alice, 60, { vorkath: 90 });
    s.complete(s.teamA, s.alice, s.head.id, "Vorkath's head", 2);
    s.finish();
    // The gap from -4 to 4 is counted from the start (0 to 4); the head completed at 2, half of it.
    const alice = s.effort()!.players.get(s.alice)!;
    expect(alice.hours).toBeCloseTo(4);
    expect(alice.asOf).toBe(at(4).toISOString());
  });

  it("ignores snapshots stored without per-boss EHB, and is not recorded when none have it", () => {
    const s = seed();
    s.snap(s.alice, 0, null);
    s.snap(s.alice, 10, null);
    s.finish();
    expect(s.effort()).toBeNull();

    s.snap(s.bob, 0, { vorkath: 0 });
    s.snap(s.bob, 5, null);
    s.snap(s.bob, 10, { vorkath: 2 });
    const { players } = s.effort()!;
    expect(players.has(s.alice)).toBe(false);
    expect(players.get(s.bob)!.hours).toBeCloseTo(2);
  });

  it("is not recorded before the Bingo starts or for a Historical Bingo without Submissions", () => {
    const s = seed();
    s.snap(s.alice, 0, { vorkath: 0 });
    s.snap(s.alice, 10, { vorkath: 2 });
    db.update(bingos).set({ stage: "signup" }).where(eq(bingos.id, s.bingo.id)).run();
    expect(s.effort()).toBeNull();

    db.update(bingos).set({ stage: "complete", historical: true }).where(eq(bingos.id, s.bingo.id)).run();
    vi.setSystemTime(at(72));
    expect(s.effort()).toBeNull();
  });

  it("works on a Live Bingo, with Parts open up to now", () => {
    const s = seed();
    s.snap(s.alice, 0, { zulrah: 0 });
    s.snap(s.alice, 6, { zulrah: 6 });
    vi.setSystemTime(at(8));
    expect(hoursOn(s, s.alice, s.fang.id)).toBeCloseTo(3);
    expect(hoursOn(s, s.alice, s.magic.id)).toBeCloseTo(3);
  });
});

describe("Effort in Stats", () => {
  it("puts each Player's Effort on their contribution and each Tile's by Player, and a Team sees only its own", () => {
    const s = seed();
    s.snap(s.alice, 0, { vorkath: 0 });
    s.snap(s.alice, 10, { vorkath: 3 });
    s.snap(s.carol, 0, { zulrah: 0 });
    s.snap(s.carol, 10, { zulrah: 2 });
    s.finish();

    const stats = getStats(db, s.bingo.id);
    const effortOf = (userId: string) => stats.contributions.find((c) => c.userId === userId)!.effort;
    expect(effortOf(s.alice)).toMatchObject({ hours: expect.closeTo(3), share: expect.closeTo(100) });
    expect(effortOf(s.bob)).toBeNull();
    expect(effortOf(s.carol)).toMatchObject({ hours: expect.closeTo(2) });
    expect(stats.tileEffort).toEqual(
      expect.arrayContaining([
        { tileId: s.vorkath.id, teamId: s.teamA, userId: s.alice, hours: expect.closeTo(3) },
        { tileId: s.zulrah.id, teamId: s.teamB, userId: s.carol, hours: expect.closeTo(2) },
      ]),
    );

    const own = filterStatsForTeam(stats, s.teamA);
    expect(own.tileEffort.map((t) => t.userId)).toEqual([s.alice]);
  });

  it("gives each Player's Title facts their hours on Parts the Team never completed", () => {
    const s = seed();
    s.snap(s.alice, 0, { zulrah: 0 });
    s.snap(s.alice, 10, { zulrah: 4 });
    s.snap(s.alice, 20, { zulrah: 10 });
    s.complete(s.teamA, s.alice, s.fang.id, "Tanzanite fang", 10);
    s.finish();

    const facts = getStats(db, s.bingo.id).titleFacts;
    expect(facts.find((f) => f.userId === s.alice)!.effort).toEqual({ uncompletedHours: expect.closeTo(8), asOf: at(20).toISOString() });
    expect(facts.find((f) => f.userId === s.bob)!.effort).toBeNull();
  });

  it("leaves Effort null on every contribution when it isn't recorded", () => {
    const s = seed();
    s.finish();
    const stats = getStats(db, s.bingo.id);
    expect(stats.contributions.every((c) => c.effort === null)).toBe(true);
    expect(stats.tileEffort).toEqual([]);
  });
});
