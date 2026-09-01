import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  bingoLines, draftPicks, stageTransitions, submissions, teamCompletedLines,
  teamPointAdjustments, teamTaskProgress, teams, tileTasks, tiles, users,
} from "../db/schema";

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
  source: "task" | "line" | "adjustment";
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

  const taskRows = db
    .select({ teamId: teamTaskProgress.teamId, pointsAwarded: teamTaskProgress.pointsAwarded, completedAt: teamTaskProgress.completedAt, taskLabel: tileTasks.label, tileName: tiles.name })
    .from(teamTaskProgress)
    .innerJoin(tileTasks, eq(teamTaskProgress.taskId, tileTasks.id))
    .innerJoin(tiles, eq(tileTasks.tileId, tiles.id))
    .where(and(inArray(teamTaskProgress.teamId, teamIds), eq(teamTaskProgress.status, "completed")))
    .all();
  const taskEvents = taskRows
    .filter((r) => r.completedAt)
    .map((r) => ({ at: r.completedAt as Date, teamId: r.teamId, source: "task" as const, label: `${r.tileName} — ${r.taskLabel}`, delta: r.pointsAwarded }));

  const lineRows = db
    .select({ teamId: teamCompletedLines.teamId, completedAt: teamCompletedLines.completedAt, lineType: bingoLines.lineType, lineIndex: bingoLines.lineIndex, points: bingoLines.points })
    .from(teamCompletedLines)
    .innerJoin(bingoLines, eq(teamCompletedLines.bingoLineId, bingoLines.id))
    .where(inArray(teamCompletedLines.teamId, teamIds))
    .all();
  const lineEvents = lineRows.map((r) => ({
    at: r.completedAt,
    teamId: r.teamId,
    source: "line" as const,
    label: `${r.lineType} ${r.lineIndex + 1} line bonus`,
    delta: r.points,
  }));

  const adjustmentRows = db.select().from(teamPointAdjustments).where(eq(teamPointAdjustments.bingoId, bingoId)).all();
  const adjustmentEvents = adjustmentRows.map((a) => ({ at: a.createdAt, teamId: a.teamId, source: "adjustment" as const, label: a.reason, delta: a.amount }));

  const all = [...taskEvents, ...lineEvents, ...adjustmentEvents].sort((a, b) => a.at.getTime() - b.at.getTime());

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

  const lineRows = db
    .select({ teamId: teamCompletedLines.teamId, completedAt: teamCompletedLines.completedAt, lineType: bingoLines.lineType, lineIndex: bingoLines.lineIndex, points: bingoLines.points })
    .from(teamCompletedLines)
    .innerJoin(bingoLines, eq(teamCompletedLines.bingoLineId, bingoLines.id))
    .where(inArray(teamCompletedLines.teamId, teamIds))
    .all();
  const lineEvents: TimelineEvent[] = lineRows.map((r) => ({
    at: r.completedAt,
    type: "line_completed",
    teamId: r.teamId,
    label: `${teamById.get(r.teamId)?.name ?? "A team"} completed a ${r.lineType} line (+${r.points})`,
  }));

  const taskRows = db
    .select({ teamId: teamTaskProgress.teamId, taskId: teamTaskProgress.taskId, completedAt: teamTaskProgress.completedAt, taskLabel: tileTasks.label, tileName: tiles.name })
    .from(teamTaskProgress)
    .innerJoin(tileTasks, eq(teamTaskProgress.taskId, tileTasks.id))
    .innerJoin(tiles, eq(tileTasks.tileId, tiles.id))
    .where(and(inArray(teamTaskProgress.teamId, teamIds), eq(teamTaskProgress.status, "completed")))
    .all()
    .filter((r) => r.completedAt);

  const firstByTask = new Map<string, (typeof taskRows)[number]>();
  for (const r of taskRows) {
    const existing = firstByTask.get(r.taskId);
    if (!existing || r.completedAt!.getTime() < existing.completedAt!.getTime()) firstByTask.set(r.taskId, r);
  }
  const firstEvents: TimelineEvent[] = [...firstByTask.values()].map((r) => ({
    at: r.completedAt as Date,
    type: "first_completion",
    teamId: r.teamId,
    label: `${teamById.get(r.teamId)?.name ?? "A team"} was first to complete ${r.tileName} — ${r.taskLabel}`,
  }));

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
// by completion fraction rather than a binary done/not-done.
export function getTileHeatmap(db: Db, bingoId: string): TileHeatmapCell[] {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  const tileIds = db.select({ id: tiles.id }).from(tiles).where(eq(tiles.bingoId, bingoId)).all().map((t) => t.id);
  if (teamIds.length === 0 || tileIds.length === 0) return [];

  const taskRows = db.select({ id: tileTasks.id, tileId: tileTasks.tileId }).from(tileTasks).where(inArray(tileTasks.tileId, tileIds)).all();
  const taskIds = taskRows.map((t) => t.id);
  const tileByTask = new Map(taskRows.map((t) => [t.id, t.tileId]));
  const totalTasksByTile = new Map<string, number>();
  for (const t of taskRows) totalTasksByTile.set(t.tileId, (totalTasksByTile.get(t.tileId) ?? 0) + 1);

  const progressRows = taskIds.length
    ? db
        .select({ teamId: teamTaskProgress.teamId, taskId: teamTaskProgress.taskId })
        .from(teamTaskProgress)
        .where(and(inArray(teamTaskProgress.teamId, teamIds), inArray(teamTaskProgress.taskId, taskIds), eq(teamTaskProgress.status, "completed")))
        .all()
    : [];

  const completedByTeamTile = new Map<string, number>();
  for (const p of progressRows) {
    const tileId = tileByTask.get(p.taskId)!;
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
