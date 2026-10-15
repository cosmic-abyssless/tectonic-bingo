// drops and achievements on a Finished Bingo played through the real services (createSubmission, scoringService, the
// Achievement hooks), checked against what the Stats page, Wrapped and the Achievements settings read from them.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { bingos, claims, signups, stageTransitions, submissions, teamMembers, teams, users } from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { createTask, createTile } from "../../services/boardService";
import { approveSubmission, rejectSubmission } from "../../services/scoringService";
import { createSubmission } from "../../services/submissionService";
import {
  applyAchievementSwitches,
  getAchievementSettings,
  getEarnedAchievements,
  initializeAchievementSettings,
  recordReactionAdded,
} from "../../services/achievementService";
import { getContributionCounts, getTeamGpGained } from "../../services/statsService";
import { McpToolError, type McpToolContext } from "../tool";
import { achievements } from "./achievements";
import { drops } from "./drops";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let ctx: McpToolContext;

const T0 = new Date("2026-06-01T12:00:00Z");
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);

const user = (name: string, extra: Partial<typeof users.$inferInsert> = {}) =>
  db
    .insert(users)
    .values({ discordId: name, discordUsername: name, ...extra })
    .returning()
    .get().id;

function finish(bingoId: string, mod: string, endHours: number) {
  db.insert(stageTransitions)
    .values([
      { bingoId, fromStage: "reveal", toStage: "live", changedByUserId: mod, createdAt: at(-1) },
      { bingoId, fromStage: "live", toStage: "complete", changedByUserId: mod, createdAt: at(endHours) },
    ])
    .run();
  db.update(bingos).set({ stage: "complete" }).where(eq(bingos.id, bingoId)).run();
}

/**
 * "spring", a 1×2 board played live. Zulrah has a "Fang" Task (Tanzanite fang) and a "Mutagens" Task whose Parts are
 * two mutagens; Vorkath a "Head" Task. Team A is Alice and Bob (Bob on a Borrowed account), Team B is Carol.
 * Alice's fang (3m) and Carol's fang (3.1m) are approved; Alice posts Bob's Magma mutagen, rejected with a note; a
 * Moderator posts it again, approved (2m); Bob's Vorkath's head (no price) is approved and Carol's left pending.
 * Bob reacts to Alice's fang. Yammma is switched off.
 */
