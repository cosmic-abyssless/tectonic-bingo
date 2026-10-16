import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as z from "zod";
import { NOT_RECORDED_HISTORICAL, playerName, type AchievementKey } from "@bingo/shared";
import * as schema from "../../db/schema";
import { signups, teamMembers, teams, users } from "../../db/schema";
import { getAchievementSettings, getEarnedAchievements } from "../../services/achievementService";
import { defineTool } from "../tool";
import { LIST_BUDGET, bingoBySlug, bingoIdForSlug, bingoSpan, fitList, hoursFrom, slugInput } from "./common";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Every Player on a Team in this Bingo: their name (Signup RSN, else Discord name, as the site names them), whether
 * that Signup is a Borrowed account, and their Team. Only they count towards an Achievement's earners, as the site's
 * Rarity counts them.
 */
function playersOnTeams(db: Db, bingoId: string): Map<string, { name: string; borrowed: boolean; team: string }> {
  const members = db
    .select({
      userId: teamMembers.userId,
      team: teams.name,
      discordUsername: users.discordUsername,
      discordGlobalName: users.discordGlobalName,
      discordGuildNick: users.discordGuildNick,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teams.bingoId, bingoId))
    .all();
  const ids = members.map((m) => m.userId);
  const signed = new Map(
    ids.length
      ? db
          .select({ userId: signups.userId, rsn: signups.rsn, borrowed: signups.accountBorrowed })
          .from(signups)
          .where(and(eq(signups.bingoId, bingoId), inArray(signups.userId, ids)))
          .all()
          .map((s) => [s.userId, s])
      : [],
  );
  return new Map(
    members.map((m) => [
      m.userId,
      { name: playerName({ ...m, rsn: signed.get(m.userId)?.rsn }), borrowed: signed.get(m.userId)?.borrowed ?? false, team: m.team },
    ]),
  );
}

export const achievements = defineTool({
  name: "achievements",
  title: "Achievements",
  description:
    "The Achievements (just-for-fun badges, never points) of one Bingo. " +
    "achievements: each Achievement switched on in that Bingo, in the site's order: key, name, description (how it's earned), hidden (shown as ??? to Players until earned), " +
    "earnedCount (how many Players on a Team earned it, out of playersOnTeams), earnedBy (their RSNs, first to earn first), and firstEarnedAtHours and lastEarnedAtHours (hours from the Bingo's start). " +
    "players: every Player on a Team, most Achievements first: RSN (borrowedAccount true when it's a Borrowed account), team, earnedCount, rank by earnedCount (Players with the same count share a rank), " +
    "earned (each one's key, name and earnedAtHours, in the order earned) and notEarned (the switched-on ones they didn't earn). " +
    "A Historical Bingo never recorded Achievements, and a Bingo can have them switched off; either way it says so.",
  input: z.object({
    slug: slugInput,
    player: z.string().optional().describe("Only Players whose RSN contains this text (any case), in `players`."),
    achievement: z
      .string()
      .optional()
      .describe(
        "Only Achievements whose key or name contains this text (any case), in `achievements` and in each Player's earned and notEarned. Counts and ranks still cover every Achievement.",
      ),
    limit: z.number().int().positive().optional().describe("At most this many Achievements, and at most this many Players."),
  }),
  bingoIdFor: bingoIdForSlug,
  run: ({ slug, player, achievement, limit }, { db, scope }) => {
    const bingo = bingoBySlug(db, slug, scope);
    const head = { slug: bingo.slug, name: bingo.name, stage: bingo.stage };
    if (bingo.historical)
      return {
        bingo: head,
        achievements: null,
        notRecorded: `${NOT_RECORDED_HISTORICAL}: a Historical Bingo was run on another site, which had no Achievements.`,
      };
    const earnedByUser = getEarnedAchievements(db, bingo);
    if (!earnedByUser) return { bingo: head, achievements: null, switchedOff: "Achievements were switched off for this Bingo." };

    const { start } = bingoSpan(db, bingo);
    const switchedOn = getAchievementSettings(db, bingo.id).achievements.filter((a) => a.enabled);
    const players = playersOnTeams(db, bingo.id);
    const nameOf = new Map(switchedOn.map((a) => [a.key, a.name]));
    const wanted = (a: { key: string; name: string }) =>
      !achievement || a.key.includes(achievement.toLowerCase()) || a.name.toLowerCase().includes(achievement.toLowerCase());

    // getEarnedAchievements is oldest first and keeps only the switched-on ones; earners are the Players on a Team.
    const earners = new Map<AchievementKey, { name: string; at: Date }[]>();
    for (const [userId, earned] of earnedByUser) {
      const p = players.get(userId);
      if (!p) continue;
      for (const e of earned) earners.set(e.key, [...(earners.get(e.key) ?? []), { name: p.name, at: e.earnedAt }]);
    }

    const achievementRows = switchedOn.filter(wanted).map((a) => {
      const by = (earners.get(a.key) ?? []).sort((x, y) => x.at.getTime() - y.at.getTime());
      return {
        key: a.key,
        name: a.name,
        description: a.description,
        hidden: a.hidden,
        earnedCount: by.length,
        earnedBy: by.map((e) => e.name),
        firstEarnedAtHours: by.length ? hoursFrom(start, by[0]!.at) : null,
        lastEarnedAtHours: by.length ? hoursFrom(start, by.at(-1)!.at) : null,
      };
    });

    const tallies = [...players].map(([userId, p]) => ({ userId, p, earned: (earnedByUser.get(userId) ?? []).filter((e) => nameOf.has(e.key)) }));
    const counts = tallies.map((t) => t.earned.length);
    const playerRows = tallies
      .map(({ p, earned }) => {
        const got = new Set(earned.map((e) => e.key));
        return {
          rsn: p.name,
          ...(p.borrowed ? { borrowedAccount: true } : {}),
          team: p.team,
          earnedCount: earned.length,
          rank: 1 + counts.filter((c) => c > earned.length).length,
          earned: earned
            .filter((e) => wanted({ key: e.key, name: nameOf.get(e.key)! }))
            .map((e) => ({ key: e.key, name: nameOf.get(e.key)!, earnedAtHours: hoursFrom(start, e.earnedAt) })),
          notEarned: switchedOn.filter((a) => !got.has(a.key) && wanted(a)).map((a) => a.key),
        };
      })
      .filter((r) => !player || r.rsn.toLowerCase().includes(player.toLowerCase()))
      .sort((a, b) => a.rank - b.rank || a.rsn.localeCompare(b.rsn));

    // Two lists share the answer, so each gets half of it.
    const a = fitList(achievementRows, limit, "Pass `achievement` to pick Achievements, or a smaller `limit`.", LIST_BUDGET / 2);
    const p = fitList(playerRows, limit, "Pass `player` to pick Players by RSN, or a smaller `limit`.", LIST_BUDGET / 2);
    return {
      bingo: head,
      playersOnTeams: players.size,
      achievements: a.items,
      ...(a.truncated ? { achievementsTruncated: a.truncated } : {}),
      players: p.items,
      ...(p.truncated ? { playersTruncated: p.truncated } : {}),
    };
  },
});
