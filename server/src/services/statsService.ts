import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoLines, nodeEdges, nodes, stageTransitions, submissions, teamNodeState, teamPointAdjustments, teams, tiles, users } from "../db/schema";
import { findAncestorIds } from "./graphService";
import { rsnsInBingo } from "./playerNames";

type Db = BetterSQLite3Database<typeof schema>;

type MinimalUser = Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick"> & { rsn?: string | null };
const MINIMAL_USER_COLS = { id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick };

export interface PointsOverTimePoint {
  at: Date;
  teamId: string;
  source: "node" | "adjustment";
  label: string;
  delta: number;
  cumulativePoints: number;
}

type NodeLabel = { kind: "line" | "tile" | "task"; label: string };

// A human name for each scoring node: a line bonus ("row 2 line bonus"), a tile's own bonus (the tile's name), or a
// task under a tile ("ZULRAH — Page 1"). Shared by the points chart and the timeline so they read the same.
function labelNodes(db: Db, bingoId: string, nodeIds: string[]): Map<string, NodeLabel> {
  const nodeRows = nodeIds.length ? db.select().from(nodes).where(inArray(nodes.id, nodeIds)).all() : [];
  const nodeById = new Map(nodeRows.map((n) => [n.id, n]));
  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
  const lineRows = db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
  const lineByNodeId = new Map(lineRows.map((l) => [l.nodeId, l]));

  const labels = new Map<string, NodeLabel>();
  for (const nodeId of nodeIds) {
    const line = lineByNodeId.get(nodeId);
    if (line) {
      labels.set(nodeId, { kind: "line", label: `${line.lineType} ${line.lineIndex + 1} line bonus` });
      continue;
    }
    const directTile = tileByNodeId.get(nodeId);
    if (directTile) {
      labels.set(nodeId, { kind: "tile", label: directTile.name });
      continue;
    }
    const node = nodeById.get(nodeId);
    const ancestorTile = [...findAncestorIds(db, nodeId)].map((id) => tileByNodeId.get(id)).find((t): t is NonNullable<typeof t> => !!t);
    labels.set(nodeId, { kind: "task", label: ancestorTile ? `${ancestorTile.name} — ${node?.label ?? "Task"}` : node?.label ?? "Bonus" });
  }
  return labels;
}

// Chronological, per-team-running-total reconstruction of every point-scoring
// event — the exact same rows teamService.getTeamProgress sums for its
// totalPoints, just timestamped and ordered, so a team's final
// cumulativePoints here always reconciles with its scoreboard total. Only
// events that moved the total are included: a node completed for no points
// (an item, a gated part) isn't a scoring event.
export function getPointsOverTime(db: Db, bingoId: string): PointsOverTimePoint[] {
  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) return [];

  const stateRows = db.select().from(teamNodeState).where(inArray(teamNodeState.teamId, teamIds)).all();
  const labels = labelNodes(db, bingoId, [...new Set(stateRows.map((r) => r.nodeId))]);

  const nodeEvents = stateRows.map((r) => ({ at: r.completedAt, teamId: r.teamId, source: "node" as const, label: labels.get(r.nodeId)!.label, delta: r.pointsAwarded }));

  const adjustmentRows = db.select().from(teamPointAdjustments).where(eq(teamPointAdjustments.bingoId, bingoId)).all();
  const adjustmentEvents = adjustmentRows.map((a) => ({ at: a.createdAt, teamId: a.teamId, source: "adjustment" as const, label: a.reason, delta: a.amount }));

  const all = [...nodeEvents, ...adjustmentEvents].filter((e) => e.delta !== 0).sort((a, b) => a.at.getTime() - b.at.getTime());

  const running = new Map<string, number>();
  return all.map((e) => {
    const cumulativePoints = (running.get(e.teamId) ?? 0) + e.delta;
    running.set(e.teamId, cumulativePoints);
    return { ...e, cumulativePoints };
  });
}

export interface TimelineEvent {
  at: Date;
  type: "points_earned" | "line_completed" | "point_adjustment" | "first_completion" | "stage_changed";
  label: string;
  teamId: string | null;
}

