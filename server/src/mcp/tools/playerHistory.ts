import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as z from "zod";
import { discordName } from "@bingo/shared";
import type * as schema from "../../db/schema";
import { bingos, signups, teamMembers, teams, users, womSnapshots } from "../../db/schema";
import { getAchievementTallies } from "../../services/achievementService";
import { getPastParticipationsForUser } from "../../services/pastWomCompetitionService";
import { getContributionCounts } from "../../services/statsService";
import { gainsOf } from "../../services/womReadService";
import type { WomSnapshot } from "../../services/womService";
import { scopeCovers } from "../access";
import { defineTool, McpToolError } from "../tool";
import { teamRosters, teamStandings } from "./bingoSummary";
import { bingoSpan, fitList, round2, teamNames } from "./common";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * One Player's Wise Old Man snapshots in one Bingo, oldest first, read as womReadService.loadTimelines reads them.
 * Only theirs: loadTimelines parses every Player's snapshots, which across every Bingo would be most of the table.
 */
function timelineOf(db: Db, bingoId: string, userId: string): WomSnapshot[] {
  return db
    .select()
    .from(womSnapshots)
    .where(and(eq(womSnapshots.bingoId, bingoId), eq(womSnapshots.userId, userId)))
    .orderBy(womSnapshots.takenAt)
    .all()
    .map((r) => ({
      at: r.takenAt,
      bossKills: JSON.parse(r.bossKillsJson) as WomSnapshot["bossKills"],
      bossEhb: r.bossEhbJson === null ? {} : (JSON.parse(r.bossEhbJson) as WomSnapshot["bossEhb"]),
      ehb: r.ehb,
      ehp: r.ehp,
      clues: r.clues,
    }));
}

