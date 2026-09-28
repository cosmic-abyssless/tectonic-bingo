import { asc, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { playerName } from "@bingo/shared";
import { bingoLines, stageTransitions, users } from "../../db/schema";
import { now } from "../../clock";
import { rsnsInBingo } from "../../services/playerNames";
import { getPointsOverTime, getTeamCredits, getTeamGpGained, labelNodes } from "../../services/statsService";
import { getTeamProgress } from "../../services/teamService";
import { defineTool } from "../tool";
import { bingoBySlug, bingoIdForSlug, bingoSpan, hoursFrom, round2, slugInput, teamNames } from "./common";

/** The most buckets the points-over-time series has: a longer Bingo gets wider buckets. */
const MAX_BUCKETS = 400;

export const bingoSummary = defineTool({
  name: "bingo_summary",
  title: "Bingo summary",
  description:
    "One Bingo at a glance. standings: each Team's points (final once the Bingo is Finished, else current), ranked, with its Total drop value (gpGained). " +
    "pointsOverTime: each Team's cumulative points at the end of each bucket of bucketHours from the start (the last bucket ends at the Bingo's end, or now while it's Live). " +
    "lines: every Line completed, by which Team, when (hours from the start) and each Player's Points share of its bonus. " +
    "stages: every Stage change with its time, and when the Bingo started and ended. Points include Point adjustments, as the scoreboard does.",
  input: z.object({
    slug: slugInput,
    bucketHours: z.number().positive().optional().describe("Width of each points-over-time bucket in hours (default 1; widened when the Bingo is too long for 400 buckets)."),
  }),
  bingoIdFor: bingoIdForSlug,
  run: ({ slug, bucketHours }, { db }) => {
    const bingo = bingoBySlug(db, slug);
    const { start, end } = bingoSpan(db, bingo);
    const names = teamNames(db, bingo.id);
    const progress = new Map([...names.keys()].map((id) => [id, getTeamProgress(db, id)]));
    const gp = new Map(getTeamGpGained(db, bingo.id).map((t) => [t.teamId, t.gpGained]));

    const ranked = [...names].map(([id, name]) => ({ id, name, points: progress.get(id)!.totalPoints })).sort((a, b) => b.points - a.points);
    const standings = ranked.map((t) => ({ rank: ranked.filter((o) => o.points > t.points).length + 1, team: t.name, points: t.points, gpGained: gp.get(t.id) ?? 0 }));

    // Cumulative points per Team at each bucket's end. Anything scored before the start lands in the first bucket, and
    // anything after the end (a late Point adjustment) in the last, so the last bucket always matches the standings.
    const events = getPointsOverTime(db, bingo.id);
    let pointsOverTime: { bucketHours: number; teams: string[]; buckets: { endsAtHours: number; points: number[] }[] } | null = null;
    if (start) {
      const lastAt = Math.max(end?.getTime() ?? now().getTime(), ...events.map((e) => e.at.getTime()));
      const spanHours = Math.max(0, (lastAt - start.getTime()) / 3_600_000);
      const width = Math.max(bucketHours ?? 1, Math.ceil(spanHours / MAX_BUCKETS));
      const count = Math.max(1, Math.ceil(spanHours / width));
      const teamIds = ranked.map((t) => t.id);
      const running = new Map(teamIds.map((id) => [id, 0]));
      const buckets: { endsAtHours: number; points: number[] }[] = [];
      let i = 0;
      for (let b = 1; b <= count; b++) {
        const bucketEnd = b === count ? Infinity : start.getTime() + b * width * 3_600_000;
        for (; i < events.length && events[i]!.at.getTime() <= bucketEnd; i++) running.set(events[i]!.teamId, events[i]!.cumulativePoints);
        buckets.push({ endsAtHours: round2(Math.min(b * width, spanHours)), points: teamIds.map((id) => running.get(id) ?? 0) });
      }
      pointsOverTime = { bucketHours: width, teams: ranked.map((t) => t.name), buckets };
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
      bingo: { slug: bingo.slug, name: bingo.name, stage: bingo.stage, finished: bingo.stage === "complete" },
      timing: {
        startedAt: start?.toISOString() ?? null,
        endedAt: end?.toISOString() ?? null,
        durationHours: start ? hoursFrom(start, end ?? now()) : null,
        scheduled: { startsAt: bingo.startsAt?.toISOString() ?? null, endsAt: bingo.endsAt?.toISOString() ?? null },
      },
      standings,
      pointsOverTime,
      lines,
      stages,
    };
  },
});