// What happened, in a stats context: every award of points (a task or tile completed, a line bonus, a mod's
// adjustment) plus the bingo starting and ending. `first_completion` is a mod-only extra (see getStatsForViewer).
// Draft picks are not here: they belong to the draft room and the audit log.
export function getTimeline(db: Db, bingoId: string): TimelineEvent[] {
  const stageEvents: TimelineEvent[] = db
    .select()
    .from(stageTransitions)
    .where(eq(stageTransitions.bingoId, bingoId))
    .all()
    .filter((s) => s.toStage === "live" || s.toStage === "complete")
    .map((s) => ({ at: s.createdAt, type: "stage_changed", label: s.toStage === "live" ? "The bingo went live" : "The bingo ended", teamId: null }));

  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
  const teamById = new Map(teamRows.map((t) => [t.id, t]));
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) return stageEvents.sort((a, b) => a.at.getTime() - b.at.getTime());
  const teamName = (teamId: string) => teamById.get(teamId)?.name ?? "A team";

  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
  const tileNodeIds = tileRows.map((t) => t.nodeId);

  // Everything that earned points. A node completed with nothing awarded (a gated part, a container) isn't an award.
  const awards = db.select().from(teamNodeState).where(inArray(teamNodeState.teamId, teamIds)).all().filter((r) => r.pointsAwarded > 0);
  const labels = labelNodes(db, bingoId, [...new Set(awards.map((r) => r.nodeId))]);
  const awardEvents: TimelineEvent[] = awards.map((r) => {
    const { kind, label } = labels.get(r.nodeId)!;
    const team = teamName(r.teamId);
    if (kind === "line") return { at: r.completedAt, type: "line_completed", teamId: r.teamId, label: `${team} earned the ${label} (+${r.pointsAwarded})` };
    const what = kind === "tile" ? `the ${label} tile bonus` : label;
    return { at: r.completedAt, type: "points_earned", teamId: r.teamId, label: `${team} ${kind === "tile" ? "earned" : "completed"} ${what} (+${r.pointsAwarded})` };
  });

  const adjustmentEvents: TimelineEvent[] = db
    .select()
    .from(teamPointAdjustments)
    .where(eq(teamPointAdjustments.bingoId, bingoId))
    .all()
    .map((a) => ({
      at: a.createdAt,
      type: "point_adjustment",
      teamId: a.teamId,
      label: `${teamName(a.teamId)} got ${a.amount > 0 ? "+" : ""}${a.amount} from a moderator: ${a.reason}`,
    }));

  // "Task" here means any node that's a direct child of a tile's node.
  const taskEdges = tileNodeIds.length ? db.select({ parentId: nodeEdges.parentId, childId: nodeEdges.childId }).from(nodeEdges).where(inArray(nodeEdges.parentId, tileNodeIds)).all() : [];
  const taskNodeIds = taskEdges.map((e) => e.childId);
  const tileIdByTaskNode = new Map(taskEdges.map((e) => [e.childId, e.parentId]));
  const taskNodeRows = taskNodeIds.length ? db.select().from(nodes).where(inArray(nodes.id, taskNodeIds)).all() : [];
  const taskNodeById = new Map(taskNodeRows.map((n) => [n.id, n]));

  const taskStateRows = taskNodeIds.length
    ? db.select().from(teamNodeState).where(and(inArray(teamNodeState.teamId, teamIds), inArray(teamNodeState.nodeId, taskNodeIds))).all()
    : [];
  const firstByTask = new Map<string, (typeof taskStateRows)[number]>();
  for (const r of taskStateRows) {
    const existing = firstByTask.get(r.nodeId);
    if (!existing || r.completedAt.getTime() < existing.completedAt.getTime()) firstByTask.set(r.nodeId, r);
  }
  const firstEvents: TimelineEvent[] = [...firstByTask.values()].map((r) => {
    const tile = tileByNodeId.get(tileIdByTaskNode.get(r.nodeId)!);
    const node = taskNodeById.get(r.nodeId);
    return {
      at: r.completedAt,
      type: "first_completion",
      teamId: r.teamId,
      label: `${teamName(r.teamId)} was first to complete ${tile?.name ?? ""} — ${node?.label ?? "Task"}`,
    };
  });

  return [...stageEvents, ...awardEvents, ...adjustmentEvents, ...firstEvents].sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface ContributionCount {
  userId: string;
  user: MinimalUser;
  teamId: string;
  approvedSubmissions: number;
}

// How many approved submissions each player personally submitted — a rough
// "who did the work" ranking, distinct from the team-level scoreboard.
export function getContributionCounts(db: Db, bingoId: string): ContributionCount[] {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  if (teamIds.length === 0) return [];

  const rows = db
    .select({ userId: submissions.submittedByUserId, teamId: submissions.teamId })
    .from(submissions)
    .where(and(inArray(submissions.teamId, teamIds), eq(submissions.status, "approved")))
    .all();

  const counts = new Map<string, { teamId: string; count: number }>();
  for (const r of rows) {
    const existing = counts.get(r.userId);
    if (existing) existing.count += 1;
    else counts.set(r.userId, { teamId: r.teamId, count: 1 });
  }

  const userIds = [...counts.keys()];
  const userRows = userIds.length ? db.select(MINIMAL_USER_COLS).from(users).where(inArray(users.id, userIds)).all() : [];
  const rsns = rsnsInBingo(db, bingoId, userIds);
  const userById = new Map(userRows.map((u) => [u.id, { ...u, rsn: rsns.get(u.id) ?? null }]));

  return userIds
    .map((userId) => ({ userId, user: userById.get(userId)!, teamId: counts.get(userId)!.teamId, approvedSubmissions: counts.get(userId)!.count }))
    .sort((a, b) => b.approvedSubmissions - a.approvedSubmissions);
}

