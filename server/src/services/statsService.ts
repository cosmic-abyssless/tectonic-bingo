import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoLines, draftPicks, nodeEdges, nodes, stageTransitions, submissions, teamNodeState, teamPointAdjustments, teams, tiles, users } from "../db/schema";
import { findAncestorIds } from "./graphService";

type Db = BetterSQLite3Database<typeof schema>;

type MinimalUser = Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick">;
const MINIMAL_USER_COLS = { id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick };

/** guild nick → global display name → username, mirroring client/src/core/ui/user.ts */
function displayName(user: MinimalUser): string {
  return user.discordGuildNick ?? user.discordGlobalName ?? user.discordUsername;
}

export interface PointsOverTimePoint {
  at: Date;
  teamId: string;
  source: "node" | "adjustment";
  label: string;
  delta: number;
  cumulativePoints: number;
}

// Chronological, per-team-running-total reconstruction of every point-scoring
// event — the exact same rows teamService.getTeamProgress sums for its
// totalPoints, just timestamped and ordered, so a team's final
// cumulativePoints here always reconciles with its scoreboard total.
export function getPointsOverTime(db: Db, bingoId: string): PointsOverTimePoint[] {
  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) return [];

  const stateRows = db.select().from(teamNodeState).where(inArray(teamNodeState.teamId, teamIds)).all();
  const nodeIds = [...new Set(stateRows.map((r) => r.nodeId))];
  const nodeRows = nodeIds.length ? db.select().from(nodes).where(inArray(nodes.id, nodeIds)).all() : [];
  const nodeById = new Map(nodeRows.map((n) => [n.id, n]));

  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
  const lineRows = db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
  const lineByNodeId = new Map(lineRows.map((l) => [l.nodeId, l]));

  function labelFor(nodeId: string): string {
    const line = lineByNodeId.get(nodeId);
    if (line) return `${line.lineType} ${line.lineIndex + 1} line bonus`;
    const directTile = tileByNodeId.get(nodeId);
    const node = nodeById.get(nodeId);
    if (directTile) return directTile.name;
    const ancestorTile = [...findAncestorIds(db, nodeId)].map((id) => tileByNodeId.get(id)).find((t): t is NonNullable<typeof t> => !!t);
    return ancestorTile ? `${ancestorTile.name} — ${node?.label ?? "Task"}` : node?.label ?? "Bonus";
  }

  const nodeEvents = stateRows.map((r) => ({ at: r.completedAt, teamId: r.teamId, source: "node" as const, label: labelFor(r.nodeId), delta: r.pointsAwarded }));

  const adjustmentRows = db.select().from(teamPointAdjustments).where(eq(teamPointAdjustments.bingoId, bingoId)).all();
  const adjustmentEvents = adjustmentRows.map((a) => ({ at: a.createdAt, teamId: a.teamId, source: "adjustment" as const, label: a.reason, delta: a.amount }));

  const all = [...nodeEvents, ...adjustmentEvents].sort((a, b) => a.at.getTime() - b.at.getTime());

  const running = new Map<string, number>();
  return all.map((e) => {
    const cumulativePoints = (running.get(e.teamId) ?? 0) + e.delta;
    running.set(e.teamId, cumulativePoints);
    return { ...e, cumulativePoints };
  });
}

export interface TimelineEvent {
  at: Date;
  type: "stage_changed" | "draft_pick" | "line_completed" | "first_completion";
  label: string;
  teamId: string | null;
}

export function getTimeline(db: Db, bingoId: string): TimelineEvent[] {
  const stageEvents: TimelineEvent[] = db
    .select()
    .from(stageTransitions)
    .where(eq(stageTransitions.bingoId, bingoId))
    .all()
    .map((s) => ({ at: s.createdAt, type: "stage_changed", label: `Advanced from ${s.fromStage} to ${s.toStage}`, teamId: null }));

  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
  const teamById = new Map(teamRows.map((t) => [t.id, t]));
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) return stageEvents.sort((a, b) => a.at.getTime() - b.at.getTime());

  const pickRows = db
    .select({ teamId: draftPicks.teamId, createdAt: draftPicks.createdAt, user: MINIMAL_USER_COLS })
    .from(draftPicks)
    .innerJoin(users, eq(draftPicks.userId, users.id))
    .where(inArray(draftPicks.teamId, teamIds))
    .all();
  const pickEvents: TimelineEvent[] = pickRows.map((r) => ({
    at: r.createdAt,
    type: "draft_pick",
    teamId: r.teamId,
    label: `${teamById.get(r.teamId)?.name ?? "A team"} drafted ${displayName(r.user)}`,
  }));

  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
  const tileNodeIds = tileRows.map((t) => t.nodeId);

  const lineRows = db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
  const lineByNodeId = new Map(lineRows.map((l) => [l.nodeId, l]));
  const lineNodeIds = lineRows.map((l) => l.nodeId);
  const lineStateRows = lineNodeIds.length
    ? db.select().from(teamNodeState).where(and(inArray(teamNodeState.teamId, teamIds), inArray(teamNodeState.nodeId, lineNodeIds))).all()
    : [];
  const lineEvents: TimelineEvent[] = lineStateRows.map((r) => {
    const line = lineByNodeId.get(r.nodeId)!;
    return {
      at: r.completedAt,
      type: "line_completed",
      teamId: r.teamId,
      label: `${teamById.get(r.teamId)?.name ?? "A team"} completed a ${line.lineType} line (+${r.pointsAwarded})`,
    };
  });

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
      label: `${teamById.get(r.teamId)?.name ?? "A team"} was first to complete ${tile?.name ?? ""} — ${node?.label ?? "Task"}`,
    };
  });

  return [...stageEvents, ...pickEvents, ...lineEvents, ...firstEvents].sort((a, b) => a.at.getTime() - b.at.getTime());
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
  const userById = new Map(userRows.map((u) => [u.id, u]));

  return userIds
    .map((userId) => ({ userId, user: userById.get(userId)!, teamId: counts.get(userId)!.teamId, approvedSubmissions: counts.get(userId)!.count }))
    .sort((a, b) => b.approvedSubmissions - a.approvedSubmissions);
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
