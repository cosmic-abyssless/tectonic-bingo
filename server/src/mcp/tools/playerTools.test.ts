// player_history and wom_gains on a seeded Finished Bingo, a Historical Bingo imported from the sample bundle, and a
// Live Bingo outside MCP access, checked against the services the site uses (statsService, teamService,
// historicalService, pastWomCompetitionService, womReadService, achievementService).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { ACHIEVEMENT_KEYS, type HistoricalBundle } from "@bingo/shared";
import * as schema from "../../db/schema";
import {
  achievementEarned,
  bingos,
  claims,
  draftPicks,
  signups,
  stageTransitions,
  submissions,
  teamMembers,
  teams,
  users,
  womPastCompetitions,
  womSnapshots,
} from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { createTask, createTile } from "../../services/boardService";
import { approveSubmission } from "../../services/scoringService";
import { getAchievementTallies, initializeAchievementSettings } from "../../services/achievementService";
import { writeHistoricalBingo } from "../../services/historicalImportService";
import { getStandings, getWomLeaderboard } from "../../services/historicalService";
import { getPastParticipationsForUser } from "../../services/pastWomCompetitionService";
import { getContributionCounts } from "../../services/statsService";
import { getTeamProgress } from "../../services/teamService";
import { gainsOf, loadTimelines } from "../../services/womReadService";
import { McpToolError, type McpToolContext } from "../tool";
import { playerHistory } from "./playerHistory";
import { womGains } from "./womGains";

vi.mock("../../ws", () => ({ broadcast: vi.fn() }));

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let ctx: McpToolContext;
let finished: McpToolContext;

const T0 = new Date("2026-06-01T12:00:00Z");
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);

const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, "../../testUtils/fixtures/sample-historical-bundle.json"), "utf8")) as HistoricalBundle;
/** Cinder's Discord id in the sample bundle: Alice played that Historical Bingo as Cinder, on Lava Dragons. */
const CINDER = "100000000000000002";

interface Seed {
  summer: string;
  autumn: string;
  historical: string;
  teamA: string;
  teamB: string;
  alice: string;
  bob: string;
}

/**
 * "summer", Finished: Team A (Alice, Captain; Bob, pick 3 on a Borrowed account; Eve, pick 2) against Team B (Carol,
 * Captain; Bobby, pick 1). Alice's Tanzanite fang is approved; Alice and Bob have Wise Old Man snapshots; Alice
 * earned two Achievements. "autumn", Live: Alice signs up as "Autumn Alias". Plus the sample Historical Bingo.
 */
