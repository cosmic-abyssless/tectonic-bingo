import { and, asc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as z from "zod";
import { playerName } from "@bingo/shared";
import type * as schema from "../../db/schema";
import { bingoLines, draftPicks, signups, stageTransitions, users, type bingos } from "../../db/schema";
import { now } from "../../clock";
import { getStandings } from "../../services/historicalService";
import { rsnsInBingo } from "../../services/playerNames";
import { getPointsOverTime, getTeamCredits, getTeamGpGained, labelNodes } from "../../services/statsService";
import { getTeamProgress, getTeamsWithMembers } from "../../services/teamService";
import { defineTool } from "../tool";
import { bingoBySlug, bingoIdForSlug, bingoSpan, hoursFrom, round2, slugInput, teamNames } from "./common";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof bingos.$inferSelect;

export interface TeamStanding {
  teamId: string;
  team: string;
  /** Null for a Team a Historical Bingo's recorded standings leave out. */
  rank: number | null;
  /** Null when a Historical Bingo's records don't say. */
  points: number | null;
}

/**
 * Each Team's final (or current) place and points, best first, as the site shows them. A Bingo played here ranks by
 * the scoreboard (Point adjustments included). A Historical Bingo shows the standings the old site recorded: its
 * Tasks and Submissions are usually not recorded, so scoring it here would give every Team about 0. One that recorded
 * no standings falls back to the scoreboard.
 */
export function teamStandings(db: Db, bingo: Bingo, progressOf = (teamId: string) => getTeamProgress(db, teamId)): { source: "recorded" | "scoreboard"; teams: TeamStanding[] } {
  const names = teamNames(db, bingo.id);
  if (bingo.historical) {
    const recorded = getStandings(db, bingo.id);
    if (recorded.length > 0) {
      const listed = new Set(recorded.map((s) => s.teamId));
      const unlisted = [...names].filter(([id]) => !listed.has(id)).map(([teamId, team]) => ({ teamId, team, rank: null, points: null }));
      return { source: "recorded", teams: [...recorded.map((s) => ({ teamId: s.teamId, team: s.teamName, rank: s.place, points: s.points })), ...unlisted] };
    }
  }
  const ranked = [...names].map(([teamId, team]) => ({ teamId, team, points: progressOf(teamId).totalPoints })).sort((a, b) => b.points - a.points);
  return { source: "scoreboard", teams: ranked.map((t) => ({ ...t, rank: ranked.filter((o) => o.points > t.points).length + 1 })) };
}

/** Where a Team member came from: their Draft pick, or leading the Team. */
export type DraftPlace = { pick: number; ofPicks: number; round: number } | "Captain" | "Co-captain";

export interface RosterMember {
  userId: string;
  teamId: string;
  team: string;
  /** Their RSN in the Bingo, or their Discord name when they have no Signup. */
  player: string;
  borrowed: boolean;
  lead: "captain" | "co-captain" | null;
  /** Null for a member who joined without being drafted (added by a Moderator, or a Bingo that recorded no Draft). */
  draft: DraftPlace | null;
}

/**
 * Every Team's members, leads first, as the Teams list shows them: named by RSN, a Borrowed account flagged, and
 * where each was drafted. A pick's round counts every Team picking once a round, as the draft room does; a Duo's
 * halves share their pick.
 */
export function teamRosters(db: Db, bingoId: string): RosterMember[] {
  const teamRows = getTeamsWithMembers(db, bingoId);
  const borrowed = new Set(
    db
      .select({ userId: signups.userId })
      .from(signups)
      .where(and(eq(signups.bingoId, bingoId), eq(signups.accountBorrowed, true)))
      .all()
      .map((s) => s.userId),
  );
  const picks = db.select({ userId: draftPicks.userId, pickNumber: draftPicks.pickNumber }).from(draftPicks).where(eq(draftPicks.bingoId, bingoId)).all();
  const pickOf = new Map(picks.map((p) => [p.userId, p.pickNumber]));
  const ofPicks = picks.reduce((max, p) => Math.max(max, p.pickNumber), 0);
  return teamRows.flatMap((team) =>
    team.members.map((m) => {
      const pick = pickOf.get(m.user.id);
      const lead = m.isCaptain ? ("captain" as const) : m.isCoCaptain ? ("co-captain" as const) : null;
      const leadPlace = lead === "captain" ? "Captain" : lead === "co-captain" ? "Co-captain" : null;
      const draft: DraftPlace | null = pick !== undefined ? { pick, ofPicks, round: Math.ceil(pick / teamRows.length) } : leadPlace;
      return { userId: m.user.id, teamId: team.id, team: team.name, player: playerName(m.user), borrowed: borrowed.has(m.user.id), lead, draft };
    }),
  );
}

/** The most buckets the points-over-time series has: a longer Bingo gets wider buckets. */
const MAX_BUCKETS = 400;

export const bingoSummary = defineTool({
  name: "bingo_summary",
  title: "Bingo summary",
  description:
    "One Bingo at a glance. standings: each Team's points (final once the Bingo is Finished, else current), ranked, with its Total drop value (gpGained). " +
    'standingsSource says where they come from: "scoreboard" (scored here, Point adjustments included) or "recorded" (a Historical Bingo: the final places and points the old site recorded, ' +
    "as its page shows them; points null where it didn't say, and gpGained counts only Submissions it recorded, usually none). " +
    "teams: each Team's members, Captain and co-captain first: player (their RSN in this Bingo), borrowed (playing on a Borrowed account), lead (\"captain\", \"co-captain\" or null), " +
    'and draft: their Draft pick as {pick, ofPicks, round} (the pick\'s number out of the Draft\'s total picks, a Duo sharing one, and its round), "Captain"/"Co-captain" for a lead who wasn\'t picked, or null for a member added without a pick. ' +
    "pointsOverTime: each Team's cumulative points at the end of each bucket of bucketHours from the start (the last bucket ends at the Bingo's end, or now while it's Live); null for a Historical Bingo that recorded no scoring. " +
    "lines: every Line completed, by which Team, when (hours from the start) and each Player's Points share of its bonus. " +
    "stages: every Stage change with its time, and when the Bingo started and ended. Points include Point adjustments, as the scoreboard does.",
  input: z.object({
    slug: slugInput,
    bucketHours: z.number().positive().optional().describe("Width of each points-over-time bucket in hours (default 1; widened when the Bingo is too long for 400 buckets)."),
  }),
  bingoIdFor: bingoIdForSlug,
  run: ({ slug, bucketHours }, { db, scope }) => {
    const bingo = bingoBySlug(db, slug, scope);
    const { start, end } = bingoSpan(db, bingo);
    const names = teamNames(db, bingo.id);
    const progress = new Map([...names.keys()].map((id) => [id, getTeamProgress(db, id)]));
    const gp = new Map(getTeamGpGained(db, bingo.id).map((t) => [t.teamId, t.gpGained]));

    const ranked = teamStandings(db, bingo, (id) => progress.get(id)!);
    const standings = ranked.teams.map((t) => ({ rank: t.rank, team: t.team, points: t.points, gpGained: gp.get(t.teamId) ?? 0 }));
    const rosters = teamRosters(db, bingo.id);
    const teamsOut = ranked.teams.map((t) => ({
      team: t.team,
      members: rosters.filter((m) => m.teamId === t.teamId).map(({ player, borrowed, lead, draft }) => ({ player, borrowed, lead, draft })),
    }));

    // Cumulative points per Team at each bucket's end. Anything scored before the start lands in the first bucket, and
    // anything after the end (a late Point adjustment) in the last, so the last bucket always matches the standings.
    // A Historical Bingo that recorded no scoring has no series: it would only be zeros beside its recorded standings.
    const events = getPointsOverTime(db, bingo.id);
    let pointsOverTime: { bucketHours: number; teams: string[]; buckets: { endsAtHours: number; points: number[] }[] } | null = null;
    if (start && !(bingo.historical && events.length === 0)) {
      const lastAt = Math.max(end?.getTime() ?? now().getTime(), ...events.map((e) => e.at.getTime()));
      const spanHours = Math.max(0, (lastAt - start.getTime()) / 3_600_000);
      const width = Math.max(bucketHours ?? 1, Math.ceil(spanHours / MAX_BUCKETS));
      const count = Math.max(1, Math.ceil(spanHours / width));
      const teamIds = ranked.teams.map((t) => t.teamId);
      const running = new Map(teamIds.map((id) => [id, 0]));
      const buckets: { endsAtHours: number; points: number[] }[] = [];
      let i = 0;
      for (let b = 1; b <= count; b++) {
        const bucketEnd = b === count ? Infinity : start.getTime() + b * width * 3_600_000;
        for (; i < events.length && events[i]!.at.getTime() <= bucketEnd; i++) running.set(events[i]!.teamId, events[i]!.cumulativePoints);
        buckets.push({ endsAtHours: round2(Math.min(b * width, spanHours)), points: teamIds.map((id) => running.get(id) ?? 0) });
      }
      pointsOverTime = { bucketHours: width, teams: ranked.teams.map((t) => t.team), buckets };
    }

    // Lines: each Team's Line awards, with who earned their Points share.
    const lineNodeIds = new Set(db.select({ nodeId: bingoLines.nodeId }).from(bingoLines).where(eq(bingoLines.bingoId, bingo.id)).all().map((l) => l.nodeId));
    const labels = labelNodes(db, bingo.id, [...lineNodeIds]);
    const lineCredits = getTeamCredits(db, bingo.id).flatMap((t) => t.credits.filter((c) => c.kind === "line").map((c) => ({ teamId: t.teamId, credit: c })));
    const userIds = [...new Set(lineCredits.flatMap((l) => l.credit.shares.map((s) => s.userId)))];
    const rsns = rsnsInBingo(db, bingo.id, userIds);
    const userRows = userIds.length ? db.select().from(users).where(inArray(users.id, userIds)).all() : [];
    const nameOf = new Map(userRows.map((u) => [u.id, playerName({ ...u, rsn: rsns.get(u.id) ?? null })]));
    // Lines completed for no points (a 0-point Line) aren't awards, but were still completed.
    const lineCompletions = [...names.keys()].flatMap((teamId) => progress.get(teamId)!.nodeStates.filter((s) => lineNodeIds.has(s.nodeId)).map((s) => ({ teamId, nodeId: s.nodeId, at: s.completedAt })));
    const lines = lineCompletions
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map(({ teamId, nodeId, at }) => {
        const credit = lineCredits.find((l) => l.teamId === teamId && l.credit.nodeId === nodeId)?.credit;
        return {
          line: labels.get(nodeId)?.label.replace(/ line bonus$/, "") ?? "Line",
          team: names.get(teamId)!,
          completedAtHours: hoursFrom(start, at),
          points: credit?.points ?? 0,
          pointsShares: (credit?.shares ?? []).map((s) => ({ player: nameOf.get(s.userId) ?? "Unknown", points: round2(s.points) })).sort((a, b) => b.points - a.points),
        };
      });

    const stages = db
      .select({ from: stageTransitions.fromStage, to: stageTransitions.toStage, at: stageTransitions.createdAt })
      .from(stageTransitions)
      .where(eq(stageTransitions.bingoId, bingo.id))
      .orderBy(asc(stageTransitions.createdAt))
      .all()
      .map((s) => ({ ...s, at: s.at.toISOString() }));

    return {
      bingo: { slug: bingo.slug, name: bingo.name, stage: bingo.stage, finished: bingo.stage === "complete", historical: bingo.historical },
      timing: {
        startedAt: start?.toISOString() ?? null,
        endedAt: end?.toISOString() ?? null,
        durationHours: start ? hoursFrom(start, end ?? now()) : null,
        scheduled: { startsAt: bingo.startsAt?.toISOString() ?? null, endsAt: bingo.endsAt?.toISOString() ?? null },
      },
      standingsSource: ranked.source,
      standings,
      teams: teamsOut,
      pointsOverTime,
      lines,
      stages,
    };
  },
});
