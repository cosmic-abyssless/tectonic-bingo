// Effort (CONTEXT.md "Effort"): the Wise Old Man EHB a Player spent at the bosses of their Team's open Parts, whether
// or not they got anything, and their share of their Team's Effort. Recognition only: never points.
//
// Per Team: a Part is open from the Bingo's start until the Submission that completed it was made (Rewind's replay,
// submission time, so waiting for a Moderator isn't counted), or to the end if it never completed. Each Player's
// per-boss EHB comes from their stored snapshots: EHB gained between two snapshots is taken as earned evenly across
// the gap, and each slice of it goes to the Parts with that boss open over the slice, split evenly between them. Time at
// a boss no open Part needs is dropped. The baseline is gainsOf's, so Effort and the EHB Titles agree on where play
// begins. Only snapshots stored with per-boss EHB count.
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PlayerEffort } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, nodes, submissions, teamMembers, teams, tiles } from "../db/schema";
import { effectiveStartsAt, endedAt } from "./bingoStart";
import { effectiveBosses } from "./effortBossService";
import { applyExclusivity } from "./exclusivityService";
import { getFullGraph } from "./graphService";
import { getRecorded } from "./historicalService";
import { replayTeam } from "./rewindService";
import { loadTimelines, type StoredWomSnapshot } from "./womReadService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

export interface EffortResult {
  /** userId → PlayerEffort (byTile with tileIds). Players with no usable snapshots are absent (shown as null). */
  players: Map<string, PlayerEffort>;
  /** For StatsResponse.tileEffort. */
  tileEffort: { tileId: string; teamId: string; userId: string; hours: number }[];
}

/** One Player's Effort on one Part, unrounded. */
export interface PartEffortRow {
  teamId: string;
  userId: string;
  partId: string;
  tileId: string;
  hours: number;
  /** When the Team completed the Part (the deciding Submission's submission time), null if it never did. */
  completedAt: Date | null;
}

export interface PartEffort {
  /** Only Parts a Player has hours on. */
  rows: PartEffortRow[];
  /** Every Player with usable snapshots (so with an Effort, maybe 0): their Team and the latest snapshot counted. */
  players: Map<string, { teamId: string; asOf: Date }>;
}

/**
 * Each Player's hours per Part, the detail Effort is summed from. Null when Effort isn't recorded: a Bingo that hasn't
 * started, a Historical Bingo without Submissions or snapshots, or one whose snapshots all lack per-boss EHB.
 */
export function computePartEffort(db: Db, bingo: Bingo): PartEffort | null {
  if (bingo.stage !== "live" && bingo.stage !== "complete") return null;
  const start = effectiveStartsAt(db, bingo);
  if (!start || start.getTime() > Date.now()) return null;
  if (bingo.historical) {
    const recorded = getRecorded(db, bingo.id);
    if (!recorded.submissions || !recorded.womSnapshots) return null;
  }
  const timelines = new Map<string, StoredWomSnapshot[]>();
  for (const [userId, timeline] of loadTimelines(db, bingo.id)) {
    const usable = timeline.filter((s) => s.hasBossEhb);
    if (usable.length) timelines.set(userId, usable);
  }
  if (timelines.size === 0) return null;
  const end = endedAt(db, bingo);

  const graph = getFullGraph(db, bingo.id);
  const tileOfPart = new Map<string, string>();
  for (const tile of db.select({ id: tiles.id, nodeId: tiles.nodeId }).from(tiles).where(eq(tiles.bingoId, bingo.id)).all()) {
    for (const partId of graph.childrenOf.get(tile.nodeId) ?? []) if (!tileOfPart.has(partId)) tileOfPart.set(partId, tile.id);
  }
  const partsOf = new Map<string, string[]>();
  for (const [partId, metrics] of effectiveBosses(db, bingo.id)) {
    for (const metric of metrics) partsOf.set(metric, [...(partsOf.get(metric) ?? []), partId]);
  }

  const teamIds = db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.bingoId, bingo.id))
    .all()
    .map((t) => t.id);
  const teamByUser = teamsOfPlayers(db, teamIds);
  const result: PartEffort = { rows: [], players: new Map() };
  for (const teamId of teamIds) {
    const completedAt = teamCompletions(db, bingo.id, teamId, graph);
    for (const [userId, timeline] of timelines) {
      if (teamByUser.get(userId) !== teamId) continue;
      const counted = playerHours(timeline, start, end, partsOf, completedAt);
      if (!counted) continue;
      result.players.set(userId, { teamId, asOf: counted.asOf });
      for (const [partId, hours] of counted.byPart) {
        result.rows.push({ teamId, userId, partId, tileId: tileOfPart.get(partId)!, hours, completedAt: completedAt.get(partId) ?? null });
      }
    }
  }
  return result;
}