export const playerHistory = defineTool({
  name: "player_history",
  title: "Player history",
  description:
    "One Player across every Bingo you can read, newest first. `player` matches an RSN they signed up with or their Discord name (username, display name or server nickname), any case; " +
    "an exact match wins, else any name containing it. When it matches more than one Player the answer is `candidates` (each one's Discord name and RSNs) instead: call again with a name that picks one. " +
    "Per Bingo: slug, name, historical (imported from another site, which recorded less), rsn (the RSN they played as) and borrowed (a Borrowed account), team (null when they signed up but weren't drafted), " +
    'lead ("captain", "co-captain" or null), draft (their Draft pick as {pick, ofPicks, round}: its number out of the Draft\'s total picks and its round; "Captain"/"Co-captain" for a lead who wasn\'t picked; null when not drafted), ' +
    'teamResult (their Team\'s place out of ofTeams and its points; source "scoreboard" when scored here, Point adjustments included, or "recorded" for a Historical Bingo\'s standings as the old site recorded them, points null where it didn\'t say), ' +
    "pointsShare (their part of the points their Team was awarded, Point adjustments left out), approvedSubmissions, gpGained (their Total drop value), " +
    "womGains (Wise Old Man EHB, EHP and clues completed from the Bingo's start to its end, measured as the Titles measure them; null with no snapshot), " +
    "achievementsEarned (how many Achievements they earned; null when the Bingo had Achievements off), and teammates' RSNs when includeTeammates is set. " +
    "womCompetitions: their results in the Wise Old Man competitions stored for those Bingos (metric, gained, rank out of participants, and rank within their Team), a Historical Bingo's gains especially.",
  input: z.object({
    player: z.string().min(1).describe("An RSN they signed up with, or their Discord username, display name or server nickname (any case)."),
    includeTeammates: z.boolean().optional().describe("Also list each Bingo's teammates by RSN (default false)."),
    limit: z.number().int().positive().optional().describe("At most this many Bingos (and Wise Old Man competitions), newest first."),
  }),
  run: ({ player, includeTeammates, limit }, { db, scope }) => {
    const inScope = db
      .select()
      .from(bingos)
      .all()
      .filter((b) => scopeCovers(scope, b.stage));
    const inScopeIds = inScope.map((b) => b.id);

    // Who took part in a Bingo the caller can read: a Signup or a place on a Team. Nobody else is a candidate, so
    // names from Bingos out of scope are never matched or confirmed.
    const signupRows = inScopeIds.length
      ? db
          .select({ bingoId: signups.bingoId, userId: signups.userId, rsn: signups.rsn, borrowed: signups.accountBorrowed })
          .from(signups)
          .where(inArray(signups.bingoId, inScopeIds))
          .all()
      : [];
    const memberRows = inScopeIds.length
      ? db
          .select({ bingoId: teams.bingoId, userId: teamMembers.userId })
          .from(teamMembers)
          .innerJoin(teams, eq(teamMembers.teamId, teams.id))
          .where(inArray(teams.bingoId, inScopeIds))
          .all()
      : [];
    const bingosOf = new Map<string, Set<string>>();
    for (const r of [...signupRows, ...memberRows]) bingosOf.set(r.userId, (bingosOf.get(r.userId) ?? new Set()).add(r.bingoId));
    const people = bingosOf.size
      ? db
          .select({
            id: users.id,
            discordUsername: users.discordUsername,
            discordGlobalName: users.discordGlobalName,
            discordGuildNick: users.discordGuildNick,
          })
          .from(users)
          .where(inArray(users.id, [...bingosOf.keys()]))
          .all()
      : [];
    const rsnsOf = new Map<string, Set<string>>();
    for (const s of signupRows) rsnsOf.set(s.userId, (rsnsOf.get(s.userId) ?? new Set()).add(s.rsn));
    const namesOf = (u: (typeof people)[number]) =>
      [...(rsnsOf.get(u.id) ?? []), u.discordUsername, u.discordGlobalName, u.discordGuildNick]
        .filter((n): n is string => !!n)
        .map((n) => n.trim().toLowerCase());

    const wanted = player.trim().toLowerCase();
    let matches = people.filter((u) => namesOf(u).includes(wanted));
    if (matches.length === 0) matches = people.filter((u) => namesOf(u).some((n) => n.includes(wanted)));
    if (matches.length === 0) throw new McpToolError(`No Player in a Bingo you can read goes by "${player}".`);
    if (matches.length > 1) {
      const candidates = matches.map((u) => ({ discordName: discordName(u), rsns: [...(rsnsOf.get(u.id) ?? [])], bingos: bingosOf.get(u.id)!.size }));
      const { items, truncated } = fitList(candidates, limit, "Pass a fuller name.");
      return {
        candidates: items,
        note: `"${player}" matches ${matches.length} Players. Call again with one of their RSNs or Discord names.`,
        ...(truncated ? { truncated } : {}),
      };
    }

    const user = matches[0]!;
    const theirBingos = bingosOf.get(user.id)!;
    const dated = inScope
      .filter((b) => theirBingos.has(b.id))
      .map((b) => ({ bingo: b, ...bingoSpan(db, b) }))
      .sort((a, b) => (b.start ?? b.bingo.startsAt ?? b.bingo.createdAt).getTime() - (a.start ?? a.bingo.startsAt ?? a.bingo.createdAt).getTime());

    // Only the Bingos the answer will show are measured: each one scores every Team.
    const history = dated.slice(0, limit ?? dated.length).map(({ bingo, start, end }) => {
      const signup = signupRows.find((s) => s.bingoId === bingo.id && s.userId === user.id);
      const roster = teamRosters(db, bingo.id);
      const member = roster.find((m) => m.userId === user.id);
      const contribution = getContributionCounts(db, bingo.id).find((c) => c.userId === user.id);
      // Someone who left their Team still has their Submissions counted for it, as the Stats page counts them.
      const teamId = member?.teamId ?? contribution?.teamId ?? null;
      const standings = teamStandings(db, bingo);
      const standing = teamId ? standings.teams.find((t) => t.teamId === teamId) : undefined;
      const timeline = start ? timelineOf(db, bingo.id, user.id) : [];
      const wom = start && timeline.length ? gainsOf(timeline, start, end) : null;
      const tallies = getAchievementTallies(db, bingo);
      return {
        slug: bingo.slug,
        name: bingo.name,
        historical: bingo.historical,
        startedAt: start?.toISOString() ?? null,
        rsn: signup?.rsn ?? null,
        borrowed: signup?.borrowed ?? false,
        team: teamId ? (teamNames(db, bingo.id).get(teamId) ?? null) : null,
        lead: member?.lead ?? null,
        draft: member?.draft ?? null,
        teamResult: standing ? { place: standing.rank, ofTeams: standings.teams.length, points: standing.points, source: standings.source } : null,
        pointsShare: round2(contribution?.pointsShare ?? 0),
        approvedSubmissions: contribution?.approvedSubmissions ?? 0,
        gpGained: contribution?.gpGained ?? 0,
        womGains: wom && { ehb: round2(wom.ehb), ehp: round2(wom.ehp), clues: wom.clues },
        achievementsEarned: tallies ? (tallies.get(user.id)?.earned ?? 0) : null,
        ...(includeTeammates
          ? { teammates: roster.filter((m) => m.teamId === teamId && m.userId !== user.id).map((m) => ({ rsn: m.player, borrowed: m.borrowed })) }
          : {}),
      };
    });

    const slugOf = new Map(inScope.map((b) => [b.id, b.slug]));
    const competitions = getPastParticipationsForUser(db, user.id)
      .filter((p) => p.bingoId && slugOf.has(p.bingoId) && theirBingos.has(p.bingoId))
      .map((p) => ({
        bingo: slugOf.get(p.bingoId!)!,
        title: p.title,
        metric: p.metric,
        gained: round2(p.gained),
        rank: p.totalRank,
        ofParticipants: p.totalParticipants,
        teamRank: p.teamRank,
        teamSize: p.teamSize,
      }));

    const bingoList = fitList(history, undefined, "");
    const bingosTruncated = bingoList.items.length < dated.length ? `Showing ${bingoList.items.length} of ${dated.length} Bingos, the newest.` : null;
    const competitionList = fitList(competitions, limit, "Pass a smaller `limit`.", 20_000);
    return {
      // Newest Bingo first, as the Bingos are listed.
      player: {
        discordName: discordName(user),
        rsns: [...new Set(dated.flatMap(({ bingo }) => signupRows.filter((s) => s.bingoId === bingo.id && s.userId === user.id).map((s) => s.rsn)))],
      },
      bingos: bingoList.items,
      ...(bingosTruncated ? { truncated: bingosTruncated } : {}),
      womCompetitions: competitionList.items,
      ...(competitionList.truncated ? { womCompetitionsTruncated: competitionList.truncated } : {}),
    };
  },
});