export interface Stats {
  pointsOverTime: PointsOverTimePoint[];
  timeline: TimelineEvent[];
  contributions: ContributionCount[];
  heatmap: TileHeatmapCell[];
}

export function getStats(db: Db, bingoId: string): Stats {
  return {
    pointsOverTime: getPointsOverTime(db, bingoId),
    timeline: getTimeline(db, bingoId),
    contributions: getContributionCounts(db, bingoId),
    heatmap: getTileHeatmap(db, bingoId),
  };
}

// What a player may see while the bingo is live: only their own team's rows.
// Stage changes (teamId null) and other teams' draft picks drop out of the
// timeline along with everything else that isn't theirs.
export function filterStatsForTeam(stats: Stats, teamId: string): Stats {
  const own = <T extends { teamId: string | null }>(rows: T[]) => rows.filter((r) => r.teamId === teamId);
  return { pointsOverTime: own(stats.pointsOverTime), timeline: own(stats.timeline), contributions: own(stats.contributions), heatmap: own(stats.heatmap) };
}

// "Team X was first to complete Y" tells every other team what has and hasn't been done yet, so it is for mods
// only: players never get it, live or after the bingo.
function withoutFirstCompletions(stats: Stats): Stats {
  return { ...stats, timeline: stats.timeline.filter((e) => e.type !== "first_completion") };
}

/**
 * The stats one viewer may see. Mods get everything. Anyone else loses the first-completion events, and a player
 * still in the running (`teamId` set) sees only their own team's rows.
 */
export function getStatsForViewer(db: Db, bingoId: string, viewer: { isMod: boolean; teamId: string | null }): Stats {
  const stats = getStats(db, bingoId);
  if (viewer.isMod) return stats;
  const visible = withoutFirstCompletions(stats);
  return viewer.teamId ? filterStatsForTeam(visible, viewer.teamId) : visible;
}

export interface TileHeatmapCell {
  tileId: string;
  teamId: string;
  completedTasks: number;
  totalTasks: number;
}

// One cell per (team, tile) — completedTasks/totalTasks lets the client shade
// by completion fraction rather than a binary done/not-done. "Task" again
// means a direct child of the tile's node.
export function getTileHeatmap(db: Db, bingoId: string): TileHeatmapCell[] {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileIds = tileRows.map((t) => t.id);
  if (teamIds.length === 0 || tileIds.length === 0) return [];

  const tileIdByNodeId = new Map(tileRows.map((t) => [t.nodeId, t.id]));
  const tileNodeIds = tileRows.map((t) => t.nodeId);
  const taskEdges = db.select({ parentId: nodeEdges.parentId, childId: nodeEdges.childId }).from(nodeEdges).where(inArray(nodeEdges.parentId, tileNodeIds)).all();
  const taskIds = taskEdges.map((e) => e.childId);
  const tileByTask = new Map(taskEdges.map((e) => [e.childId, tileIdByNodeId.get(e.parentId)!]));
  const totalTasksByTile = new Map<string, number>();
  for (const e of taskEdges) {
    const tileId = tileIdByNodeId.get(e.parentId)!;
    totalTasksByTile.set(tileId, (totalTasksByTile.get(tileId) ?? 0) + 1);
  }

  const progressRows = taskIds.length
    ? db.select({ teamId: teamNodeState.teamId, nodeId: teamNodeState.nodeId }).from(teamNodeState).where(and(inArray(teamNodeState.teamId, teamIds), inArray(teamNodeState.nodeId, taskIds))).all()
    : [];

  const completedByTeamTile = new Map<string, number>();
  for (const p of progressRows) {
    const tileId = tileByTask.get(p.nodeId)!;
    const key = `${p.teamId}:${tileId}`;
    completedByTeamTile.set(key, (completedByTeamTile.get(key) ?? 0) + 1);
  }

  const cells: TileHeatmapCell[] = [];
  for (const teamId of teamIds) {
    for (const tileId of tileIds) {
      cells.push({ tileId, teamId, completedTasks: completedByTeamTile.get(`${teamId}:${tileId}`) ?? 0, totalTasks: totalTasksByTile.get(tileId) ?? 0 });
    }
  }
  return cells;
}