function seed() {
  const mod = user("mod", { isAdmin: true });
  const alice = user("alice");
  const bob = user("bob");
  const carol = user("carol");
  const bingo = db
    .insert(bingos)
    .values({ slug: "spring", name: "Spring Bingo", boardRows: 1, boardCols: 2, createdByUserId: mod, stage: "live", startsAt: T0 })
    .returning()
    .get();
  db.transaction((tx) => {
    initializeAchievementSettings(tx, bingo.id, at(-10));
    applyAchievementSwitches(tx, bingo.id, { yammma: false });
  });
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
      { bingoId: bingo.id, userId: alice, rsn: "Alice RSN", timezone: "UTC" },
      { bingoId: bingo.id, userId: bob, rsn: "Lent Acct", timezone: "UTC", accountBorrowed: true },
      { bingoId: bingo.id, userId: carol, rsn: "Carol RSN", timezone: "UTC" },
    ])
    .run();

  const zulrah = createTile(db, { bingoId: bingo.id, name: "Zulrah", boardRow: 0, boardCol: 0 });
  const vorkath = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 1 });
  const fang = createTask(db, zulrah.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  const mutagens = createTask(db, zulrah.id, {
    kind: "ANY",
    label: "Mutagens",
    points: 5,
    children: [
      { kind: "ITEM", itemName: "Magma mutagen" },
      { kind: "ITEM", itemName: "Tanzanite mutagen" },
    ],
  });
  const magma = mutagens.children!.find((c) => c.itemName === "Magma mutagen")!;
  const head = createTask(db, vorkath.id, { kind: "ITEM", itemName: "Vorkath's head", label: "Head", points: 20 });

  const submit = (
    teamId: string,
    userId: string,
    nodeId: string,
    itemName: string,
    hours: number,
    gpValue: number | null,
    postedByUserId: string | null = null,
  ) => {
    vi.setSystemTime(at(hours));
    const id = createSubmission(db, bingo, {
      teamId,
      submittedByUserId: userId,
      postedByUserId,
      screenshotUrl: "x.png",
      now: at(hours),
      claims: [{ nodeId, itemName }],
    }).id;
    // What the price refresh fills in once it has the item's price.
    if (gpValue !== null) db.update(claims).set({ gpValue }).where(eq(claims.submissionId, id)).run();
    return id;
  };
  const approve = (id: string, hours: number) => {
    vi.setSystemTime(at(hours));
    approveSubmission(db, { submissionId: id, reviewedByUserId: mod });
  };

  const aliceFang = submit(teamA, alice, fang.id, "Tanzanite fang", 2, 3_000_000);
  approve(aliceFang, 3);
  vi.setSystemTime(at(4));
  recordReactionAdded(db, { bingoId: bingo.id, submissionId: aliceFang, reactorUserId: bob, creditedUserId: alice, teamId: teamA, occurredAt: at(4) });
  approve(submit(teamB, carol, fang.id, "Tanzanite fang", 5, 3_100_000), 6);
  const rejected = submit(teamA, bob, magma.id, "Magma mutagen", 7, null, alice);
  vi.setSystemTime(at(8));
  rejectSubmission(db, { submissionId: rejected, reviewedByUserId: mod, reviewerNotes: "No codeword in the screenshot" });
  approve(submit(teamA, bob, magma.id, "Magma mutagen", 9, 2_000_000, mod), 10);
  approve(submit(teamA, bob, head.id, "Vorkath's head", 20, null), 30);
  submit(teamB, carol, head.id, "Vorkath's head", 40, null);

  finish(bingo.id, mod, 48);
  vi.setSystemTime(at(72));
  return { bingo: db.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!, mod, alice, bob, carol, teamA, teamB };
}