/** Every Player's Effort in a Bingo, and each Tile's by Player. Null when not recorded (computePartEffort). */
export function computeEffort(db: Db, bingo: Bingo): EffortResult | null {
  const detail = computePartEffort(db, bingo);
  if (!detail) return null;

  const hours = new Map<string, number>();
  const uncompleted = new Map<string, number>();
  const byTile = new Map<string, Map<string, number>>();
  const teamTotal = new Map<string, number>();
  const add = (m: Map<string, number>, key: string, by: number) => m.set(key, (m.get(key) ?? 0) + by);
  for (const row of detail.rows) {
    add(hours, row.userId, row.hours);
    if (!row.completedAt) add(uncompleted, row.userId, row.hours);
    const tilesOfUser = byTile.get(row.userId) ?? new Map<string, number>();
    byTile.set(row.userId, add(tilesOfUser, row.tileId, row.hours));
    add(teamTotal, row.teamId, row.hours);
  }

  const players = new Map<string, PlayerEffort>();
  const tileEffort: EffortResult["tileEffort"] = [];
  for (const [userId, { teamId, asOf }] of detail.players) {
    const total = teamTotal.get(teamId) ?? 0;
    const mine = hours.get(userId) ?? 0;
    const tilesOfUser = [...(byTile.get(userId) ?? [])]
      .filter(([, h]) => h > 0)
      .map(([tileId, h]) => ({ tileId, hours: h }))
      .sort((a, b) => b.hours - a.hours || a.tileId.localeCompare(b.tileId));
    players.set(userId, {
      hours: mine,
      share: total > 0 ? (mine / total) * 100 : null,
      uncompletedHours: uncompleted.get(userId) ?? 0,
      byTile: tilesOfUser,
      asOf: asOf.toISOString(),
    });
    for (const t of tilesOfUser) tileEffort.push({ tileId: t.tileId, teamId, userId, hours: t.hours });
  }
  return { players, tileEffort };
}

/**
 * Each Player's Team: its members, and anyone who made one of its Submissions but has since been removed, as Points
 * share counts them.
 */
function teamsOfPlayers(db: Db, teamIds: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (teamIds.length === 0) return out;
  for (const m of db.select({ userId: teamMembers.userId, teamId: teamMembers.teamId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all()) {
    out.set(m.userId, m.teamId);
  }
  const submitters = db
    .select({ userId: submissions.submittedByUserId, teamId: submissions.teamId })
    .from(submissions)
    .where(inArray(submissions.teamId, teamIds))
    .orderBy(submissions.submittedAt)
    .all();
  for (const s of submitters) if (!out.has(s.userId)) out.set(s.userId, s.teamId);
  return out;
}

/**
 * When the Team completed each node, by the deciding Submission's submission time (Rewind's replay), over the Claims
 * the real scoring counts (scoringService.scoreTeam: approved, on nodes still on the board, exclusivity by approval).
 */
function teamCompletions(db: Db, bingoId: string, teamId: string, graph: ReturnType<typeof getFullGraph>): Map<string, Date> {
  const rows = db
    .select({
      submissionId: submissions.id,
      submittedAt: submissions.submittedAt,
      reviewedAt: submissions.reviewedAt,
      nodeId: claims.nodeId,
      itemName: claims.itemName,
      quantity: claims.quantity,
    })
    .from(claims)
    .innerJoin(submissions, eq(claims.submissionId, submissions.id))
    .innerJoin(nodes, eq(claims.nodeId, nodes.id))
    .where(and(eq(submissions.teamId, teamId), eq(submissions.status, "approved"), eq(nodes.bingoId, bingoId), isNull(nodes.removedAt)))
    .all()
    .map((r) => ({ ...r, reviewedAt: r.reviewedAt ?? r.submittedAt }));
  const kept = applyExclusivity(db, bingoId, rows);
  const subs = new Map(rows.map((r) => [r.submissionId, { id: r.submissionId, submittedAt: r.submittedAt }]));
  const replayed = replayTeam(graph, [...subs.values()], kept);
  return new Map([...replayed.values()].map((n) => [n.nodeId, n.completedAt]));
}

/**
 * One Player's hours per Part from their usable snapshots (oldest first), or null with fewer than two to measure
 * between. The baseline is the last snapshot at or before the start, else the first; the last is the latest by the end.
 */
function playerHours(
  timeline: StoredWomSnapshot[],
  start: Date,
  end: Date | null,
  partsOf: Map<string, string[]>,
  completedAt: Map<string, Date>,
): { byPart: Map<string, number>; asOf: Date } | null {
  const upToEnd = end ? timeline.filter((s) => s.at <= end) : timeline;
  const baselineAt = (upToEnd.filter((s) => s.at <= start).at(-1) ?? upToEnd[0])?.at;
  const series = baselineAt ? upToEnd.filter((s) => s.at >= baselineAt) : [];
  if (series.length < 2) return null;

  const byPart = new Map<string, number>();
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]!;
    const b = series[i]!;
    // The first gap starts at the Bingo's start: what was gained before it is in the baseline's difference, as gainsOf.
    const from = Math.max(a.at.getTime(), start.getTime());
    const to = b.at.getTime();
    const gapLength = to - from;
    if (gapLength <= 0) continue;
    for (const [metric, ehb] of Object.entries(b.bossEhb)) {
      const gained = Math.max(0, (ehb ?? 0) - (a.bossEhb[metric] ?? 0));
      const parts = partsOf.get(metric);
      if (gained <= 0 || !parts) continue;
      // Cut the gap where one of this boss's Parts completed, and share each piece among the Parts open over it.
      const cuts = [...new Set(parts.map((p) => completedAt.get(p)?.getTime()).filter((t): t is number => t !== undefined && t > from && t < to))];
      const edges = [from, ...cuts.sort((x, y) => x - y), to];
      for (let j = 1; j < edges.length; j++) {
        const pieceEnd = edges[j]!;
        const open = parts.filter((p) => {
          const done = completedAt.get(p)?.getTime();
          return done === undefined || done >= pieceEnd;
        });
        if (open.length === 0) continue;
        const each = (gained * ((pieceEnd - edges[j - 1]!) / gapLength)) / open.length;
        for (const p of open) byPart.set(p, (byPart.get(p) ?? 0) + each);
      }
    }
  }
  return { byPart, asOf: series.at(-1)!.at };
}