function seed(): Seed {
  const user = (name: string, extra: Partial<typeof users.$inferInsert> = {}) =>
    db
      .insert(users)
      .values({ discordId: name, discordUsername: name, ...extra })
      .returning()
      .get().id;
  const mod = user("mod");
  const alice = user(CINDER, { discordUsername: "alice", discordGlobalName: "Alice G" });
  const bob = user("bob");
  const bobby = user("bobby");
  const carol = user("carol");
  const eve = user("eve");

  vi.setSystemTime(at(-48));
  const historical = writeHistoricalBingo(db, structuredClone(SAMPLE), new Map(), mod).bingo.id;

  const summer = db
    .insert(bingos)
    .values({ slug: "summer", name: "Summer Bingo", boardRows: 1, boardCols: 1, createdByUserId: mod, stage: "live", startsAt: T0 })
    .returning()
    .get();
  db.transaction((tx) => initializeAchievementSettings(tx, summer.id, at(-24)));
  const teamA = db.insert(teams).values({ bingoId: summer.id, captainUserId: alice, name: "Team A", codeword: "a" }).returning().get().id;
  const teamB = db.insert(teams).values({ bingoId: summer.id, captainUserId: carol, name: "Team B", codeword: "b" }).returning().get().id;
  db.insert(teamMembers)
    .values([
      { teamId: teamA, userId: alice, isCaptain: true },
      { teamId: teamA, userId: bob },
      { teamId: teamA, userId: eve },
      { teamId: teamB, userId: carol, isCaptain: true },
      { teamId: teamB, userId: bobby },
    ])
    .run();
  db.insert(signups)
    .values([
      { bingoId: summer.id, userId: alice, rsn: "Alice RSN" },
      { bingoId: summer.id, userId: bob, rsn: "Bob RSN", accountBorrowed: true },
      { bingoId: summer.id, userId: bobby, rsn: "Bobby RSN" },
      { bingoId: summer.id, userId: carol, rsn: "Carol RSN" },
      { bingoId: summer.id, userId: eve, rsn: "Eve RSN" },
    ])
    .run();
  db.insert(draftPicks)
    .values([
      { bingoId: summer.id, pickNumber: 1, teamId: teamB, userId: bobby, pickedByUserId: carol },
      { bingoId: summer.id, pickNumber: 2, teamId: teamA, userId: eve, pickedByUserId: alice },
      { bingoId: summer.id, pickNumber: 3, teamId: teamA, userId: bob, pickedByUserId: alice },
    ])
    .run();

  const zulrah = createTile(db, { bingoId: summer.id, name: "Zulrah", boardRow: 0, boardCol: 0 });
  const fang = createTask(db, zulrah.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  vi.setSystemTime(at(2));
  const sub = db
    .insert(submissions)
    .values({ teamId: teamA, submittedByUserId: alice, submittedAt: at(2) })
    .returning()
    .get().id;
  db.insert(claims).values({ submissionId: sub, nodeId: fang.id, itemName: "Tanzanite fang", gpValue: 3_000_000 }).run();
  vi.setSystemTime(at(3));
  approveSubmission(db, { submissionId: sub, reviewedByUserId: mod });

  db.insert(stageTransitions)
    .values([
      { bingoId: summer.id, fromStage: "reveal", toStage: "live", changedByUserId: mod, createdAt: at(-1) },
      { bingoId: summer.id, fromStage: "live", toStage: "complete", changedByUserId: mod, createdAt: at(48) },
    ])
    .run();
  db.update(bingos).set({ stage: "complete" }).where(eq(bingos.id, summer.id)).run();

  db.insert(achievementEarned)
    .values([
      { bingoId: summer.id, userId: alice, achievementKey: ACHIEVEMENT_KEYS[0]!, earnedAt: at(5) },
      { bingoId: summer.id, userId: alice, achievementKey: ACHIEVEMENT_KEYS[1]!, earnedAt: at(6) },
    ])
    .run();

  const snap = (userId: string, hours: number, ehb: number, ehp: number, clues: number, bossKills: Record<string, number>) => ({
    bingoId: summer.id,
    userId,
    takenAt: at(hours),
    ehb,
    ehp,
    clues,
    bossKillsJson: JSON.stringify(bossKills),
  });
  db.insert(womSnapshots)
    .values([
      snap(alice, -2, 100, 50, 10, { zulrah: 100, vorkath: 5 }),
      snap(alice, 10, 103, 52, 11, { zulrah: 120, vorkath: 5 }),
      snap(alice, 24, 110, 55, 13, { zulrah: 150, vorkath: 7 }),
      snap(alice, 60, 999, 999, 99, { zulrah: 999, vorkath: 99 }), // after the end: never counted
      snap(bob, -1, 10, 5, 0, { kril_tsutsaroth: 0 }),
      snap(bob, 24, 12, 6, 0, { kril_tsutsaroth: 3 }),
    ])
    .run();

  const autumn = db
    .insert(bingos)
    .values({ slug: "autumn", name: "Autumn Bingo", boardRows: 1, boardCols: 1, createdByUserId: mod, stage: "live", startsAt: at(24 * 30) })
    .returning()
    .get().id;
  const autumnTeam = db.insert(teams).values({ bingoId: autumn, captainUserId: alice, name: "Autumn Team", codeword: "c" }).returning().get().id;
  db.insert(teamMembers).values({ teamId: autumnTeam, userId: alice, isCaptain: true }).run();
  db.insert(signups).values({ bingoId: autumn, userId: alice, rsn: "Autumn Alias" }).run();

  vi.setSystemTime(at(24 * 31));
  return { summer: summer.id, autumn, historical, teamA, teamB, alice, bob };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  ({ sqlite, db } = createTestDb());
  ctx = { db, user: db.insert(users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get(), scope: "all" };
  finished = { ...ctx, scope: "finished" };
});

afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

describe("player_history", () => {
  it("follows one Player across the Finished Bingos, newest first, as the site's services score them", () => {
    const s = seed();
    const out = playerHistory.run({ player: "alice rsn" }, finished) as any;
    expect(out.player).toEqual({ discordName: "Alice G", rsns: ["Alice RSN", "Cinder"] });
    expect(out.bingos.map((b: any) => b.slug)).toEqual(["summer", "sample-historical-2024"]);

    const [summer, historical] = out.bingos;
    const contribution = getContributionCounts(db, s.summer).find((c) => c.userId === s.alice)!;
    const bingo = db.select().from(bingos).where(eq(bingos.id, s.summer)).get()!;
    const wom = gainsOf(loadTimelines(db, s.summer).get(s.alice)!, T0, at(48))!;
    expect(summer).toEqual({
      slug: "summer",
      name: "Summer Bingo",
      historical: false,
      startedAt: T0.toISOString(),
      rsn: "Alice RSN",
      borrowed: false,
      team: "Team A",
      lead: "captain",
      draft: "Captain",
      teamResult: { place: 1, ofTeams: 2, points: getTeamProgress(db, s.teamA).totalPoints, source: "scoreboard" },
      pointsShare: contribution.pointsShare,
      approvedSubmissions: contribution.approvedSubmissions,
      gpGained: contribution.gpGained,
      womGains: { ehb: wom.ehb, ehp: wom.ehp, clues: wom.clues },
      achievementsEarned: getAchievementTallies(db, bingo)!.get(s.alice)!.earned,
    });
    expect(summer).toMatchObject({
      pointsShare: 10,
      approvedSubmissions: 1,
      gpGained: 3_000_000,
      womGains: { ehb: 10, ehp: 5, clues: 3 },
      achievementsEarned: 2,
    });

    // The Historical Bingo: its recorded standings, its Wise Old Man competition, and Achievements off.
    const lava = getStandings(db, s.historical).find((t) => t.teamName === "Lava Dragons")!;
    expect(historical).toMatchObject({
      historical: true,
      rsn: "Cinder",
      team: "Lava Dragons",
      lead: null,
      draft: null,
      teamResult: { place: lava.place, ofTeams: 3, points: lava.points, source: "recorded" },
      pointsShare: 0,
      womGains: null,
      achievementsEarned: null,
    });
    expect(historical.teamResult).toEqual({ place: 2, ofTeams: 3, points: 120, source: "recorded" });

    const past = getPastParticipationsForUser(db, s.alice).find((p) => p.bingoId === s.historical)!;
    expect(out.womCompetitions).toEqual([
      {
        bingo: "sample-historical-2024",
        title: past.title,
        metric: past.metric,
        gained: past.gained,
        rank: past.totalRank,
        ofParticipants: past.totalParticipants,
        teamRank: past.teamRank,
        teamSize: past.teamSize,
      },
    ]);
    expect(out.womCompetitions[0]).toMatchObject({ metric: "ehb", gained: 141.5, rank: 2, ofParticipants: 10, teamRank: 2, teamSize: 3 });
  });

  it("gives the Draft pick and round, flags a Borrowed account, and lists teammates on request", () => {
    seed();
    const bob = (playerHistory.run({ player: "BOB RSN", includeTeammates: true }, finished) as any).bingos[0];
    expect(bob).toMatchObject({ rsn: "Bob RSN", borrowed: true, team: "Team A", lead: null, draft: { pick: 3, ofPicks: 3, round: 2 } });
    expect(bob.teammates).toEqual([
      { rsn: "Alice RSN", borrowed: false },
      { rsn: "Eve RSN", borrowed: false },
    ]);
    expect((playerHistory.run({ player: "bob" }, finished) as any).bingos[0]).not.toHaveProperty("teammates");
  });

  it("matches a Discord name, asks to narrow an ambiguous name, and refuses an unknown one", () => {
    seed();
    expect((playerHistory.run({ player: "alice g" }, finished) as any).player.discordName).toBe("Alice G");
    expect((playerHistory.run({ player: "cinder" }, finished) as any).player.discordName).toBe("Alice G");
    // "bob" is exactly Bob's Discord name, so it picks him over Bobby; "bo" picks neither.
    expect((playerHistory.run({ player: "bob" }, finished) as any).player.discordName).toBe("bob");
    const ambiguous = playerHistory.run({ player: "bo" }, finished) as any;
    expect(ambiguous.bingos).toBeUndefined();
    expect(ambiguous.candidates).toEqual(
      expect.arrayContaining([
        { discordName: "bob", rsns: ["Bob RSN"], bingos: 1 },
        { discordName: "bobby", rsns: ["Bobby RSN"], bingos: 1 },
      ]),
    );
    expect(() => playerHistory.run({ player: "nobody at all" }, finished)).toThrow(McpToolError);
  });

  it("leaves out Bingos MCP access can't read, names from them included", () => {
    seed();
    expect(() => playerHistory.run({ player: "autumn alias" }, finished)).toThrow(McpToolError);
    expect((playerHistory.run({ player: "alice rsn" }, finished) as any).bingos.map((b: any) => b.slug)).not.toContain("autumn");
    const admin = playerHistory.run({ player: "autumn alias" }, ctx) as any;
    expect(admin.bingos.map((b: any) => b.slug)).toEqual(["autumn", "summer", "sample-historical-2024"]);
  });

  it("keeps to `limit` Bingos and says it did", () => {
    seed();
    const out = playerHistory.run({ player: "alice rsn", limit: 1 }, finished) as any;
    expect(out.bingos.map((b: any) => b.slug)).toEqual(["summer"]);
    expect(out.truncated).toBe("Showing 1 of 2 Bingos, the newest.");
  });

  it("never returns Discord ids or account flags", () => {
    seed();
    const text = JSON.stringify(playerHistory.run({ player: "alice rsn", includeTeammates: true }, ctx));
    expect(text).not.toContain(CINDER);
    expect(text).not.toMatch(/discordId|isAdmin|inGuild|discord_id|is_admin|in_guild/);
  });
});

describe("wom_gains", () => {
  it("measures each Player's gains over the Bingo as the Titles do", () => {
    const s = seed();
    const out = womGains.run({ slug: "summer" }, finished) as any;
    expect(out.window).toEqual({ fromHours: 0, toHours: 48 });
    expect(out.players.map((p: any) => p.player)).toEqual(["Alice RSN", "Bob RSN", "Bobby RSN", "Carol RSN", "Eve RSN"]);
    const timelines = loadTimelines(db, s.summer);
    const aliceGains = gainsOf(timelines.get(s.alice)!, T0, at(48))!;
    expect(out.players[0]).toEqual({
      player: "Alice RSN",
      borrowed: false,
      team: "Team A",
      gains: { ehb: aliceGains.ehb, ehp: aliceGains.ehp, clues: aliceGains.clues, asOfHours: 24 },
      bossKills: [
        { boss: "zulrah", kills: 50 },
        { boss: "vorkath", kills: 2 },
      ],
    });
    expect(out.players[1]).toMatchObject({
      player: "Bob RSN",
      borrowed: true,
      gains: { ehb: 2, ehp: 1, clues: 0 },
      bossKills: [{ boss: "kril_tsutsaroth", kills: 3 }],
    });
    expect(out.players[2]).toMatchObject({ player: "Bobby RSN", gains: null, bossKills: [] });
    expect(out.competition).toBeNull();
  });

  it("narrows to a window in hours from the start, a Team, a Player and a boss", () => {
    seed();
    const window = womGains.run({ slug: "summer", player: "alice", fromHours: 10, toHours: 24 }, finished) as any;
    expect(window.window).toEqual({ fromHours: 10, toHours: 24 });
    expect(window.players).toEqual([
      {
        player: "Alice RSN",
        borrowed: false,
        team: "Team A",
        gains: { ehb: 7, ehp: 3, clues: 2, asOfHours: 24 },
        bossKills: [
          { boss: "zulrah", kills: 30 },
          { boss: "vorkath", kills: 2 },
        ],
      },
    ]);
    expect((womGains.run({ slug: "summer", team: "team b" }, finished) as any).players.map((p: any) => p.player)).toEqual(["Bobby RSN", "Carol RSN"]);
    const zul = womGains.run({ slug: "summer", boss: "Zul" }, finished) as any;
    expect(zul.players.map((p: any) => [p.player, p.bossKills])).toEqual([["Alice RSN", [{ boss: "zulrah", kills: 50 }]]]);
    expect((womGains.run({ slug: "summer", boss: "K'ril" }, finished) as any).players.map((p: any) => p.player)).toEqual(["Bob RSN"]);
    expect(() => womGains.run({ slug: "summer", fromHours: 24, toHours: 10 }, finished)).toThrow(McpToolError);
  });

  it("returns one Player's snapshots from the one gains are measured from", () => {
    seed();
    const out = womGains.run({ slug: "summer", player: "alice", timeline: true }, finished) as any;
    expect(out.player).toBe("Alice RSN");
    expect(out.timeline).toEqual([
      { hours: -2, ehb: 100, ehp: 50, clues: 10 },
      { hours: 10, ehb: 103, ehp: 52, clues: 11 },
      { hours: 24, ehb: 110, ehp: 55, clues: 13 },
    ]);
    const later = womGains.run({ slug: "summer", player: "alice", timeline: true, fromHours: 12, boss: "zulrah" }, finished) as any;
    expect(later.timeline).toEqual([
      { hours: 10, ehb: 103, ehp: 52, clues: 11, kills: { zulrah: 120 } },
      { hours: 24, ehb: 110, ehp: 55, clues: 13, kills: { zulrah: 150 } },
    ]);
    expect(() => womGains.run({ slug: "summer", player: "bob", timeline: true }, finished)).toThrow("matches 2: Bob RSN, Bobby RSN");
    expect(() => womGains.run({ slug: "summer", timeline: true }, finished)).toThrow(McpToolError);
  });

  it("returns the linked Wise Old Man competition, never one added by hand for no Bingo", () => {
    const s = seed();
    db.insert(womPastCompetitions)
      .values({
        guildId: "",
        womId: 99,
        bingoId: null,
        title: "Unlinked",
        metric: "ehp",
        startsAt: T0,
        endsAt: at(48),
        dataJson: JSON.stringify({ participations: [{ player: { username: "alice_rsn" }, progress: { gained: 5 } }] }),
      })
      .run();
    expect((womGains.run({ slug: "summer" }, finished) as any).competition).toBeNull();

    const out = womGains.run({ slug: "sample-historical-2024" }, finished) as any;
    const board = getWomLeaderboard(db, s.historical)!;
    expect(out.bingo.historical).toBe(true);
    expect(out.competition).toMatchObject({ title: "Spring Bingo 2024", metric: "ehb", startsAtHours: 0, endsAtHours: 14 * 24 });
    expect(out.competition.participants.map((p: any) => [p.player, p.team, p.gained])).toEqual(board.players.map((p) => [p.rsn, p.teamName, p.gained]));
    expect(out.competition.participants[1]).toEqual({ player: "Cinder", borrowed: false, team: "Lava Dragons", gained: 141.5, rank: 2 });
    expect(out.competition.teams).toEqual(board.teams.map((t) => ({ team: t.name, gained: t.gained, players: t.players })));
    // No snapshots for a sparse import: everyone's gains are unknown there.
    expect(out.players.every((p: any) => p.gains === null)).toBe(true);

    // Filters keep each participant's rank among them all.
    const rocks = womGains.run({ slug: "sample-historical-2024", team: "rock crabs" }, finished) as any;
    expect(rocks.competition.participants.map((p: any) => [p.player, p.rank])).toEqual([
      ["Shellshock", 6],
      ["Pebble", 8],
      ["Boulder", 9],
      ["Ghost Rider", 10],
    ]);
  });

  it("keeps to `limit` and says it did", () => {
    seed();
    const out = womGains.run({ slug: "summer", limit: 2 }, finished) as any;
    expect(out.players).toHaveLength(2);
    expect(out.truncated).toMatch(/^Showing 2 of 5\./);
    const history = womGains.run({ slug: "sample-historical-2024", limit: 3 }, finished) as any;
    expect(history.competition.participants).toHaveLength(3);
    expect(history.competition.truncated).toMatch(/^Showing 3 of 10\./);
  });
});

describe("player tools and MCP access", () => {
  it("refuses a Bingo that isn't Finished to MCP access, not to a site admin", () => {
    seed();
    expect(() => womGains.run({ slug: "autumn" }, finished)).toThrow('No Bingo you can read has the slug "autumn"');
    expect(() => womGains.run({ slug: "autumn" }, ctx)).not.toThrow();
    expect(womGains.bingoIdFor!({ slug: "summer" }, ctx)).toBe(db.select().from(bingos).where(eq(bingos.slug, "summer")).get()!.id);
  });
});