/** A second Finished Bingo, "autumn", with one approved drop for Alice, to compare with. */
function seedAutumn(mod: string, alice: string) {
  const bingo = db
    .insert(bingos)
    .values({ slug: "autumn", name: "Autumn Bingo", boardRows: 1, boardCols: 1, createdByUserId: mod, stage: "live", startsAt: T0 })
    .returning()
    .get();
  const team = db.insert(teams).values({ bingoId: bingo.id, captainUserId: alice, name: "Team A", codeword: "a" }).returning().get().id;
  db.insert(teamMembers).values({ teamId: team, userId: alice }).run();
  db.insert(signups).values({ bingoId: bingo.id, userId: alice, rsn: "Alice RSN" }).run();
  const tile = createTile(db, { bingoId: bingo.id, name: "Zulrah", boardRow: 0, boardCol: 0 });
  const fang = createTask(db, tile.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  const id = db
    .insert(submissions)
    .values({ teamId: team, submittedByUserId: alice, submittedAt: at(1) })
    .returning()
    .get().id;
  db.insert(claims).values({ submissionId: id, nodeId: fang.id, itemName: "Tanzanite fang", gpValue: 2_900_000 }).run();
  vi.setSystemTime(at(2));
  approveSubmission(db, { submissionId: id, reviewedByUserId: mod });
  finish(bingo.id, mod, 24);
  vi.setSystemTime(at(72));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  ({ sqlite, db } = createTestDb());
  ctx = { db, user: db.insert(users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get(), scope: "all" };
});

afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

describe("drops", () => {
  it("lists approved Claims with where they went, who's credited and who posted them", () => {
    seed();
    const out = drops.run({ slugs: ["spring"] }, ctx) as any;
    expect(out.bingos).toEqual([{ slug: "spring", name: "Spring Bingo", stage: "complete" }]);
    expect(out.claims.map((c: any) => [c.item, c.player, c.submittedAtHours])).toEqual([
      ["Tanzanite fang", "Alice RSN", 2],
      ["Tanzanite fang", "Carol RSN", 5],
      ["Magma mutagen", "Lent Acct", 9],
      ["Vorkath's head", "Lent Acct", 20],
    ]);
    expect(out.claims[0]).toEqual({
      bingo: "spring",
      item: "Tanzanite fang",
      quantity: 1,
      dropValue: 3_000_000,
      tile: "Zulrah",
      task: "Fang",
      part: null,
      team: "Team A",
      player: "Alice RSN",
      submittedAtHours: 2,
      status: "approved",
    });
    expect(out.claims[2]).toEqual({
      bingo: "spring",
      item: "Magma mutagen",
      quantity: 1,
      dropValue: 2_000_000,
      tile: "Zulrah",
      task: "Mutagens",
      part: "Magma mutagen",
      team: "Team A",
      player: "Lent Acct",
      borrowedAccount: true,
      postedBy: { name: "mod", as: "moderator" },
      submittedAtHours: 9,
      status: "approved",
    });
    expect(out.claims[3].dropValue).toBeNull();
    // Nothing about who reviewed it or the screenshot.
    expect(JSON.stringify(out)).not.toMatch(/review|screenshot|x\.png/i);
  });

  it("totals the Drop values the Stats page does, per Player and per Team", () => {
    const s = seed();
    const byPlayer = drops.run({ slugs: ["spring"], groupBy: "player" }, ctx) as any;
    for (const c of getContributionCounts(db, s.bingo.id)) {
      const row = byPlayer.groups.find((g: any) => g.player === c.user.rsn);
      expect(row?.totalDropValue ?? 0).toBe(c.gpGained);
    }
    expect(byPlayer.groups[0]).toEqual({ bingo: "spring", player: "Carol RSN", team: "Team B", claims: 1, totalQuantity: 1, totalDropValue: 3_100_000 });
    const byTeam = drops.run({ slugs: ["spring"], groupBy: "team_item" }, ctx) as any;
    for (const t of getTeamGpGained(db, s.bingo.id)) {
      const name = t.teamId === s.teamA ? "Team A" : "Team B";
      expect(byTeam.groups.filter((g: any) => g.team === name).reduce((sum: number, g: any) => sum + g.totalDropValue, 0)).toBe(t.gpGained);
    }
    const byItem = drops.run({ slugs: ["spring"], groupBy: "item" }, ctx) as any;
    expect(byItem.groups[0]).toEqual({ bingo: "spring", item: "Tanzanite fang", claims: 2, totalQuantity: 2, totalDropValue: 6_100_000 });
    const byTile = drops.run({ slugs: ["spring"], groupBy: "tile" }, ctx) as any;
    expect(byTile.groups.map((g: any) => [g.tile, g.claims])).toEqual([
      ["Zulrah", 3],
      ["Vorkath", 1],
    ]);
  });

  it("shows rejected Claims with the reviewer's notes, and pending ones on request", () => {
    seed();
    const rejected = drops.run({ slugs: ["spring"], status: "rejected" }, ctx) as any;
    expect(rejected.claims).toEqual([
      expect.objectContaining({
        item: "Magma mutagen",
        player: "Lent Acct",
        postedBy: { name: "Alice RSN", as: "teammate" },
        status: "rejected",
        reviewerNotes: "No codeword in the screenshot",
      }),
    ]);
    expect((drops.run({ slugs: ["spring"], status: "pending" }, ctx) as any).claims.map((c: any) => [c.item, c.player])).toEqual([
      ["Vorkath's head", "Carol RSN"],
    ]);
    expect((drops.run({ slugs: ["spring"], status: "any" }, ctx) as any).claims).toHaveLength(6);
  });

  it("filters by Team, Player, item and Tile", () => {
    seed();
    const run = (args: object) => (drops.run({ slugs: ["spring"], ...args }, ctx) as any).claims.map((c: any) => c.item);
    expect(run({ team: "team b" })).toEqual(["Tanzanite fang"]);
    expect(run({ player: "lent" })).toEqual(["Magma mutagen", "Vorkath's head"]);
    expect(run({ item: "FANG" })).toEqual(["Tanzanite fang", "Tanzanite fang"]);
    expect(run({ tile: "vork" })).toEqual(["Vorkath's head"]);
  });

  it("compares Bingos, and says when it left some out", () => {
    const s = seed();
    seedAutumn(s.mod, s.alice);
    const out = drops.run({ slugs: ["spring", "autumn"], item: "fang", groupBy: "item" }, ctx) as any;
    expect(out.groups).toEqual([
      { bingo: "spring", item: "Tanzanite fang", claims: 2, totalQuantity: 2, totalDropValue: 6_100_000 },
      { bingo: "autumn", item: "Tanzanite fang", claims: 1, totalQuantity: 1, totalDropValue: 2_900_000 },
    ]);
    expect(drops.bingoIdFor!({ slugs: ["spring", "autumn"] }, ctx)).toBeNull();
    expect(drops.bingoIdFor!({ slugs: ["spring"] }, ctx)).toBe(s.bingo.id);
    const limited = drops.run({ slugs: ["spring"], limit: 2 }, ctx) as any;
    expect(limited.claims).toHaveLength(2);
    expect(limited.truncated).toMatch(/^Showing 2 of 4\./);
  });

  it("refuses a Bingo that isn't Finished to MCP access, whichever slug it is", () => {
    const s = seed();
    db.insert(bingos).values({ slug: "winter", name: "Winter Bingo", boardRows: 1, boardCols: 1, createdByUserId: s.mod, stage: "live", startsAt: T0 }).run();
    const finished = { ...ctx, scope: "finished" as const };
    expect(() => drops.run({ slugs: ["winter"] }, finished)).toThrow(McpToolError);
    expect(() => drops.run({ slugs: ["spring", "winter"] }, finished)).toThrow(McpToolError);
    expect((drops.run({ slugs: ["spring"] }, finished) as any).claims).toHaveLength(4);
    expect((drops.run({ slugs: ["winter"] }, ctx) as any).claims).toEqual([]);
  });

  it("says a Historical Bingo's Submissions weren't recorded", () => {
    const s = seed();
    db.insert(bingos)
      .values({
        slug: "old",
        name: "Old Bingo",
        boardRows: 1,
        boardCols: 1,
        createdByUserId: s.mod,
        stage: "complete",
        historical: true,
        achievementsEnabled: false,
      })
      .run();
    db.insert(teams)
      .values({ bingoId: db.select().from(bingos).where(eq(bingos.slug, "old")).get()!.id, captainUserId: s.alice, name: "Old Team", codeword: "o" })
      .run();
    const out = drops.run({ slugs: ["old"] }, { ...ctx, scope: "finished" }) as any;
    expect(out.claims).toEqual([]);
    expect(out.notRecorded).toMatch(/^Not recorded for historical Bingos: .*old/);
  });
});

describe("achievements", () => {
  it("reports each switched-on Achievement and each Player as the site records them", () => {
    const s = seed();
    const out = achievements.run({ slug: "spring" }, ctx) as any;
    const settings = getAchievementSettings(db, s.bingo.id);
    const on = settings.achievements.filter((a) => a.enabled);
    expect(out.playersOnTeams).toBe(settings.players);
    expect(out.achievements.map((a: any) => a.key)).toEqual(on.map((a) => a.key));
    expect(out.achievements.some((a: any) => a.key === "yammma")).toBe(false);
    for (const a of on) expect(out.achievements.find((x: any) => x.key === a.key).earnedCount).toBe(a.earnedBy);

    const strong = out.achievements.find((a: any) => a.key === "strong_start");
    // Bob's first drop was rejected, but posting it is what earns Strong start.
    expect(strong).toEqual({
      key: "strong_start",
      name: "Strong start",
      description: "Submit your first drop",
      hidden: false,
      earnedCount: 3,
      earnedBy: ["Alice RSN", "Carol RSN", "Lent Acct"],
      firstEarnedAtHours: 2,
      lastEarnedAtHours: 7,
    });
    // A teammate posting for Bob earns it; the Moderator posting for him doesn't.
    expect(out.achievements.find((a: any) => a.key === "partner_slayer")).toMatchObject({ earnedBy: ["Alice RSN"], firstEarnedAtHours: 7 });
    expect(out.achievements.find((a: any) => a.key === "hypeman")).toMatchObject({ earnedBy: ["Lent Acct"], firstEarnedAtHours: 4 });

    const earned = getEarnedAchievements(db, s.bingo)!;
    const rsnOf = new Map([
      [s.alice, "Alice RSN"],
      [s.bob, "Lent Acct"],
      [s.carol, "Carol RSN"],
    ]);
    for (const [userId, rsn] of rsnOf) {
      const p = out.players.find((x: any) => x.rsn === rsn);
      expect(p.earned.map((e: any) => e.key)).toEqual((earned.get(userId) ?? []).map((e) => e.key));
      expect(p.earnedCount + p.notEarned.length).toBe(on.length);
    }
    const bob = out.players.find((p: any) => p.rsn === "Lent Acct");
    expect(bob).toMatchObject({ borrowedAccount: true, team: "Team A" });
    expect(bob.earned[0]).toEqual({ key: "hypeman", name: "Hypeman", earnedAtHours: 4 });
    // Ranks follow the counts, ties sharing one.
    const counts = out.players.map((p: any) => p.earnedCount);
    expect(counts).toEqual([...counts].sort((a: number, b: number) => b - a));
    for (const p of out.players) expect(p.rank).toBe(1 + counts.filter((c: number) => c > p.earnedCount).length);
    expect(JSON.stringify(out)).not.toMatch(/popup/i);
  });

  it("filters by Player and Achievement, and limits both lists", () => {
    seed();
    const byPlayer = achievements.run({ slug: "spring", player: "carol" }, ctx) as any;
    expect(byPlayer.players.map((p: any) => p.rsn)).toEqual(["Carol RSN"]);
    const all = achievements.run({ slug: "spring" }, ctx) as any;
    const carol = all.players.find((p: any) => p.rsn === "Carol RSN");
    expect(byPlayer.players[0].rank).toBe(carol.rank);

    const byKey = achievements.run({ slug: "spring", achievement: "Partner" }, ctx) as any;
    expect(byKey.achievements.map((a: any) => a.key)).toEqual(["partner_slayer"]);
    const alice = byKey.players.find((p: any) => p.rsn === "Alice RSN");
    expect(alice.earned.map((e: any) => e.key)).toEqual(["partner_slayer"]);
    expect(alice.earnedCount).toBe(all.players.find((p: any) => p.rsn === "Alice RSN").earnedCount);
    expect(byKey.players.find((p: any) => p.rsn === "Carol RSN").notEarned).toEqual(["partner_slayer"]);

    const limited = achievements.run({ slug: "spring", limit: 1 }, ctx) as any;
    expect(limited.achievements).toHaveLength(1);
    expect(limited.players).toHaveLength(1);
    expect(limited.achievementsTruncated).toMatch(/^Showing 1 of /);
    expect(limited.playersTruncated).toBe("Showing 1 of 3. Pass `player` to pick Players by RSN, or a smaller `limit`.");
  });

  it("says when Achievements were switched off or never recorded", () => {
    const s = seed();
    db.update(bingos).set({ achievementsEnabled: false }).where(eq(bingos.id, s.bingo.id)).run();
    expect(achievements.run({ slug: "spring" }, ctx)).toMatchObject({ achievements: null, switchedOff: expect.any(String) });
    db.insert(bingos)
      .values({
        slug: "old",
        name: "Old Bingo",
        boardRows: 1,
        boardCols: 1,
        createdByUserId: s.mod,
        stage: "complete",
        historical: true,
        achievementsEnabled: false,
      })
      .run();
    expect(achievements.run({ slug: "old" }, { ...ctx, scope: "finished" })).toMatchObject({
      achievements: null,
      notRecorded: expect.stringMatching(/^Not recorded for historical Bingos/),
    });
  });

  it("refuses a Bingo that isn't Finished to MCP access", () => {
    const s = seed();
    db.update(bingos).set({ stage: "live" }).where(eq(bingos.id, s.bingo.id)).run();
    expect(() => achievements.run({ slug: "spring" }, { ...ctx, scope: "finished" })).toThrow(McpToolError);
    expect((achievements.run({ slug: "spring" }, ctx) as any).achievements.length).toBeGreaterThan(0);
  });
});
